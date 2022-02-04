#!/bin/bash
if [[ "x$NGINX_FORCE_SSL" == "x1" ]]; then
    cp .platform/nginx/nginx-ssl.conf /etc/nginx/nginx.conf && nginx -t && /sbin/service nginx restart
else
    cp .platform/nginx/nginx.conf /etc/nginx/nginx.conf && nginx -t && /sbin/service nginx restart
fi
