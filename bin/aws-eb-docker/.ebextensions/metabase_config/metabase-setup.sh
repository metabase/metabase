#!/bin/bash
####
# Metabase Report server Elastic Beanstalk metabase-setup.sh
# Modify the environmental variables to customize your installation
# Unset a variable to disable a feature
####
NGINX_PROXY=/etc/nginx/sites-enabled/elasticbeanstalk-nginx-docker-proxy.conf
CONTAINER_CONFIG=/opt/elasticbeanstalk/deploy/configuration/containerconfiguration

set_env_vars () {
    for envvar in $(jq -r '.optionsettings | {"aws:elasticbeanstalk:application:environment"}[] | .[]' $CONTAINER_CONFIG)
    do
        export $envvar
    done
}

# update nginx logging to include x_real_ip
log_x_real_ip () {
    cp .ebextensions/metabase_config/nginx/log_x_real_ip.conf /etc/nginx/conf.d/log_x_real_ip.conf
    sed 's/access.log;/access.log log_x_real_ip;/' /etc/nginx/sites-enabled/*-proxy.conf
}

# nginx server name
server_name () {
    # enable default_server to drop DNS poisoning
    cp .ebextensions/metabase_config/nginx/default_server /etc/nginx/sites-available/ && \
        ln -fs /etc/nginx/sites-available/default_server /etc/nginx/sites-enabled/default_server
    ! grep -q server_name $NGINX_PROXY && \
        sed "/listen 80;/a \        server_name $NGINX_SERVER_NAME" $NGINX_PROXY
}

# enable https redirect
server_https () {
    ! grep -q https $NGINX_PROXY && \
        sed -i '/listen 80;/a \        if ($http_x_forwarded_proto = "http") { return 301 https://$host$request_uri; }' $NGINX_PROXY
}

# download, install and configure papertrail
install_papertrail () {
    cp .ebextensions/metabase_config/papertrail/log_files.yml /etc/log_files.yml && chmod 644 /etc/log_files.yml
    curl -L https://raw.githubusercontent.com/papertrail/remote_syslog2/master/examples/remote_syslog.init.d -o /etc/init.d/remote_syslog && \
        chmod +x /etc/init.d/remote_syslog
    rpm -i https://github.com/papertrail/remote_syslog2/releases/download/v0.19/remote_syslog2-0.19-1.x86_64.rpm
    service remote_syslog start
    update-rc.d remote_syslog defaults
    # Setup Papertrail
    [[ "$PAPERTRAIL_HOST" ]] && \
        sed -i "s/.*host:.*/  host: $PAPERTRAIL_HOST/" /etc/log_files.yml
    [[ "$PAPERTRAIL_PORT" ]] && \
        sed -i "s/.*port:.*/  port: $PAPERTRAIL_PORT/" /etc/log_files.yml
    [[ "$PAPERTRAIL_HOSTNAME" ]] && \
        sed -i "s/.*hostname:.*/hostname: $PAPERTRAIL_HOSTNAME/" /etc/log_files.yml
}

set_env_vars
log_x_real_ip
[[ $NGINX_SERVER_NAME ]] && server_name
[[ $NGINX_FORCE_SSL ]] && server_https
[[ $PAPERTRAIL_HOST ]] && install_papertrail
