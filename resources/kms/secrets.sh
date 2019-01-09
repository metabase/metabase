#!/bin/bash


TENANT_UNDERSCORE=${TENANT_NAME//-/_}
export TENANT_NORM="${TENANT_UNDERSCORE^^}"

export PATH=${PATH}:'/root/kms/bin/'

INFO "INFO" ${TENANT_NORM}

if [ -z "$VAULT_HOST" ];
then
	INFO "using default secrets"
	cp /root/defaultsecrets/* /root/.crossdata/
else
	INFO "using VAULT to download the secrets"
	# Try logging in using dynamic authentication if vault token not defined.
        IFS=',' read -ra VAULT_HOSTS <<< "$VAULT_HOST"
    if [ -z "$VAULT_TOKEN" ];
    then
        INFO "login using dynamic authentication with role_id: ${VAULT_ROLE_ID}"
        login
        INFO "login OK!"
        source /root/kms/tls-config.sh
	source /root/kms/truststore-config.sh
        source /root/kms/psql-connection.sh
	    cp /root/kms/secrets/* /root/.crossdata/
        if [ $? != 0 ]; then
            ERROR "login using dynamic authentication failed!"
            exit 1
        fi
    else
        INFO "login using VAULT TOKEN"
        source /root/kms/tls-config.sh
	source /root/kms/truststore-config.sh
        source /root/kms/psql-connection.sh
	    cp /root/kms/secrets/* /root/.crossdata/
        if [ $? != 0 ]; then
            ERROR "VAULT TOKEN"
            exit 1
        fi
    fi
fi
