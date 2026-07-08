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

{% include plans-blockquote.html feature="IAM authentication" self-hosted-only="true" %}

You can connect to RDS PostgreSQL and MySQL instances and Aurora PostgreSQL/MySQL using AWS IAM authentication instead of a password.

To set up IAM authentication:

1. [In AWS, enable IAM authentication on your RDS instance](#in-aws-enable-iam-authentication-on-your-rds-instance)
2. [In AWS, set up an IAM policy](#in-aws-set-up-an-iam-policy)
3. [In your database, create a database user](#in-your-database-create-a-database-user)
4. [In your Metabase environment, configure AWS credentials](#in-your-metabase-environment-configure-aws-credentials)
5. [In Metabase, select IAM authentication](#in-metabase-select-iam-authentication)
6. [In Metabase, configure SSL](#in-metabase-configure-ssl)

### In AWS, enable IAM authentication on your RDS instance

[Enable IAM authentication on your RDS instance](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/UsingWithRDS.IAMDBAuth.Enabling.html) in the AWS console.

### In AWS, set up an IAM policy

Add a policy with the `rds-db:connect` action. The policy resource must specify the [Amazon Resource Name (ARN)](https://docs.aws.amazon.com/IAM/latest/UserGuide/reference-arns.html) of your database user in the format:

```
arn:aws:rds-db:region:account-id:dbuser:DbiResourceId/db-user-name
```

When entering the username in Metabase, you'd just enter your `db-user-name`, not the full ARN.

See [Creating IAM policy for IAM database access](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/UsingWithRDS.IAMDBAuth.IAMPolicy.html).

### In your database, create a database user

Create the database user with IAM authentication enabled. The database username must match exactly (case-sensitive) with the `db-user-name` portion of your IAM policy [Amazon Resource Name (ARN)](https://docs.aws.amazon.com/IAM/latest/UserGuide/reference-arns.html).

**PostgreSQL:**

```sql
CREATE USER your_username;
GRANT rds_iam TO your_username;
```

**MySQL:**

```sql
CREATE USER 'your_username'@'%' IDENTIFIED WITH AWSAuthenticationPlugin AS 'RDS';
```

See [Setting up for IAM database authentication](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/UsingWithRDS.IAMDBAuth.DBAccounts.html).

### In your Metabase environment, configure AWS credentials

Authentication credentials must be available via one of the methods supported by the [AWS SDK credentials chain](https://docs.aws.amazon.com/sdk-for-java/latest/developer-guide/credentials-chain.html), typically either:

- Environment variables (`AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`)
- AWS credentials file (`.aws/credentials`), automatically available if running in [Elastic Container Service (ECS)](https://docs.aws.amazon.com/ecs/)

### In Metabase, select IAM authentication

When adding or editing a database connection in Metabase, click **Use an authentication provider** and select **IAM Authentication**.

### In Metabase, configure SSL

Use a secure connection (SSL):

- **PostgreSQL**: Set the SSL Mode to **require**. See [PostgreSQL SSL options](./postgresql.md#ssl-mode).
- **MySQL**: The SSL Mode will be automatically set to **verify-ca**. If you manually change the SSL Mode, it must be set to **verify-ca**. See [MySQL SSL options](./mysql.md#use-a-secure-connection-ssl).
