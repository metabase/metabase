---
title: Amazon Athena
---

# Amazon Athena

To add a database connection, click on the **gear** icon in the top right, and navigate to **Admin settings** > **Databases** > **Add a database**.

Fill out the fields for that database, and click **Save changes** at the bottom.

## Connection settings

- [Display name](../settings.md#display-name) *
- [Region](../settings.md#region)
- [Workgroup](../settings.md#workgroup)
- [Username](../settings.md#username)
- [S3 staging directory](../settings.md#s3-staging-directory)
- [Catalog](../settings.md#catalog)
- [Additional Athena connection string options](../settings.md#additional-athena-connection-string-options)
- [Rerun queries for simple explorations](../settings.md#rerun-queries-for-simple-explorations)
- [Choose when syncs and scans happen](../settings.md#choose-when-syncs-and-scans-happen)
- [Periodically refingerprint tables](../settings.md#periodically-refingerprint-tables)
- [Default result cache duration](../settings.md#default-result-cache-duration)

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

## Further reading

- [Adding and managing databases](../connecting.md)
- [Connection settings](../settings.md)


