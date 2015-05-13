log_format metabase '"2" "$remote_addr" "$remote_user" "$time_local" "$request_method" "$request_uri" "$server_protocol" "$status" "$bytes_sent" "$request_time" "$http_referer" "$http_user_agent"';

# generic healthcheck endpoint. return 410 Gone for all unknown server names unless the uagent is from the ELB-Healthchecker
server {
  if ($http_user_agent !~* (ELB-HealthChecker/.*)) {
    return 410;
  }
  location /hc {
    resolver 8.8.8.8;
    proxy_set_header Host ${APP};
    proxy_pass $scheme://127.0.0.1/api/health;
  }
  log_not_found off;
}

server {
  server_name data-staging.expa.com;
  return 301 $scheme://metabase-staging.expa.com$request_uri;
}

server {
  server_name data.expa.com;
  return 301 $scheme://metabase.expa.com$request_uri;
}

server {
  listen      [::]:80; #IPv6 compatibility
  listen      80;
  server_name ${SERVER_NAME};

  root /var/www;

  real_ip_header     X-Forwarded-For;
  set_real_ip_from   0.0.0.0/0;

  access_log /var/log/expa/nginx/$host/$hostname-${APP}-access.log metabase;

  include /etc/nginx/conf.d/flower*;
  include /etc/nginx/conf.d/health-endpoint*;

  location    / {
    if ($http_x_forwarded_proto != 'https') {
      rewrite ^ https://$host$request_uri? permanent;
    }
    proxy_pass  http://${APP};
    proxy_http_version 1.1;
    proxy_read_timeout 120s;
    proxy_send_timeout 120s;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $http_host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $remote_addr;
    proxy_set_header X-Forwarded-Port $server_port;
    proxy_set_header X-Request-Start $msec;
    proxy_set_header X-Nginx-Proxy true;
    send_timeout 120s;
  }
}
