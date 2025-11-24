---
title: "Connecting to AWS's Relational Database Service (RDS)"
redirect_from:
  - /docs/latest/administration-guide/databases/aws-rds
---

# Connecting to AWS's Relational Database Service (RDS)

RDS offers several databases that Metabase officially supports, including PostgreSQL, MySQL, MariaDB, Oracle, and SQL server.

Here's how to get connection information for databases on Amazon's RDS:

1. Go to your AWS Management Console.
   - Need help finding that? Visit `https://**My_AWS_Account_ID**.signin.aws.amazon.com/console`. Be sure to insert your own AWS Account ID, though!
2. Go to **Database** > **RDS** > **Instances**.
3. Select the database you want to connect to Metabase.
4. Get the information you'll need to connect Metabase to your RDS:
   - **Hostname**. This is listed as the Endpoint parameter.
   - **Port**. Find the port parameter under Security and Network.
   - **Username**. Find this under Configuration Details.
   - **Database Name**. Find this under Configuration Details.
   - **Password**. Ask your database administrator for the password.

## IAM authentication

{% include plans-blockquote.html feature="IAM authentication" %}

You can connect to RDS PostgreSQL and MySQL instances using AWS IAM authentication instead of a password. This is available for self-hosted Pro and Enterprise plans.

### Configure AWS credentials

Authentication credentials must be available via one of the methods supported by the [AWS SDK credentials chain](https://docs.aws.amazon.com/sdk-for-java/latest/developer-guide/credentials-chain.html), typically either:

- Environment variables (`AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`).
- AWS credentials file (`.aws/credentials`), automatically available if running in [Elastic Container Service (ECS)](https://docs.aws.amazon.com/ecs/).

### Set up IAM policy

Add a policy with the `rds-db:connect` action. The policy resource must specify the ARN of your database user in the format:

```
arn:aws:rds-db:region:account-id:dbuser:DbiResourceId/db-user-name
```

See [Creating IAM policy for IAM database access](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/UsingWithRDS.IAMDBAuth.IAMPolicy.html).

### Create database user

Create the database user with IAM authentication enabled. The database username must match exactly (case-sensitive) with the `db-user-name` portion of your IAM policy [Amazon Resource Name (ARN)](https://docs.aws.amazon.com/IAM/latest/UserGuide/reference-arns.html).

For PostgreSQL:

```sql
CREATE USER your_username;
GRANT rds_iam TO your_username;
```

For MySQL:

```sql
CREATE USER 'your_username'@'%' IDENTIFIED WITH AWSAuthenticationPlugin AS 'RDS';
```

See [Setting up for IAM database authentication](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/UsingWithRDS.IAMDBAuth.DBAccounts.html).

### Enable IAM authentication on your RDS instance

[Enable IAM authentication on your RDS instance](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/UsingWithRDS.IAMDBAuth.Enabling.html) in the AWS console.

### Configure SSL

Use a secure connection (SSL). Set the SSL Mode to **require** (or stricter). See [PostgreSQL SSL options](./postgresql.md#ssl-mode) or [MySQL SSL options](./mysql.md#use-a-secure-connection-ssl).

### Select IAM authentication in Metabase

When adding or editing a database connection in Metabase, select **IAM Authentication** from the **Use an authentication provider** dropdown.

## Database routing

See [Database routing](../../permissions/database-routing.md).
