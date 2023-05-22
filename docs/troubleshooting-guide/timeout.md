---
title: Troubleshooting connection timeouts
---

# Troubleshooting connection timeouts

If your queries are hanging or timing out, the problem could be coming from your:

- [Database connection](./db-connection.md)
- Load balancer
- Reverse proxy server (e.g., Nginx)
- Jetty
- Cloud service (such as AWS’s Elastic Beanstalk, EC2, Heroku, or Google App Engine).

## Resources for common deployments

Fixes for timeout problems will depend on your specific setup. These resources may help:

- [Configuring Jetty connectors][configuring-jetty]
- [EC2 Troubleshooting][ec2-troubleshooting]
- [Elastic Load Balancing Connection Timeout Management][elb-timeout]
- [App Engine: Dealing with DeadlineExceededErrors][app-engine-timeout]

## Are you still stuck?

If you can’t solve your problem using the troubleshooting guides:

- Search or ask the [Metabase community][discourse].
- Search for [known bugs or limitations][known-issues].

[app-engine-timeout]: https://cloud.google.com/appengine/articles/deadlineexceedederrors
[configuring-jetty]: https://www.eclipse.org/jetty/documentation/current/#configuring-connectors
[discourse]: https://discourse.metabase.com/
[ec2-troubleshooting]: https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/TroubleshootingInstancesConnecting.html
[elb-timeout]: https://aws.amazon.com/blogs/aws/elb-idle-timeout-control/
[known-issues]: ./known-issues.md
