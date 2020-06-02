**Covered in this guide:**

- [Installing Metabase on AWS Elastic Beanstalk](#running-metabase-on-aws-elastic-beanstalk)
- [Upgrading to new versions of Metabase](#deploying-new-versions-of-metabase)
- [Retaining Metabase logs on S3](#retaining-metabase-logs)
- [Running Metabase over HTTPS](#running-metabase-over-https)
- [Setting the Java timezone](#setting-the-jvm-timezone)
- [Using Papertrail for logging](#using-papertrail-for-logging-on-aws)
- [Protecting invalid hostname access](#protecting-against-invalid-hostname-access)

# Running Metabase on AWS Elastic Beanstalk

The Metabase team runs a number of production installations on AWS using Elastic Beanstalk and currently recommend it as the preferred choice for production deployments. Below is a detailed guide to installing Metabase on Elastic Beanstalk.

### Quick Launch

Metabase provides a pre-configured Elastic Beanstalk launch URL to help you get started with new installations. If you are starting fresh we recommend you follow this link in a new tab to begin creating the Elastic Beanstalk deployment with a few choices pre-filled. Then just follow the step-by-step instructions below to complete your installation.

[Launch Metabase on Elastic Beanstalk](https://downloads.metabase.com/{{ site.latest_version }}/launch-aws-eb.html)

After clicking the launch URL, you should see a screen that looks like this:

![Elastic Beanstalk First Screen](images/EBFirstScreen.png)

_NOTE: If this screenshot doesn't match what you see in the Elastic Beanstalk console, it's likely that you are on an old version of the Elastic Beanstalk UI. At the time of writing this documentation, both versions of the UI are being reported in the wild. If you need to, you can [view our older AWS EB documentation](running-metabase-on-elastic-beanstalk-old.md)._

### Application information

Elastic Beanstalk is organized into Applications and Environments, so to get started we need to create a new application. You can customize the application name here.

![Elastic Beanstalk ApplicationInformation](images/EBApplicationInformation.png)

### Environment information

Here's where you can pick the environment name and the domain URL that you want to use for your Metabase instance. The environment name is simply the label you're assigning to this instance of Metabase.

As for the domain URL, Feel free to get creative — just remember that the URL for your Metabase instance must be unique across all AWS Elastic Beanstalk deployments, so you'll have to pick something that nobody else is already using. We often recommend something like `mycompanyname-metabase`. If you don't care about the URL you can simply leave it to whatever Amazon inputs by default. Just be aware that this can't be changed later.

![Elastic Beanstalk Environment Information](images/EBNewEnvironmentInformation.png)

### Tier

If you see a `Tier` setting under `Base configuration`, leave it set to `Web Server`. Elastic Beanstalk provides two choices for environments within an application, but `Web Server` is what we want.

![ebnewenv](images/EBWebTier.png)

### Base Configuration

![Elastic Beanstalk Base Configuration](images/EBBaseConfig.png)

While most of the fields here will be correctly pre-filled by following the launch URL above, you'll just need to do two things:

- First, make sure `Platform` is set to `Preconfigured platform`, with the dropdown set to `Docker`.
- Next, change the `Application code` setting to `Upload your code`, then click the `Upload` button. You'll see a modal like this:

![Elastic Beanstalk Base Configuration](images/EBUploadYourCode.png)

The modal should be pre-populated with the correct settings if you used the quick launch URL at the top of these instructions. All you need to do is push the `Upload` button in this modal.

These settings will run the Metabase application using [Docker](https://www.docker.com) under the hood, using the official Metabase Docker image which is [published on Dockerhub](https://hub.docker.com/r/metabase/metabase/).

You can now go ahead and click `Review and launch`.

#### Enabling enhanced health checks

You will need to enable enhanced health checks for your Beanstalk Monitoring.

Click on the `Modify` link under the Monitoring section as seen here:

![Elastic Beanstalk Monitoring](images/EBMonitoringSelect.png)

The `Health check path` is how Elastic Beanstalk knows when the application is ready to run. This path is also used by the Load Balancer to check application heath. Set this path to `/api/health`.

Then make sure enhanced health checks are enabled. This is a free option, unless you later add specific metrics to CloudWatch.

![Elastic Beanstalk Monitoring Settings](images/EBMonitoringSettings.png)

#### Configuring RDS for Metabase

To run Metabase in a cloud environment of any kind we highly recommend using an independent database server with high availability such as Amazon RDS. So for standard deployments we will choose to create an RDS instance with our Elastic Beanstalk application.

_NOTE: It's possible to skip this step if you wish. However, this will force Metabase to use a local H2 database file on your application server, and there will be no way to backup and maintain that database. **When your instance is restarted for any reason you'll lose all your Metabase data**. If you are just doing a quick trial of Metabase that may be okay, but otherwise we recommend against it._

To set the database password from the Beanstalk template look for the Database configuration pane as below. It should have a red outline when you first see this page. Next, click on the `Modify` link.

![Elastic Beanstalk Database Configuration Options](images/EBDatabaseConfigurationOptions.png)

The database settings screen will give you a number of options for your application database. Regarding individual settings, we recommend:

- `Snapshot` should be left as `None`.
- `Engine` should be set to `postgres`. Metabase also supports MySQL/Maria DB as backing databases, but this guide currently only covers running Metabase on Postgres.
- `Engine version` can simply be left on the default, which should be the latest version.
- For `Instance class` you can choose any size, but we recommend `db.t2.small` or larger for production installs. Metabase is pretty efficient so there is no need to make this a big instance.
- You can safely leave `Storage` to the default size.
- Pick a `Username` and `Password` for your database. We suggest you hold onto these credentials in a password manager, as it can be useful for things like backups or troubleshooting. These settings will be automatically made available to your Metabase instance, so you will not need to put them in anywhere manually.
- You can safely leave the `Retention setting` as `Create snapshot`.
- Under `Availability` we recommend the default value of `Low (one AZ)` for most circumstances.

![Elastic Beanstalk Database Settings](images/EBDatabaseSettings.png)

Once you've entered a password and clicked `Save`, the red outline on the Database box should have gone away, indicating that the application is valid and ready to be launched.

### Additional Options

#### Using Metabase in a VPC

Newer AWS accounts are encouraging the use of Virtual Private Cloud (VPC) for deployments, and in general we think it's simplest to follow that best practice.

If you prefer not to use a VPC, that's fine. But one thing to note is that some EC2 instance types (`t2.*` specifically) are not available outside of a VPC, so if you choose to not use a VPC then make sure and pick appropriate instance types.

If you are launching your Metabase inside of a VPC you'll now need to check a few boxes to enable your application to work inside your VPC subnets. Click `Modify` on this Network box to set things up.

![Elastic Beanstalk VPC Entry](images/EBVPCEntry.png)

Unless you have a custom VPC setup that you know how to configure, it's easiest to just check all the boxes under `Load balancer settings` and `Instance settings` and allow your infrastructure to exist on all subnets. Note that the Load Balancer cannot be in more than one subnet per availability zone, and the database requires subnets in at least two availability zones. Once you've finished your VPC config click `Save`.

![Elastic Beanstalk VPC Settings](images/EBVPCSettings.png)

### Configuration Details

There are many ways to customize your Beanstalk deployment, but commonly modified settings include:

- `Instance type` (`Instances` block) is for picking the size of AWS instance you want to run. Any size is fine but we recommend `t2.small` for most uses.
  - Remember that you cannot choose a `t2.*` instance type if you did not check the box to run in a VPC.
- `EC2 key pair` (`Security` block) is only needed if you want to SSH into your instance directly. We recommend leaving this out.
- Enter an `Email address` (`Notifications` block) to get notifications about your deployments and changes to your application. This is a very simple way to keep tabs on your Metabase environment, so we recommend putting a valid email in here.
- The remainder of the options can all be safely left to their default values.

### Permissions

If this is your first time creating an application for Elastic Beanstalk then you will be prompted to create a new IAM role for your launched application. We recommend simply leaving these choices to their defaults.

![ebpermissions](images/EBPermissions.png)

When you click `Next` a new tab will open in your browser and you will be prompted to create a new IAM role for use with Elastic Beanstalk. Again, just accept the defaults and click `Allow` at the bottom of the page.

![ebiamrole](images/EBIAMRole.png)

### Wait for your environment to start

This can take a little while depending on Amazon. It’s not uncommon to see this take 20 to 30 minutes, so feel free to do something else and come back to check on it. What's happening here is each part of the environment is being provisioned.

When it's all done you should see something like this:

![ebcomplete](images/EBComplete.png)

To see your new Metabase instance, simply click on the link in parentheses next to your environment name in the top-left. In this example it's `metabase-env-tttt.elasticbeanstalk.com`

Now that you’ve installed Metabase, it’s time to [set it up and connect it to your database](../setting-up-metabase.md).

---

# Deploying New Versions of Metabase

Upgrading to the next version of Metabase is a very simple process where you will grab the latest published Elastic Beanstalk deployment file from Metabase and upload it to your `Application Versions` listing. From there it's a couple clicks and you're upgraded.

Here's each step:

- Go to Elastic Beanstalk and select your `Metabase` application.
- Click on `Application Versions` on the left nav (you can also choose `Application Versions` from the dropdown at the top of the page).
- Download the latest Metabase Elastic Beanstalk deployment file:
  - [https://downloads.metabase.com/{{ site.latest_version }}/metabase-aws-eb.zip](https://downloads.metabase.com/{{ site.latest_version }}/metabase-aws-eb.zip)
- Upload a new Application Version:
  - Click the `Upload` button on the upper right side of the listing.
  - Give the new version a name, ideally including the Metabase version number (e.g. {{ site.latest_version }}).
  - Select `Choose File` and navigate to the file you just downloaded.
  - Click the `Upload` button to upload the file.
  - After the upload completes make sure you see your new version in the Application Versions listing.
- Deploy the new Version:
  - Click the checkbox next to the version you wish to deploy.
  - Click the `Deploy` button in the upper right side of the page.
  - Select the Environment you wish to deploy the version to using the dropdown list.
  - Click the `Deploy` button to begin the deployment.
  - Wait until all deployment activities are completed, then verify the deployment by accessing the Metabase application URL.

Once a new version is deployed you can safely delete the old Application Version if desired. We recommend keeping at least one previous version available for a while in case you desire to revert for any reason.

# Retaining Metabase Logs

If you want to retain the Metabase application logs you can do so by publishing then to an S3 bucket of your choice. Here's how:

- On your Metabase Elastic Beanstalk environment, click on the `Configuration` link in the navigation bar on the left side. You will be taken to a page with a number of boxes containing different configuration options for your environment.
- Click on the box labeled `Software Configuration` under the heading `Web Tier`.
- Scroll down and then check the box labeled `Enable log file rotation to Amazon S3`.
- Click `Save` in the bottom right corner.

After you click save your Environment will begin updating with your new change. You will have to wait a minute for this to complete and then you're good to go. Elastic Beanstalk will now periodically publish the application log files to S3 for you and you can download them and analyze them at your leisure.

# Running Metabase over HTTPS

### Upload a Server Certificate

This is only relevant if you plan to use HTTPS (recommended) for your Metabase instance on AWS. There is no requirement to do this, but we are sticklers for security and believe you should always be careful with your data.

Sadly there is no option to do this via the AWS Console, so this step must be performed using the [AWS CLI client](http://docs.aws.amazon.com/cli/latest/userguide/cli-chap-welcome.html)

    aws iam upload-server-certificate \
    	--server-certificate-name <your-cert-name> \
    	--certificate-body file:///path/to/certificate.crt \
    	--private-key file:///path/to/private-key.pem

This will create a new certificate inside your AWS environment which can be reused for a variety of things. Remember the name you chose for your certificate because we'll use that later in the setup process when we enable SSL.

### Setup DNS CNAME (using AWS)

- Open up the AWS **Route 53** console by navigating to **Services > Networking > Route 53** in the AWS Console header.
- Click on **Hosted Zones** then click on the domain name you want to use for Metabase.
- Click on the blue button **Create Record Set** (a new panel will open up on the right side of the page).
  - Enter in a **Name**: for your application. This should be the exact URL you plan to access Metabase with (e.g. `metabase.mycompany.com`).
  - Under the dropdown for **Type**: select _CNAME - Canonical name_.
  - In the box labeled **Alias**: input the full path to your Elastic Beanstalk environment (e.g. `mycompany-metabase.elasticbeanstalk.com`).
  - Leave all other settings in their default values and click the **Create** button at the bottom of the page.
  - _NOTE: After the record is created you must wait for your change to propagate on the internet. This can take 5-10 minutes, sometimes longer._

### Modify Metabase to enforce HTTPS

Before trying to enable HTTPS support you must upload a server certificate to your AWS account. Instructions above.

- Go to Elastic Beanstalk and select your `Metabase` application.
- Click on Environment that you would like to update.
- Click on `Configuration` on the left hand sidebar.
- Scroll down to `Load Balancing` under the _Network Tier_ section and click the gear icon to edit those settings.
- Set the value for `Secure listener port` to _443_.
- Then, a little bit lower on the dropdown for `SSL certificate ID`, choose the name of the certificate that you uploaded to your account.
  - _NOTE: The certificate MUST match the domain you plan to use for your Metabase install._
- Scroll to the bottom of the page and click `Save` in the lower right.
  - _NOTE: Your Environment will begin updating with your new change. You will have to wait for this to complete before making additional updates._
  - _IMPORTANT: Once this change is made you will no longer be able to access your Metabase instance at the `*.elasticbeanstalk.com` URL provided by Amazon because it will result in a certificate mismatch. To continue accessing your secure Metabase instance you must [Setup a DNS CNAME](#setup-dns-cname)._

Once your application is working properly over HTTPS we recommend setting an additional property to force non-HTTPS clients to use the HTTPS endpoint.

- Click on `Configuration` on the left hand sidebar.
- Scroll down to `Software Configuration` under the _Web Tier_ section and click the gear icon to edit those settings.
- Under `Environment Properties` add an entry for `NGINX_FORCE_SSL` with a value of `1`.
- Scroll to the bottom of the page and click `Apply` in the lower right, then wait for your application to update.

# Setting the JVM Timezone

It's best to set your JVM timezone to match the timezone you'd like all your reports to come in. You can do this by adding the `JAVA_TIMEZONE` environment variable.

- Click on `Configuration` on the left hand sidebar.
- Scroll down to `Software Configuration` under the _Web Tier_ section and click the gear icon to edit those settings.
- Under `Environment Properties` add the following.
  - `JAVA_TIMEZONE` with a value such as `US/Pacific`.
- Scroll to the bottom of the page and click `Apply` in the lower right, then wait for your application to update.

# Using Papertrail for logging on AWS

This provides a simple way to use the Papertrail logging service for collecting the logs for you Metabase instance in an easy to read location.

- Click on `Configuration` on the left hand sidebar.
- Scroll down to `Software Configuration` under the _Web Tier_ section and click the gear icon to edit those settings.
- Under `Environment Properties` add the following entries:
  - `PAPERTRAIL_HOST` - provided by Papertrail
  - `PAPERTRAIL_PORT` - provided by Papertrail
  - `PAPERTRAIL_HOSTNAME` - the name you want to see showing up in Papertrail for this server
- Scroll to the bottom of the page and click `Apply` in the lower right, then wait for your application to update.

_NOTE: Sometimes these settings will not apply until you restart your application server, which you can do by either choosing `Restart App Server(s)` from the Actions dropdown or by deploying the same version again._
