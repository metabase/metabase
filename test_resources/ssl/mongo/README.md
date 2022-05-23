# SSL certificates for client authentication

## Keys and certificates

This folder contains keys (`*.key`) and certificates (`*.crt`) for a CA (`metaca`),
a client (`metabase`) and a server (`metamongo`). (The `*.pem` files here are
just the concatenation of the corresponding certificate and key files and are
used by mongo.) All certificates are signed by `metaca` and are bound to the
domain `localhost`.

## Re-generating the keys and certificates

The keys and certificates can be re-generated using the `generate.sh` script.
The script needs `openssl` to be available.

## Testing

The command
```shell
docker compose up
```
can be used to start a mongo server requiring SSL connections with client side
authentication. The server started like this accepts certificates signed by
`metaca` and identifies itself as specified by `metamongo.pem`.
