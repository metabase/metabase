#!/bin/bash


source /root/kms/logger.sh
source /root/kms/kms_utils.sh

TENANT_UNDERSCORE=${TENANT_NAME//-/_}
export TENANT_NORM="${TENANT_UNDERSCORE^^}"

export PATH=${PATH}:'/root/kms/bin/'

log "INFO" ${TENANT_NORM}

if [ -z "$VAULT_HOST" ];
then
	log "INFO" "using default secrets"
	cp /root/defaultsecrets/* /root/.crossdata/
else
	log "INFO" "using VAULT to download the secrets"
	# Try logging in using dynamic authentication if vault token not defined.
    if [ -z "$VAULT_TOKEN" ];
    then
        log "INFO" "login using dynamic authentication with role_id: ${VAULT_ROLE_ID}"
        login
        source /root/kms/tls-config.sh
	    source /root/kms/truststore-config.sh
        source /root/kms/psql-connection.sh
	    cp /root/kms/secrets/* /root/.crossdata/
        if [ $? != 0 ]; then
            log "ERROR" "login using dynamic authentication failed!"
            exit 1
        fi
    else
        log "INFO" "login using VAULT TOKEN"
        source /root/kms/tls-config.sh
	    source /root/kms/truststore-config.sh
        source /root/kms/psql-connection.sh
	    cp /root/kms/secrets/* /root/.crossdata/
        if [ $? != 0 ]; then
            log "ERROR" "VAULT TOKEN"
            exit 1
        fi
    fi
fi
