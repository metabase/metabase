#!/bin/bash

INFO "Obtaining and setting trusted CA-bundles (truststore)"

export XD_JVMCA_PASS="changeit" #TODO Vault: availability

getCAbundle "/root/kms/secrets//" JKS "trustStore.jks" || exit $?

export XD_TRUSTSTORE_PASSWORD=$DEFAULT_KEYSTORE_PASS

if [[ ${#XD_TRUSTSTORE_PASSWORD} -lt 6 ]]; then
    ERROR "Keystore password must have at least 6 characters"
    exit 1
fi

echo ${XD_TRUSTSTORE_PASSWORD} > /root/kms/secrets/trustStore
echo "crossdata-driver.akka-http.ssl.truststore = \"/root/kms/secrets/trustStore.jks\"" >> /etc/sds/crossdata/shell/driver-application.conf
echo "crossdata-driver.akka-http.ssl.truststore-password = "${XD_TRUSTSTORE_PASSWORD} >> /etc/sds/crossdata/shell/driver-application.conf

INFO "Trusted CA-bundles (truststore): OK"
