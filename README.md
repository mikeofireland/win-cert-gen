# win-cert-gen
> Generates self-signed certs through powershell and adds them to the current users windows certificate store.  For local development testing only.

## Security Warnings
* __Use at your own risk__
* __Keep expiration as short as possible__
* __Clear out unused root certs as they are a user/machine vulnerability__

## Requirements
* powershell (tested on windows 10)
* node

## What?
* Clears out previously generated certs from the store. (--noclear option)
* Generates a rsa root cert and rsa cert signed by the root.
* Deletes the generated rsa rootCA private key
* Adds the rsa root cert (no private key) to the current users root certificate store.
* Adds the rsa cert to the current users personal store.
* Writes the rsa cert and key files to the current directory

## Why?
This is only made for local development testing when running a local web server.

This is tested using the generated keys on a node web server.

I would rather have developers do this than pass around an actual key signed by a real root CA.

## How?
install globally and run globally
``` bash
npm i -g win-cert-gen

win-cert-gen -d local.example.com -e 720
```

## Arguments
| Argument | Description | Default |
| -------- |:-----------:|:-------:|
| -d, --dns _domain_  | dns host for cert       | localhost |
| -c, --cert _file_ | output file for the cert  | ./server.cert |
| -k, --key _file_  | output file for the key   | ./server.key |
| -p, --pfx _file_  | output file for the pfx   | ./server.pfx |
| -e, --exp _hours_ | expiration in hours       | 24 |
| -x, --noclear       | do not clear out previous generated certs |  |
