---
title: Running Metabase on AWS Elastic Beanstalk
redirect_from:
  - /docs/latest/operations-guide/running-metabase-on-elastic-beanstalk
  - /docs/latest/installation-and-operation/advanced-topics-for-running-Metabase-in-AWS-ElasticBeanstalk
  - /docs/latest/operations-guide/advanced-topics-for-running-Metabase-in-AWS-ElasticBeanstalk
---

# Running Metabase on AWS Elastic Beanstalk

> Due to problems with the platform, we no longer recommend using Elastic Beanstalk to run Metabase in production.

If you're running Metabase on Elastic Beanstalk, we recommend you switch to a different setup.

## Alternatives to Elastic Beanstalk

### Metabase Cloud

We recommend [Metabase Cloud](/pricing) (obviously).

### Self-hosted setups

You can set up Metabase with either PostgreSQL or MySQL as its application database, and run Metabase on a server you can monitor, either on your hardware or with a cloud provider.

At a minimum, make sure you back up your application database regularly (and always before upgrading). Follow your organization's requirements for security, monitoring, and availability.

If you're using AWS's Relational Database Service to store your Metabase application data, you can continue to do so (though you should still move your Metabase installation away from Elastic Beanstalk). You can use [environment variables](../configuring-metabase/environment-variables.md) to connect to your RDS host from wherever you move your Metabase installation to.

### Professional services

If you'd like help with setting up Metabase (or building out your data stack in general), check out the [professional services we offer](https://www.metabase.com/product/professional-services).