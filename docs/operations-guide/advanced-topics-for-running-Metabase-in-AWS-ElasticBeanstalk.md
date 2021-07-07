- [Logging](#logging)
  - [Network Access log](#network-access-log)
  - [Application Logs](#application-logs)
  - [Using Papertrail for logging on AWS](#using-papertrail-for-logging-on-aws)
- [Running Metabase over HTTPS](#running-metabase-over-https)
  - [Upload a Server Certificate](#upload-a-server-certificate)
  - [Setup DNS CNAME (using AWS)](#setup-dns-cname-using-aws)
  - [Modify Metabase to enforce HTTPS](#modify-metabase-to-enforce-https)

# Logging
## Network Access log

If you need a log of all the IP addresses and URLs that were accessed during a specific period, you can configure the Load Balancer to send those logs to S3. This is useful for analyzing the traffic to your Metabase instance.

To enable this logging, you have to go to the settings of the Load Balancer and enable **Store Logs** in the **Access Log Files** section. You will need to choose an S3 bucket to dump the logs in, and a prefix that will identify the logs coming from this load balancer.

## Application Logs

If you want to retain the Metabase application logs, you can publish them to an S3 bucket:

- On your Metabase Elastic Beanstalk environment, click on the `Configuration` link in the navigation bar on the left side. On the configuration page, click on the `Edit` button next to `Software`.
- Scroll down and then check the box next to **Enabled** in S3 log storage section.
- Click `Save` in the bottom right corner.

You'll need to wait a minute for the logging to kick in, but then you should be good to go. Elastic Beanstalk will now periodically publish the application log files to S3, which you can download whenever you need to analyze them.

## Using Papertrail for logging on AWS

You can also use the [Papertrail logging service](https://www.papertrail.com/) for collecting your application logs.

- Click on **Configuration** on the left hand sidebar.
- Under the _Web Tier_ section, scroll down to **Software Configuration** and click the gear icon.
- Under **Environment Properties** add the following entries:
  - `PAPERTRAIL_HOST` - provided by Papertrail
  - `PAPERTRAIL_PORT` - provided by Papertrail
  - `PAPERTRAIL_HOSTNAME` - the name you want to see showing up in Papertrail for this server
- Scroll to the bottom of the page and click **Apply** in the lower right, then wait for your application to update.

_NOTE: Sometimes these settings will not apply until you restart your application server, which you can do by either choosing `Restart App Server(s)` from the Actions dropdown or by deploying the same version again._

# Running Metabase over HTTPS

There is no requirement to run Metabase over HTTPS, but we are sticklers for security and believe you should always be careful with your data. Here's how to set up HTTPS on AWS.

## Upload a Server Certificate

First, you need to open a new tab in your browser and search for AWS certificate manager in your AWS Dashboard. Once inside, you have the options for provisioning certificates or become a private certificate authority. We will choose `Provision certificates` and we will click on `Get Started`.

A blue button will appear on the top of the page with the feature to import certificates (you can also ask AWS for a new certificate if needed and they will provision one for you)

Follow the steps to input your certificates details. Once you submit your certificate details, you'll see the certificate in other tools of AWS (like HTTPS on your load balancer).

## Setup DNS CNAME (using AWS)

- Open up AWS **Route 53** by navigating to **Services > Networking > Route 53** in the AWS Console header.
- Click on **Hosted Zones**, then click on the domain name you want to use for Metabase.
- Click on the blue button **Create Record** (a new panel will open up).
  - Enter in a **Record name**: for your application. This record name should be the exact URL you plan to access Metabase with (e.g. `metabase.mycompany.com`).
  - Under the dropdown for **Record type**: select _A – Routes traffic to an IPv4 address and some AWS resources_.
  - Enable the **Alias** switch. For the **Route traffic to** option, select __Alias to Application and Classic Load Balancer__, region __US East (Ohio) [us-east-2]__, or the one that you deployed your instance to (e.g. `mycompany-metabase.elasticbeanstalk.com`).
  - Choose the load balancer that corresponds to your instance.
  - Leave all other settings in their default values.
  - At the bottom of the page, click **Create Record** .
 
After creating the record, the record can take ten minutes (sometimes longer) to propagate on the Internet.

## Modify Metabase to enforce HTTPS

Before trying to enable HTTPS support, you must upload a server certificate to your AWS account.

- Go to Elastic Beanstalk and select your **Metabase** application.
- Click on Environment that you would like to update.
- One the left sidebar, click **Configuration**. 
- Scroll down to **Load Balancer** and click the Edit button on the right of the screen.
- On Listeners section, click on **Add Listener** and change the Protocol to HTTPS on the modal window that opens.
- Set the value for **Port** to 443.
- Click on **SSL certificate ID** and choose the name of the certificate that you uploaded.
  - The certificate MUST match the domain you plan to use for your Metabase install.
- In SSL Policy select "ELBSecurityPolicy-TLS-1-2-2017-01".
- Scroll to the bottom of the page and click **Save**.

Your Environment will begin updating with your new change. You will have to wait for this to complete before making additional updates.
 
 Once this change is made you will no longer be able to access your Metabase instance at the *.elasticbeanstalk.com URL provided by Amazon because it will result in a certificate mismatch. To continue accessing your secure Metabase instance you must [Set up a DNS CNAME](#setup-dns-cname-using-aws).

Once your application is working properly over HTTPS, we recommend setting an additional property to force non-HTTPS clients to use the HTTPS endpoint.

- Click on **Configuration** on the left hand sidebar.
- Scroll down to **Software Configuration** under the _Web Tier_ section and click the gear icon to edit those settings.
- Under **Environment Properties** add an entry for `NGINX_FORCE_SSL` with a value of `1`.
- Scroll to the bottom of the page and click **Apply** in the lower right, then wait for your application to update.
- Click on `Configuration` on the left hand sidebar.
- One the left sidebar, click **Configuration**. 
- Scroll down to `Load Balancer` and click the Edit button on the right of the screen.
- On Listeners section, click on "Add Listener" and change the Protocol to HTTPS on the modal window that opens.
- Set the value for `Port` to _443_.
- Then, a little bit lower on the dropdown for `SSL certificate ID`, choose the name of the certificate that you uploaded to your account.
  - _NOTE: The certificate MUST match the domain you plan to use for your Metabase install._
- In SSL Policy select `ELBSecurityPolicy-TLS-1-2-2017-01`
- Scroll to the bottom of the page and click `Save` in the lower right.
  - _NOTE: Your Environment will begin updating with your new change. You will have to wait for this to complete before making additional updates._
  - _IMPORTANT: Once this change is made you will no longer be able to access your Metabase instance at the `*.elasticbeanstalk.com` URL provided by Amazon because it will result in a certificate mismatch. To continue accessing your secure Metabase instance you must [Setup a DNS CNAME](#setup-dns-cname-using-aws)._

Once your application is working properly over HTTPS, we recommend setting an additional property to force non-HTTPS clients to use the HTTPS endpoint.

- Click on `Configuration` on the left hand sidebar.
- Scroll down to `Software Configuration` under the _Web Tier_ section and click the gear icon to edit those settings.
- Under `Environment Properties` add an entry for `NGINX_FORCE_SSL` with a value of `1`.
- Scroll to the bottom of the page and click `Apply` in the lower right, then wait for your application to update.

# RAM usage monitoring

Metabase installs the CloudWatch agent into the Elastic Beanstalk deployment, which sends data about your deployment to CloudWatch, allowing you to track your Metabase's RAM usage and other metrics.

To set up CloudWatch for your Elastic Beanstalk environment, follow the steps in the AWS documentation to [grant permissions to publish CloudWatch metrics](https://docs.aws.amazon.com/elasticbeanstalk/latest/dg/customize-containers-cw.html#customize-containers-cw-policy).

# Automated security assessment

Metabase installs the AWS Inspector into the Elastic Beanstalk deployment, so you can have real-time assessments about your instance's security that you can integrate into other AWS products. To start the automated checks on your instance, you only need to enable the Inspector in AWS's console.

# About NGINX configs inside Elastic Beanstalk deployments

In the near future we will be removing the custom NGINX configuration that was being bundled with Metabase in the previous configurations, so in the case that you were using configurations like NGINX_FORCE_SSL or custom certificates, you will need to move these configurations to AWS Application Load Balancers. To do this, check out the [enabling VPC](https://www.metabase.com/docs/latest/operations-guide/running-metabase-on-elastic-beanstalk.html#22-enabling-vpc) part of the Elastic Beanstalk guide where it's specified how to use an Application Load Balancer with your Elastic Beanstalk configuration, or otherwise start over the creation of your Elastic Beanstalk deployment [having made a backup first](backing-up-metabase-application-data.html) of your application database so you don't lose your Metabase configuration.