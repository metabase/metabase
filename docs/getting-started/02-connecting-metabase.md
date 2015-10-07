
## Step 2: Connecting to a database


### Setting up the admin account
The first step is setting up an admin account. The account you create when you first install Metabase is an admin account by default — handy! If you were installing Metabase on a production server, you should be really careful with the password for this account since it will be used to add other users, connect to databases, set up email, and more. You can also create additional admin accounts later.

For now, let's just create an account for ourselves to explore Metabase.


![accountsetup](images/AccountSetup.png)

### Gathering your database info
At this point you’ll need to gather some information about the database you want to use with Metabase. We won’t be able to connect to your database without it. Here’s what you’ll need:

    * The **hostname** of the server where your database lives
    * The **port** the database server uses
    * The **database name**
    * The **username** you use for the database
    * The **password** you use for the database
If you use Heroku, here are [instructions on how to get this information](../frequently-asked-questions/questions#how-do-i-look-up-connection-information-for-databases-on-heroku). Likewise, if you’re using Amazon RDS, you can follow [these instructions](../frequently-asked-questions/questions#how-do-i-look-up-connection-information-for-databases-on-amazons-rds-service). 

If you don't have this information handy, the person responsible for administering the database should have it, so you’ll have to ask them.
  
### Connect to your database
Now that you have your database info you can connect to your database. Sweet, sweet data at last.

![adddatabase](images/AddDatabase.png)

After you enter your database's information, Metabase will try to connect to it and validate the credentials. If Metabase is unable to connect, please verify the connection credentials and try again. 

Once Metabase successfully connects to your database, it'll run a few queries against your database to build a model of your data. Click “continue” to see what data Metabase found in your database!

Now that you've connected Metabase to a database, let's [learn how to ask questions](03-asking-questions.md)