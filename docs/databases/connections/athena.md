---
title: Amazon Athena
---

# Amazon Athena

The recommended way to connect depends on where Metabase is running. 

- EC2:, you can use instance profiles.
- ECS: you can use [IAM roles for tasks](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task-iam-roles.html)

In both cases, Athena driver will automatically fetch session credentials based on whatever IAM role is configured.

## Connecting from a Metabase Cloud instance

For now, you'll need to enter hard-coded credentials to connect to Metabase Cloud. Metabase will encrypt these credentials when storing them.


Hard-coded credentials are typically not preferred because they must be stored somewhere (potentially unencrypted if db encryption is not enabled in Metabase), require manual work to rotate them on a regular basis, and if compromised can be used in perpetuity until they are disabled or rotated.
