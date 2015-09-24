
##Step 2: Configuring your Instance
Create a Metabase account by entering your name and email.  Create a super-secretive password!

![accountsetup](images/AccountSetup.png)

Once you have an account, you can now connect Metabase with your data.  Where does your data live?  Depending on where you keep your database, the steps to connect with Metabase vary.  Not to worry, though, we outlined the configuration steps for each platform Metabase supports.  

###If you use Heroku: 

1. Go to [https://postgres.heroku.com/databases](https://postgres.heroku.com/databases).  
2. Click on the database you want to connect to Metabase. 
3. Write down the following information based on your database:
    * Hostname
    * Port
    * Username
    * Database Name
    * Password

You'll need to input this information into the remainder of the Metabase form.  

###If you use AMAZON RDS:

1. Go to your AWS Management Console. 
    * Need help finding that?  Visit [https://**My_AWS_Account_ID**.signin.aws.amazon.com/console](https://**My_AWS_Account_ID**.signin.aws.amazon.com/console).  Be sure to insert your own AWS Account ID, though! 
2.  Under "Database" services, click "RDS". 
3.  Then click "Instances".
4.  Select the database you want to connect to Metabase.  
5.  Write down the following information based on your database:
    * Hostname - This is listed as the "Endpoint" parameter
    * Port - Find the port parameter under "Security and Network"
    * Username - Find this under "Configuration Details"
    * Database Name - Find this under "Configuration Details"
    * Password - Ask your database administrator for the password. 

You'll need this information to finish syncing Metabase with your database.  

###If you use another REMOTE MySQL or POSTGRES: 

1. Ask your database administrator (or check your own records) for the following information
    * Hostname
    * Port
    * Username
    * Database Name
    * Password

You'll need to input this information into the Metabase form.  

###If you use MONGODB:

1.  Collect the following information about the database you'd like to connect to Metabase. 
    * Hostname
    * Port
    * Username
    * Database Name
    * Password

Metabase needs this information to finish connecting to your database.  

###If you use H2:

1.  You'll need the file path for your database. 

**Now that you have your database information,** use the information to fill out the remainder of the form.  

![adddatabase](images/AddDatabase.png)

After you enter your database's information, Metabase will try to connect to your database and validate the credentials.  If you get a validation error, no need to panic.  Validation errors occur when the wrong credentials are entered.  Simply double check the spelling and punctuation of the information you entered and try to connect to the database once more. 

Once Metabase successfully connects to your database, it'll run a few queries against your database to build a model of your data.  Click the prompt "continue" to see what data Metabase found in your database!

 
   



Now that you've connected Metabase to a database, let's [learn how to ask questions](03-asking-questions.md)