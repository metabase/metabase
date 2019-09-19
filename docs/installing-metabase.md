# Installing Metabase

Welcome to Metabase! We’re excited to help you get started. We've made our install process as simple as we could to get you right to your data.

Metabase is built and packaged as a Java JAR file and can be run anywhere that Java is available (after installation, Metabase is accessed via a browser).

### Quick installation

The quickest way to get up and running on Metabase is to [run the JAR file locally](operations-guide/running-the-metabase-jar-file.md). This is ideal when you're looking to initially test Metabase or take a new version for a spin before rolling it out to your organization.

### Production installation

Once you're ready to roll Metabase out across your organization, you will want to host it somewhere other than locally. If you don't have a preferred hosting service, we recommend using [Docker](operations-guide/running-metabase-on-docker.md), as it is easy to set up and maintain.

If you prefer other services such as AWS Elastic Beanstalk, check out our [full list of install options](operations-guide/installing-metabase.md).

## Post-install best practices

Once you've successfully installed Metabase, there are a few things you can do to improve the security and stability of your instance.

### Migrate your application database off of H2

Metabase includes an application database. This is where Metabase stores information about users, saved questions, dashboards, etc. By default, the application database is a locally stored H2 database. We do not recommend using this H2 database in production, as it can be corrupted fairly easily. Luckily, it’s pretty simple to [migrate to a MySQL or Postgres database](operations-guide/migrating-from-h2.md).

No matter the underlying application database you use, we [backing-up your database](operations-guide/backing-up-metabase-application-data.html) frequently. 

### Encrypt your database credentials

Further along the setup process you will need to enter credentials for your underlying databases. This information will be stored in the Metabase application database. To makes sure your information remains secure, configure Metabase to [encrypt your database details](operations-guide/encrypting-database-details-at-rest.html) at rest.

### Other customization options

If you’re looking for a little extra customization of your Metabase instance, we have plenty of options, ranging from setting password complexity to configuring logging. You can read all about them in our [Operations Guide](operations-guide/start.html).

### Setting up Metabase

Once Metabase is up and running, it's time to get set up. We have a handy guide available [here](setting-up-metabase.md).

## Need Help?

Run into trouble during your set-up process? You may want to check out our [troubleshooting guides](troubleshooting-guide/index.html) or ask for help from our community in our [discussion forums](https://discourse.metabase.com/).

