# Oracle certificates

These keystores are for running metabase in CI testing the Oracle driver
with SSL authentication. They are linked to the image
`metabase/qa-databases:oracle-xe-21.3` generated from the `metabase-qa`
repository (See the `dbs/oracle` folder).

The whole setup was created following
https://www.oracle.com/docs/tech/wp-oracle-jdbc-thin-ssl.pdf.

## Files

`keystore.p12` is a PKCS12 format keystore containing the private and public
keys of `CN=metabase,C=US`, as well as signed certificate from the CA contained
in the docker image.

`truststore.p12` is a PKCS12 format truststore containing the self-signed
certificate of the CA contained in the docker image.
