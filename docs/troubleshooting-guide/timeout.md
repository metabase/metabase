---
title: Troubleshooting connection timeouts
summary: Find where a hanging query is timing out, from your database connection to your load balancer or proxy.
---

# Troubleshooting connection timeouts

If your queries are hanging or timing out, the problem could be coming from your:

- [Database connection](./db-connection.md)
- Load balancer
- Reverse proxy server (e.g., Nginx)
- Jetty
- Cloud service

Metabase also has its own timeouts. By default, Metabase cancels queries that run for longer than 20 minutes, and gives up connecting to a database after 10 seconds (for example, when you test a database connection). On self-hosted Metabases, you can change these limits with the [`MB_DB_QUERY_TIMEOUT_MINUTES`](../configuring-metabase/environment-variables.md#mb_db_query_timeout_minutes) and [`MB_DB_CONNECTION_TIMEOUT_MS`](../configuring-metabase/environment-variables.md#mb_db_connection_timeout_ms) environment variables.

## Resources for common deployments

Fixes for timeout problems will depend on your specific setup. These resources may help:

- [Jetty connectors][configuring-jetty]
- [EC2 Troubleshooting][ec2-troubleshooting]
- [Elastic Load Balancing Connection Timeout Management][elb-timeout]
- [App Engine: Dealing with DeadlineExceededErrors][app-engine-timeout]

## Are you still stuck?

If you can’t solve your problem using the troubleshooting guides:

- Search or ask the [Metabase community][discourse].
- Search for [known bugs or limitations][known-issues].

[app-engine-timeout]: https://cloud.google.com/appengine/articles/deadlineexceedederrors
[configuring-jetty]: https://jetty.org/docs/jetty/12/operations-guide/protocols/index.html
[discourse]: https://discourse.metabase.com/
[ec2-troubleshooting]: https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/TroubleshootingInstancesConnecting.html
[elb-timeout]: https://aws.amazon.com/blogs/aws/elb-idle-timeout-control/
[known-issues]: ./known-issues.md
