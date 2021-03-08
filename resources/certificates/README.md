This is a JKS trust store, which contains the AWS RDS root CA certificate (`rds-ca-2019-root.pem`). It was created by
following similar steps as those outlined
[here](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/UsingWithRDS.SSL.html), except that it adds the cert
to the default `cacerts` truststore that is shipped as part of OpenJDK 11, instead of a new/blank truststore. The
keystore password is: `metabase`
