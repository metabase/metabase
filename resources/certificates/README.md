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
