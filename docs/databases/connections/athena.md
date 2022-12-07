---
title: Amazon Athena
---

# Amazon Athena

Connecting Metabase to Athena depends on where Metabase is running.

## Connecting to Athena 

To connect Metabase to Athena, you'll need to input your IAM credentials:

- Access key
- Secret Key

Metabase will encrypt these credentials.

If you use other AWS services, we recommend that you create a special AWS Service Account that only has the permissions required to run Athena, and input the IAM credentials from that account to connect Metabase to Athena.

See [Identity and access management in Athena](https://docs.aws.amazon.com/athena/latest/ug/security-iam-athena.html).

## Connecting using AWS Default Credentials Chain

If you're running Metabase on AWS and want to use [AWS Default Credentials Chain](https://docs.aws.amazon.com/sdk-for-java/v1/developer-guide/credentials.html#credentials-default), leave the Access and Secret keys blank.

- For EC2, you can use [instance profiles](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_use_switch-role-ec2_instance-profiles.html).
- For ECS, you can use [IAM roles for tasks](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task-iam-roles.html)

In both cases, the Athena driver will automatically fetch session credentials based on which IAM role you've configured.

## Connection settings

### Display name

How Metabase should refer to the data source in its user interface.

### Region

The region where your Athena database is hosted, e.g., `us-east-1`.

### Workgroup

For example: `primary`. See [documentation on workgroups](https://docs.aws.amazon.com/athena/latest/ug/user-created-workgroups.html)

### S3 Staging directory

This S3 staging directory must be in the same region you specify above.

### Catalog

You can use a different [catalog](https://docs.aws.amazon.com/athena/latest/ug/understanding-tables-databases-and-the-data-catalog.html) (for example if you're using federated queries).

## Advanced options

### Additional Athena connection string options

You can append additional options to the connection string. For example, to disable result set streaming and enable TRACE-level debugging:

```
UseResultsetStreaming=0;LogLevel=6.
```

For more connection options, see Simba Athena JDBC Driver with SQL Connector's [Installation and Configuration Guide](https://s3.amazonaws.com/athena-downloads/drivers/JDBC/SimbaAthenaJDBC_2.0.13/docs/Simba+Athena+JDBC+Driver+Install+and+Configuration+Guide.pdf).

### Rerun queries for simple explorations

We execute the underlying query when you explore data using Summarize or Filter. This is on by default but you can turn it off if performance is slow.

### Choose when syncs and scans happen

By default, Metabase does a lightweight hourly sync and an intensive daily scan of field values. If you have a large database, turn this on to make changes.

### Periodically refingerprint tables

This enables Metabase to scan for additional field values during syncs allowing smarter behavior, like improved auto-binning on your bar charts.

### Default result cache duration

How long to keep question results. By default, Metabase will use the value you supply on the cache settings page, but if this database has other factors that influence the freshness of data, it could make sense to set a custom duration. You can also choose custom durations on individual questions or dashboards to help improve performance.
