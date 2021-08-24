#! /usr/bin/env bash
# runs one or more Metabase test(s) against a Kerberized Presto instance
# set -eo pipefail

# install clojure version needed for Metabase
curl -O https://download.clojure.org/install/linux-install-1.10.3.933.sh
chmod +x linux-install-1.10.3.933.sh
./linux-install-1.10.3.933.sh

RESOURCES_DIR=/app/source/resources

# ensure the expected files are in place, in the resources dir
if [ ! -f "$RESOURCES_DIR/ssl_keystore.jks" ]; then
  echo "$RESOURCES_DIR/ssl_keystore.jks does not exist; cannot run test" >&2
  exit 11
fi

if [ ! -f "$RESOURCES_DIR/krb5.conf" ]; then
  echo "$RESOURCES_DIR/krb5.conf does not exist; cannot run test" >&2
  exit 12
fi

if [ ! -f "$RESOURCES_DIR/client.keytab" ]; then
  echo "$RESOURCES_DIR/client.keytab does not exist; cannot run test" >&2
  exit 13
fi

# Copy the JDK cacerts file to our resources
cp $JAVA_HOME/lib/security/cacerts $RESOURCES_DIR/cacerts-with-presto-ca.jks

# Capture the Presto server self signed CA in PEM format
openssl s_client -showcerts -connect presto-kerberos:7778 </dev/null \
  | openssl x509 -outform PEM >$RESOURCES_DIR/presto-ssl-root-ca.pem

# Convert the Presto server self signed CA to DER format
openssl x509 -outform der -in $RESOURCES_DIR/presto-ssl-root-ca.pem  -out $RESOURCES_DIR/presto-ssl-root-ca.der

# Add Presto's self signed CA to the truststore
$JAVA_HOME/bin/keytool -noprompt -import -alias presto-kerberos -keystore $RESOURCES_DIR/cacerts-with-presto-ca.jks \
        -storepass changeit -file $RESOURCES_DIR/presto-ssl-root-ca.der -trustcacerts

ADDITIONAL_OPTS="SSLKeyStorePath=$RESOURCES_DIR/ssl_keystore.jks&SSLKeyStorePassword=presto\
&SSLTrustStorePath=$RESOURCES_DIR/cacerts-with-presto-ca.jks&SSLTrustStorePassword=changeit"

# Prepare dependencies

source "./bin/prep.sh"
prep_deps

# Prepare dependencies; see
# https://github.com/metabase/metabase/wiki/Migrating-from-Leiningen-to-tools.deps#preparing-dependencies
#clojure -Sverbose -X:deps prep
#echo "Running -X:deps prep at top level"
#cd modules/drivers
#echo "Running -X:deps prep under modules/drivers"
#clojure -X:deps prep
#cd -

# Set up the environment variables pointing to all of this, and run some tests
DRIVERS=presto-jdbc \
MB_ENABLE_PRESTO_JDBC_DRIVER=true \
MB_PRESTO_JDBC_TEST_HOST=presto-kerberos \
MB_PRESTO_JDBC_TEST_PORT=7778 \
MB_PRESTO_JDBC_TEST_SSL=true \
MB_PRESTO_JDBC_TEST_KERBEROS=true \
MB_PRESTO_JDBC_TEST_USER=bob@EXAMPLE.COM \
MB_PRESTO_JDBC_TEST_KERBEROS_PRINCIPAL=bob@EXAMPLE.COM \
MB_PRESTO_JDBC_TEST_KERBEROS_REMOTE_SERVICE_NAME=HTTP \
MB_PRESTO_JDBC_TEST_KERBEROS_KEYTAB_PATH=$RESOURCES_DIR/client.keytab \
MB_PRESTO_JDBC_TEST_KERBEROS_CONFIG_PATH=$RESOURCES_DIR/krb5.conf \
MB_PRESTO_JDBC_TEST_ADDITIONAL_OPTIONS=$ADDITIONAL_OPTS \
clojure -X:dev:test:drivers:drivers-dev :only metabase.driver.presto-jdbc-test || cat /tmp/clojure*edn
