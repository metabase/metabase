### How do I look up connection information for Databases on Herkou?

1. Go to [https://postgres.heroku.com/databases](https://postgres.heroku.com/databases).  
2. Click on the database you want to connect to Metabase. 
3. Write down the following information based on your database:
    * Hostname
    * Port
    * Username
    * Database Name
    * Password

### How do I look up connection information for Databases on Amazon's RDS service?

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