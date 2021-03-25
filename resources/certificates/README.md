# Directory Contents

## `rds_root_ca_truststore.jks`
This is a JKS trust store, which was created via
[these instructions](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/UsingWithRDS.SSL.html).  It contains the
latest RDS root CA (`rds-ca-2019-root.pem`) as of March 2021. The keystore password is: metabase

## `rds-combined-ca-bundle.pem`
This is simply a copy of the "combined" CA bundle from
[AWS](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/UsingWithRDS.SSL.html).
