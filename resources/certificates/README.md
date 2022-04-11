# Directory Contents

## `cacerts_with_RDS_root_ca.jks`
This is a JKS trust store, which was created by adding the RDS root CA (latest as of March 2021) to the built-in
`cacerts` file included with OpenJDK 11. It was added by following similar instructions as those outlined for
creating a new trust store file documented
[here](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/UsingWithRDS.SSL.html). The keystore password is:
`metabase`

## `rds-combined-ca-bundle.pem`
This is simply a copy of the "combined" CA bundle from
[AWS](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/UsingWithRDS.SSL.html).

## `rds_root_ca_truststore.jks`
This is a keystore that contains *only* the RDS root CA.  If you try to use it as the JVM-level truststore, you will probably get a lot of SSL related errors, but it should work in isolation for particular connections (ex: Oracle SSL connectivity).
