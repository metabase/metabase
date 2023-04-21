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
