# Install Metabase

* TODO: upload expa ssl certificate to IAM and grab the urn
* Create a new **Application** called *Metabase*
* Inside the *Metabase* **Application**
	* Create a new **Application Version** for _metabase-*_ (each new deployed release of Metabase will represent a new version here)
	* Create a new **Environment** for *expa-metabase-reserve*
		* Follow the detailed instructions on **Creating a New Environment**
	* Save the **Environment Configuration**
		* NOTE: only do this after the Environment is fully configured and working as desired
		* Navigate to the desired **Environment** in the AWS console
		* Click on the dropdown for Actions in the upper right corner and select Save Configuration
			* Give the configuration a name (e.g. Expa-Metabase-2015May15)
			* Click the Save button
	* Launch each remaining **Environment** using your saved configuration
		* Follow the detailed instructions on **Creating an Environment from a Saved Configuration**

# Creating a New Environment (RDS + ELB/Https)

* Prerequisites
	* Create an Application
	* Create an Application Version
	* Upload SSL Certificate (only if you are doing https support)
* New Environment
	* Select Web Server Environment by clicking the button **Create web server**
	* Permissions Popup
		* Select the option for **Create an IAM role and instance profile** (default)
		* Click **Next**
* Environment Type
	* Select **Generic > Docker** under Predefined configuration:
		* NOTE: you do NOT want to select multi-container Docker
	* Select **Load balancing, auto scaling** for the Environment type: (default)
	* Click **Next**
* Application Version
	* Select the version you wish to deploy under **Existing application version**
		* NOTE: if you don’t see any options listed here then you have not uploaded any Metabase versions yet, so stop and do that now.
	* Leave all the settings under Deployment Limits on their defaults
* Environment Information
	* Pick a sensible name to refer to your environment (e.g. <your company>-metabase)
	* The Environment URL will be the final url you will use to access your instance, so pick that accordingly.  Most of the time this should be the same name of your environment.
	* Click **Next**
* Additional Resources
	* Check the box for **Create an RDS DB Instance with this environment**
	* You can leave the box unchecked for Create this environment inside a VPC
* Configuration Details
	* Choose the **Instance type** you wish to use.  Any size is fine but we recommend *t2.micro* for trials and *t2.small* or bigger for production deployments.
		* NOTE: the default setting is often t1.micro which is an old instance class.  we recommend at least changing this to *t2.micro*
	* Leave the **EC2 key pair** unselected
	* Enter an **Email address** to get notifications about your deployment.  This is a very simple way to keep some tabs on your Metabase environment, so we recommend putting a valid email in here.
	* For **Application health check URL**: enter … /api/health
		* this is a url within the Metabase application specifically designed for reporting health status to services like AWS
	* The remainder of the options can all be left to their default values
	* At the bottom of the page click **Next**
* Environment Tags
	* No need to enter anything on this page.  Simply click **Next**
* RDS Configuration
	* Leave the **Snapshot**: as *None*
	* For **DB engine**: select *postgres*
	* Under **Instance class**: you can choose any size, we recommend *db.t2.micro* for trial installs and *db.t2.small* or bigger for production installs.
		* NOTE: the default setting is often *db.t1.micro* which is an old instance class.  we recommend at least changing this to *db.t2.micro*
	* You can safely leave **Allocated storage**: at the default setting of *5GB*
	* Pick a **Username**: and **Password**: for you database.  This is just for reference if you need to connect to your db directly for some reason, but generally this should not be necessary.  These settings will be automatically made available to your Metabase instance, so you will not need to put them in anywhere manually.
	* You can safely leave the **Retention setting**: as *Create snapshot*
	* Under **Availability**: we recommend the default value of *Single Availability Zone* for most circumstances.
	* Click **Next**
* Review Information
	* Give everything a quick double check and then hit **Launch** to start up your Environment
		* NOTE: if you are doing https support we will handle that in the next step.  when launch from the AWS Console this is no option to specify https settings when you first launch your Environment
* Wait for your Environment to start
	* This can take a little while depending on Amazon.  It’s not strange to see this take 20-30 minutes, so feel free to do something else and come back.
* Environment Configuration Updates
	* Make sure you are starting on the Dashboard page of your running environment
	* Click on **Configuration** link in the navigation bar on the left side.  You will be taken to a page with a number of boxes containing different configuration information.
	* Retain Logs (optional: if you don’t care about retaining application logs you can safely skip this step)
		* Click on the box labeled **Software Configuration** under the heading Web Tier
		* Check the box **Enable log file rotation to Amazon S3**
		* Click **Save** in the bottom right corner
		* NOTE: your Environment will begin updating with your new change.  you will have to wait for this to complete before making additional updates
	* Limit Scaling
		* Click on the box labeled **Scaling** under the heading Web Tier
		* Set the value for **Maximum instance count**: to *1* (the default is *4*)
		* All other settings can remain unchanged
		* Click **Save** in the bottom right corner
		* NOTE: your Environment will begin updating with your new change.  you will have to wait for this to complete before making additional updates
	* Https Support (optional: if you are just doing a trial or don’t have an ssl certificate you can skip this)
		* Prerequisites
			* Before trying to enable Https support you must **Upload a Server Certificate** to your AWS account
		* Click on the box labeled **Load Balancing** under the heading **Network Tier**
		* Set the value of **Listener port**: to *OFF*
		* Set the value of **Secure listener port**: to *443*
		* In the dropdown for **SSL certificate ID**: choose the certificate that you would like to use for this Environment
			* NOTE: the certificate MUST match the domain you plan to use for your Metabase install
		* Scroll to the bottom of the page and click **Save** in the lower right
			* NOTE: your Environment will begin updating with your new change.  you will have to wait for this to complete before making additional updates
			* IMPORTANT: once this change is made you will no longer be able to access your Metabase instance at the *.elasticbeanstalk.com url provided by Amazon because it will result in a certificate mismatch.  To  continue accessing your secure Metabase instance you must **Setup DNS CNAME**

# Upload a Server Certificate
	
* NOTE: There is no option to do this via the AWS Console, so this step must be performed using the AWS CLI
	* http://docs.aws.amazon.com/cli/latest/userguide/cli-chap-welcome.html
* aws iam upload-server-certificate --server-certificate-name metabase-dev --certificate-body file://dev.metabase.com.crt --private-key file://dev.metabase.com.pem

# Setup DNS CNAME (using AWS)
* Open up the AWS **Route 53** console by navigating to **Services > Networking > Route 53** in the AWS Console header
* Click on **Hosted Zones** then click on the domain name you want to use for Metabase
* Click on the blue button **Create Record Set** (a new panel will open up on the right side of the page)
	* Enter in a **Name**: for your application.  this should be the exact url you plan to access Metabase with.  (e.g. metabase.mycompany.com)
	* Under the dropdown for **Type**: select *CNAME - Canonical name*
	* In the box labeled **Alias**: input the full path to your Elastic Beanstalk environment (e.g. mycompany-metabase.elasticbeanstalk.com)
	* Leave all other settings in their default values and click the **Create** button at the bottom of the page
	* NOTE: after the record is created you must wait for your change to propagate on the internet.  this can take 5-10 minutes, sometimes longer.

# Deploying New Versions

* Go to Elastic Beanstalk, select the **Metabase** application
* Click on **Application Versions** on the left nav
* Upload a new Version
	* Click the **Upload** button on the upper right side of the listing
		* Give the new version a name, ideally including the Metabase version number (e.g. Metabase-0.6.1)
		* Select Choose File and navigate to the location of the Metabase aws-eb-*.zip bundle you want to upload
			* NOTE: the AWS console requires uploading here, but via api you simply specify an S3 location
		* Click the **Upload** button to upload the file
	* After the upload completes make sure you see your new version in the Application Versions listing
* Deploy a Version
	* Click the checkbox next to the version you wish to deploy
	* Click the **Deploy** button in the upper right side of the listing
		* Select the Environment you wish to deploy the version to using the dropdown list
		* Click the **Deploy** button to begin the deployment
	* Wait until all deployment activities are completed, then verify the deployment by accessing the application url
* NOTE: once a new version is deployed you can safely delete the old Application Version if desired.  we recommend keeping at least one previous version available for a while in case you desire to revert for any reason.