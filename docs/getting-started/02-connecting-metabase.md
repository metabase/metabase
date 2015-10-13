
## Step 2: Connecting to a database


### Setting up the admin account
The first step is setting up an admin account. The account you create when you first install Metabase is an admin account by default — handy! If you were installing Metabase on a production server, you should be really careful with the password for this account since it will be used to add other users, connect to databases, set up email, and more. You can also create additional admin accounts later.

For now, let's just create an account for ourselves to explore Metabase. Type in your info, and when you’re ready to continue, click the **Next** button.


![accountsetup](images/AccountSetup.png)

### Gathering your database info
At this point you’ll need to gather some information about the database you want to use with Metabase. We won’t be able to connect to your database without it, but you’d like to deal with all of this later, that’s okay: just click **I’ll add my data later**.

If you’re ready to connect, here’s what you’ll need:

* The **hostname** of the server where your database lives
* The **port** the database server uses
* The **database name**
* The **username** you use for the database
* The **password** you use for the database

If you’re using Heroku, here are [instructions on how to get this information](../frequently-asked-questions/questions#how-do-i-look-up-connection-information-for-databases-on-heroku). If you’re an Amazon RDS kind of person, you can follow [these instructions](../frequently-asked-questions/questions#how-do-i-look-up-connection-information-for-databases-on-amazons-rds-service). 

If you don't have this information handy, the person responsible for administering the database should have it. 

![adddatabase](images/AddDatabase.png)
  
### Connect to your database
Now that you have your database info you can connect to your database. Sweet, sweet data at last.

### Usage data preferences
One last quick thing that you’ll have to decide is if it’s okay for us to collect some anonymous info about how you use the product — it helps us a bunch to make Metabase better! Like the box says:
* Metabase never collects anything about your data or question results.
* All collection is completely anonymous.
* Collection can be turned off at any point in your admin settings.

![Usage data preferences](images/UsageData.png)

Now that you've connected Metabase to a database, let's [learn how to ask questions](03-asking-questions.md).