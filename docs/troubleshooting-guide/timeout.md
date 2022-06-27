---
title: Troubleshooting connection timeouts
---

# Troubleshooting connection timeouts

If your queries are hanging or timing out, the problem could be coming from your:

- Load balancer
- Reverse proxy server (e.g., Nginx)
- Jetty
- Database
- Cloud service (such as AWS’s Elastic Beanstalk, EC2, Heroku, or Google App Engine).

Fixing this depends on your specific deployment setup. These resources may help:

- [Configuring Jetty connectors][configuring-jetty]
- [EC2 Troubleshooting][ec2-troubleshooting]
- [Elastic Load Balancing Connection Timeout Management][elb-timeout]
- [Heroku timeouts][heroku-timeout]
- [App Engine: Dealing with DeadlineExceededErrors][app-engine-timeout]