#!/usr/bin/env node

'use strict'
const program = require('commander')
const Shell = require('node-powershell')
const fs = require('fs')
const forge = require('node-forge')
const {resolve} = require("path");
function uuidv4() { return 'xxxxxxxxxxxx4xxxyxxxxxxxxxxxxxxx'.replace(/[xy]/g, function(c) { var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8); return v.toString(16) }) }
// Its possible that we generate keys from node-forge and then import into key store
program.option('-d, --dns <host>', 'dns host for cert (\'some.domain.com\')', 'localhost')
program.option('-c, --cert <file>', 'output file for the cert ("./server.cert")', './server.cert')
program.option('-k, --key <file>', 'output file for the key ("./server.key")', './server.key')
program.option('-p, --pfx <file>', 'output file for the pfx ("./server.pfx")', './server.pfx')
program.option('-e, --exp <hours>', 'expiration in hours (24)', 24)
program.option('-x, --noclear', 'do not clear out previous generated certs')
program.option('-n, --name <certname>', 'friendly name to save as and lookup to try delete', 'win-cert-gen generated')
// Add a deletion option to help clear out old generated certs
program.password = uuidv4()
program.parse(process.argv)
if(!program.dns) {console.log('error: required option \'-d, --dns <host>\' not specified');program.outputHelp();process.exit(1)}
if(typeof program.exp !== 'number') program.exp = parseInt(program.exp) || 24
function BuildCommand(cmd, props) {function AddParameter(cmd, key, value) {cmd = cmd + ` -${key} ${value}`;return cmd} if(cmd === undefined || cmd === null) throw new Error('cmd must be defined'); if(typeof(props) !== 'object' || props.constructor !== Object) props = {}; let result = `${cmd}`;for (const key in props) if(props[key].constructor === Array) result = AddParameter(result, key, props[key].join(',')); else result = AddParameter(result, key, props[key]); return result }
program.name = program.name ?? 'win-cert-gen generated'
program.name = program.name.trim()
const friendlyName = program.name
function init(){
  const ps2 = new Shell({executionPolicy: 'Bypass'})
  console.log(`Writing cert ${program.dns} with exp in ${program.exp} hours named ${friendlyName}`)
  if(!program.noclear) {
    ps2.addCommand('$store = new-object System.Security.Cryptography.X509Certificates.X509Store([System.Security.Cryptography.X509Certificates.StoreName]::Root,"currentuser")')
    ps2.addCommand('$x=$store.Open("MaxAllowed")')
    if(!program.noclear) ps2.addCommand(`$x = $store.Certificates.where({$_.FriendlyName -eq '${friendlyName}'},'Default').foreach{$store.remove($_)}`)
    ps2.addCommand('$x=$store.Close();$x=$store.Dispose()')
    ps2.addCommand('$store = new-object System.Security.Cryptography.X509Certificates.X509Store([System.Security.Cryptography.X509Certificates.StoreName]::My,"currentuser")')
    ps2.addCommand('$x=$store.Open("MaxAllowed")')
    if(!program.noclear) ps2.addCommand(`$x = $store.Certificates.where({$_.FriendlyName -eq '${friendlyName}'},'Default').foreach{$store.remove($_)}`)
    ps2.addCommand('$x=$store.Close();$x=$store.Dispose()')
  }
  ps2.addCommand(BuildCommand('$rootCA = New-SelfSignedCertificate', {
    DnsName: `"${program.dns} Root Cert"`,
    KeyLength: 2048,
    KeyAlgorithm: 'RSA',
    HashAlgorithm : 'SHA256',
    KeyExportPolicy: 'NonExportable',
    NotAfter: `(Get-Date).AddHours(${program.exp})`,
    CertStoreLocation: 'cert:\\CurrentUser\\My',
    KeyUsage: ['CertSign'],
    FriendlyName: `"${friendlyName}"`
  }))
  ps2.addCommand(BuildCommand('$selfCert = New-SelfSignedCertificate', {
    DnsName: `"${program.dns}"`,
    Signer: '$rootCA',
    KeyLength: 2048,
    KeyAlgorithm: 'RSA',
    HashAlgorithm : 'SHA256',
    KeyExportPolicy: 'Exportable',
    NotAfter: `(Get-Date).AddHours(${program.exp})`,
    CertStoreLocation: 'cert:\\CurrentUser\\My',
    TextExtension: '@("2.5.29.37={text}1.3.6.1.5.5.7.3.1")',
    FriendlyName: `"${friendlyName}"`
  }))
  ps2.addCommand('$rootCert = [System.Security.Cryptography.X509Certificates.X509Certificate2]::New($rootCA.Export(1))')
  ps2.addCommand(`$rootCert.FriendlyName = "${friendlyName}"`)
  ps2.addCommand('$store = new-object System.Security.Cryptography.X509Certificates.X509Store([System.Security.Cryptography.X509Certificates.StoreName]::Root,"currentuser")')
  ps2.addCommand('$x=$store.Open("MaxAllowed");$x=$store.Add($rootCert);$x=$store.Close();$x = $store.Dispose()')
  ps2.addCommand('$store = new-object System.Security.Cryptography.X509Certificates.X509Store([System.Security.Cryptography.X509Certificates.StoreName]::My,"currentuser")')
  ps2.addCommand('$x=$store.Open("MaxAllowed");$x=$store.Remove($rootCA);$x=$store.Close();$x = $store.Dispose()')
  ps2.addCommand('$outCert = "-----BEGIN CERTIFICATE-----`r`n$([Convert]::ToBase64String($selfCert.Export(1), 0))`r`n-----END CERTIFICATE-----" -replace "(.{64})","`$1`r`n" -replace "(\\r\\n\\r\\n)","`r`n"')
  //// Export fromat is incorrect because it is not encrypted
  const pfxFilePath = resolve(program.pfx)
  console.log(`pfx path ${pfxFilePath}`)
  ps2.addCommand('$SecurePassword = ConvertTo-SecureString -String "'+program.password+'" -Force -AsPlainText')
  ps2.addCommand('Export-PfxCertificate -Cert $selfCert -FilePath "'+pfxFilePath+'" -Password $SecurePassword')
  ps2.addCommand('$outKey = "$([Convert]::ToBase64String($selfCert.Export(3, "'+program.password+'"), 0))"')
  ps2.addCommand('$result = [PSCustomObject]@{cert=$outCert; pfx=$outKey}')
  ps2.addCommand('$x=$selfCert.Reset();$x=$rootCA.Reset();$x=$rootCert.Reset()')
  ps2.addCommand('$result | ConvertTo-Json -Compress')
  ps2.invoke()
    .then(output => {
      try{
        let foundIndex = output.indexOf("{\"cert\"")
        if(foundIndex > -1){
          let jsonOutput = output.substring(foundIndex);
          let result = JSON.parse(jsonOutput)
          if(!result.cert || !result.pfx) throw new Error('failed to export cert')
          fs.writeFileSync(program.cert, result.cert)
          let p12Raw = forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(forge.util.decode64(result.pfx)), program.password || '')
          let oidShroudedPrivateKeyBag = '1.2.840.113549.1.12.10.1.2'
          let key = forge.pki.privateKeyToPem(p12Raw.getBags({ bagType: oidShroudedPrivateKeyBag })[oidShroudedPrivateKeyBag][0].key)
          fs.writeFileSync(program.key, key)
        }
        ps2.dispose()
        console.log(`Successfully wrote cert to ${program.cert}, key to ${program.key}, pfx to ${program.pfx} with password  ${program.password}`)
        process.exit()
      } catch(error) {console.log(error);ps2.dispose();process.exit(1)}
    })
    .catch(err => {console.log(err);ps2.dispose();process.exit(1)})
}
init()
