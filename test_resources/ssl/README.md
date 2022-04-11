# test certificates

These certs are test certificates for running a service as "localhost".

`ca-csr.json` is the CSR for generating the CA

`ca-key.pem` contains the CA's private key

`ca.pem` contains the CA's public key (this is what you need to "trust")

`server-csr.json` is the CSR for generating the server key

`server.key` contains a private key for a certificate for the `serverd` server

`server.pem` contains the public key for `server.key`

These were generated with [cfssl](https://github.com/cloudflare/cfssl)

CA generation:

```sh
cfssl genkey -initca ca-csr.json | cfssljson -bare -stdout
```

Server certificate generation:

```sh
cfssl gencert -ca ca.pem -ca-key ca-key.pem -hostname=127.0.0.1,localhost server-csr.json | cfssljson -bare -stdout
```
