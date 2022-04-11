#!/bin/bash
####
# Metabase Report server Elastic Beanstalk metabase-setup.sh
# Modify the environmental variables to customize your installation
# Unset a variable to disable a feature
####

set_up_env_vars () {
    # /opt/elasticbeanstalk/bin/get-config environment | jq -r 'to_entries | .[] | "export \(.key)=\"\(.value)\""' > /etc/profile.d/sh.local
    if grep -q "Amazon Linux 2" /etc/os-release; then
        if [ ! -z "$RDS_HOSTNAME" ]; then
            # sed -i 's/RDS_HOSTNAME/MB_DB_HOST/' /etc/profile.d/sh.local
            sed -i 's/RDS_HOSTNAME/MB_DB_HOST/' /opt/elasticbeanstalk/deployment/env.list
            # sed -i 's/RDS_USERNAME/MB_DB_USER/' /etc/profile.d/sh.local
            sed -i 's/RDS_USERNAME/MB_DB_USER/' /opt/elasticbeanstalk/deployment/env.list
            # sed -i 's/RDS_PASSWORD/MB_DB_PASS/' /etc/profile.d/sh.local
            sed -i 's/RDS_PASSWORD/MB_DB_PASS/' /opt/elasticbeanstalk/deployment/env.list
            # sed -i 's/RDS_PORT/MB_DB_PORT/' /etc/profile.d/sh.local
            sed -i 's/RDS_PORT/MB_DB_PORT/' /opt/elasticbeanstalk/deployment/env.list
            # sed -i 's/RDS_DB_NAME/MB_DB_DBNAME/' /etc/profile.d/sh.local
            sed -i 's/RDS_DB_NAME/MB_DB_DBNAME/' /opt/elasticbeanstalk/deployment/env.list
            if [ "$RDS_PORT" == "3306" ]; then
                # echo 'export MB_DB_TYPE="mysql"' >> /etc/profile.d/sh.local
                echo 'MB_DB_TYPE=mysql' >> /opt/elasticbeanstalk/deployment/env.list
            else
                # echo 'export MB_DB_TYPE="postgres"' >> /etc/profile.d/sh.local
                echo 'MB_DB_TYPE=postgres' >> /opt/elasticbeanstalk/deployment/env.list
            fi
        fi
    else
        if [ ! -z "$RDS_HOSTNAME" ]; then
            # sed -i 's/RDS_HOSTNAME/MB_DB_HOST/' /etc/profile.d/sh.local
            sed -i 's/RDS_HOSTNAME/MB_DB_HOST/' /opt/elasticbeanstalk/deploy/configuration/containerconfiguration
            # sed -i 's/RDS_USERNAME/MB_DB_USER/' /etc/profile.d/sh.local
            sed -i 's/RDS_USERNAME/MB_DB_USER/' /opt/elasticbeanstalk/deploy/configuration/containerconfiguration
            # sed -i 's/RDS_PASSWORD/MB_DB_PASS/' /etc/profile.d/sh.local
            sed -i 's/RDS_PASSWORD/MB_DB_PASS/' /opt/elasticbeanstalk/deploy/configuration/containerconfiguration
            # sed -i 's/RDS_PORT/MB_DB_PORT/' /etc/profile.d/sh.local
            sed -i 's/RDS_PORT/MB_DB_PORT/' /opt/elasticbeanstalk/deploy/configuration/containerconfiguration
            # sed -i 's/RDS_DB_NAME/MB_DB_DBNAME/' /etc/profile.d/sh.local
            sed -i 's/RDS_DB_NAME/MB_DB_DBNAME/' /opt/elasticbeanstalk/deploy/configuration/containerconfiguration
            if [ "$RDS_PORT" == "3306" ]; then
                # echo 'export MB_DB_TYPE="mysql"' >> /etc/profile.d/sh.local
                sed -i 's/}}}}/,"MB_DB_TYPE":"mysql"}}}}/' /opt/elasticbeanstalk/deploy/configuration/containerconfiguration
            else
                # echo 'export MB_DB_TYPE="postgres"' >> /etc/profile.d/sh.local
                sed -i 's/}}}}/,"MB_DB_TYPE":"postgres"}}}}/' /opt/elasticbeanstalk/deploy/configuration/containerconfiguration
            fi
        fi
    fi

}

# add files to papertrail
pt_files () {
    sed -i '/  - .*/d' /etc/log_files.yml
    set -f
    for file in $PAPERTRAIL_FILES; do
        sed -i 's|files:|files:\n  - '$file'|' /etc/log_files.yml
    done
    set +f
}

# papertail remote host
pt_remote_host () {
    sed -i "s/.*host:.*/  host: $PAPERTRAIL_HOST/" /etc/log_files.yml
}

# papertail remote port
pt_port () {
    sed -i "s/.*port:.*/  port: $PAPERTRAIL_PORT/" /etc/log_files.yml
}

# papertail local host
pt_local_host () {
    eval export PAPERTRAIL_HOSTNAME=$PAPERTRAIL_HOSTNAME # expand vars like $HOSTNAME
    sed -i "s/.*hostname:.*/hostname: $PAPERTRAIL_HOSTNAME/" /etc/log_files.yml
}

# download, install and configure papertrail
install_papertrail () {
    cp .ebextensions/metabase_config/papertrail/log_files.yml /etc/log_files.yml && chmod 644 /etc/log_files.yml
    cp .ebextensions/metabase_config/papertrail/remote_syslog /etc/init.d/remote_syslog && chmod 555 /etc/init.d/remote_syslog
    cd /tmp/
    wget -q "https://github.com/papertrail/remote_syslog2/releases/download/v0.20/remote_syslog_linux_amd64.tar.gz" &&
        tar xzf remote_syslog_linux_amd64.tar.gz
    /sbin/service remote_syslog stop
    mv /tmp/remote_syslog/remote_syslog /usr/local/bin/
    rm -rf remote_syslog_linux_amd64.tar.gz remote_syslog
    # Setup Papertrail
    [[ "$PAPERTRAIL_HOST" ]] && pt_remote_host
    [[ "$PAPERTRAIL_PORT" ]] && pt_port
    [[ "$PAPERTRAIL_FILES" ]] && pt_files
    [[ "$PAPERTRAIL_HOSTNAME" ]] && pt_local_host
}

case $1 in
set_up_env_vars)
    set_up_env_vars
    ;;
install_papertrail)
    install_papertrail
    ;;
esac
