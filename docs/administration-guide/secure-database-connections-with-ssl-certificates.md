## Securing database connections using an SSL certificate

If you'd like to connect your Metabase Cloud or self-hosted instance to a database, you can secure the connection using Secure Socket Layer (SSL) encryption with a certificate.

Why you'd want to do this:

- You're using Metabase Cloud and want to ensure the identity of the data warehouse you're connecting to (e.g., PostgreSQL, MySQL).
- You're self-hosting Metabase and want to ensure the identity of a data warehouse hosted by an external provider. You can also use this method to ensure you're using the strictest connection parameters when connecting to your application database.

If you're using Metabase Cloud, the application database is handled for you, so you'd only need to secure connections to data warehouses that you add to your Metabase.

### Prerequisites

A database that allows a JDBC connection, as you'll need to use a connection string to specify the certificate you want to use.

### Step 1: Download the root certificate from your provider

If you're running Metabase via a Docker container, you should already have the certificates for AWS and Azure.

You'll find the certificates in the `/app/certs/` directory in Metabase's Docker image:

- AWS RDS: `/app/certs/rds-combined-ca-bundle.pem`
- Azure certificate: `/app/certs/DigiCertGlobalRootG2.crt.pem`

If you need a different certificate, you can build your own Docker image. Visit your external provider's page for your database and find a link to download the root certificate for connecting to your database.

### Step 2: Save the certificate in your Metabase directory

Save the downloaded certificate in the same directory where you keep your metabase.jar file. Technically you can store the certificate wherever, but keeping it in the same directory as your metabase.jar file is a best practice. You'll specify the certificate's path in your connection string.

### Step 3: Add your database

For example, let's say you want to secure a connection to a PostgreSQL database. Follow the instructions in the app to add the database. For more on setting up a database connection, check out our docs for [adding a database](01-managing-databases.md).

### Step 4: Toggle on the "Use a secure connection (SSL)" option

If your database supports a JDBC connection, Metabase will provide you with a field to input additional parameters to your connection string. Metabase will use parameters in the connection string to establish a secure connection.

### Step 5: Add additional connection string options

You'll need to specify the location of the certificate on the server that's running Metabase.

For example, when connecting to a PostgreSQL database, you'll need to add two parameters:

- `sslmode`. You can see the full list of options in PostgreSQL's documentation. We recommend you use `verify-full`; it's the most secure, and overhead is minimal.
- `sslrootcert`. Here you'll specify the file path for the certificate.

You'll add an ampersand (`&`) to separate each parameter. For example, In the **Add additional connection string options** field, you'd add something like:

```
sslmode=verify-full&sslrootcert=/path/to/certificate.pem
```

Replacing `/path/to/certifcate.pem` with the full path for the certificate you downloaded from your provider.

You can learn more about [SSL support for PostgreSQL](https://www.postgresql.org/docs/current/libpq-ssl.html).

## Securing connection to application database using environment variables

If you're self-hosting Metabase, you can secure the connection to your application database using [environment variables](../operations-guide/environment-variables.md).

The environment variable to use is [`MB_DB_CONNECTION_URI`](../operations-guide/environment-variables.md#mb_db_connection_uri).

You'll need to include the full connection string here, including the db host, port, db name and user info, as well as the additional connection parameters to include the certificate. For example,

```
jdbc:postgresql://db.example.com:port/mydb?user=dbuser&password=dbpassword&ssl=true&sslmode=verify-full&sslrootcert=/path/to/certificate.pem
```
