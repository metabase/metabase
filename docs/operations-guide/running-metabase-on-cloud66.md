# Running Metabase on Cloud66

If you are running Metabase on Cloud66 here's some info that may be helpful.


### Launching Metabase

More to come.  Success has been reported using the Metabase docker image.


##### Using a loadbalancer

If you are running your Metabase instance behind a loadbalancer you are likely to see issues accessing the application until you apply the correct healthcheck url.  In the Manifest.yml, put:

    production:
    load_balancer:
    configuration:
    httpchk: HEAD /api/health HTTP/1.1\r\nHost:haproxy


### Troubleshooting

* If you are seeing errors like `[WARN ] org.eclipse.jetty.http.HttpParser :: badMessage: 400 No Host for HttpChannelOverHttp@52b8a3a{r=0,c=false,a=IDLE,uri=-}` then checkout out the info above about setting the proper healthcheck url on your loadbalancer.
