## Files used by docker-compose maildev-ssl

This directory contains the files used by the `docker-compose` setup for Maildev with SSL support.

To use the maildev service, you need to add the root.pem to your backend service's trusted certificates:

```bash
sudo keytool -importcert -alias maildev-ssl \
-keystore $(/usr/libexec/java_home)/lib/security/cacerts \
-file "root.pem" \
-storepass changeit
```
ran from this directory.

See https://www.notion.so/metabase/Maildev-Setup-21669354c90180e9a174f0b8904a316b for more info
