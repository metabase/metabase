##Welcome to Metabase
Metabase lets you ask questions about your data, drill into specific records, and utilize dashboards to help you keep organized.  Metabase is a tool that allows you to get the most out of your data.  Let's get started! 

##Step 1: Installing Metabase
Metabase uses Java to operate, so you'll need at least version 1.6 or later.  Not sure what version of Java you're using?  No problem.  Here's how to check:  

###Mac Users

In Terminal, insert the command prompt: "java-version".  You will receive a message similar to: 

```
java version "1.6.0_65"

Java (TM) SE Runtime Environment (build 1.6.0_65-b14-466.1-11M4716)

Java HotSpot (TM) 64-Bit Server VM (build 20.65-b04-466.1, mixed mode)
```

As long as the version is at least 1.6, you're all set to go!

###Windows Users

Under Programs, click on the "Java" icon.  Click on "About" and then find the version number listed.  If you're using version 1.6 or greater, then you're good to go! 

If you don't have the latest version of Java, download it at: [https://java.com/en/download/]()

Once you take care of checking the version of java on your computer, **Download the Metabase file from [www.metabase.com/download]()**.  Place the Metabase JAR file in a directory.  Run the command "java -jar metabase.jar" to create a file called, "metabase.db.h2.db".  **This file contains important application data, so don't delete it.**

Now that you have Metabase installed, you can sync it to your database.  Go to [http://localhost:3000]() to connect your database.

##Step 2: Configuring your Instance
Create a Metabse account by entering your name, email, and super-secretive password—we don't recommend using password123!

Now Metabase needs to find your data.  Where does your data live?  Depending on where you keep your database, the steps to connect with Metabase vary.  Not to worry, though, we outlined the configuration steps for each of the major platforms.  If you're not sure, ask the DBA, System Administrator or Analyst responsible for the data you'll want to use with Metabase.

**If the data you want to use lives on Heroku:**

1. Go to [https://postgres.heroku.com/databses]().  
2. Click on the databse you want to connect to Metabase.
3. Write down the following information based on your database.
    * Hostname
    * Port
    * Username
    * Database Name
    * Password
You'll need to input this information into the remainder of the Metabase form.  

**If the data you want to use lives on Amazon RDS:**

1. Go to your AWS Management Console. 
    * Need help finding that?  Visit https://**My_AWS_Account_ID**.signin.aws.com/console/  Be sure to insert your own AWS Account ID, though!
2.  Under "Databse" services, click "RDS".  
3.  Then click "Instances".
4.  Select the databse you want to connect to Metabase.  
5.  Write down the following information based on your database. 
    * Hostname - This is listed as the "Endpoint" parameter
    * Port - Find the port parameter under "Security and Network"
    * Username - Find this under "Configuration Details"
    * Database Name - Find this under "Configuration Details"
    * Password - Ask your database administrator for the password
You'll need this information to finish syncing Metabase with your database.

**If the data you want to use lives on another Remote MySQL or Postgres:**

1. Ask your database administrator (or check your own records) for the following information:
    * Hostname
    * Port
    * Username
    * Database Name
    * Password
You'll need to input this information into the Metabase form.  

**If the data you want to use lives on MongoDB:**

1.  Collect the following information about the database you'd like to connect:
    * Hostname
    * Port
    * Username
    * Database Name
    * Password
Metabase needs this information to finish connecting to your database.  

**If the data you want to use lives on H2:**

1.  You'll need the file path for your database.

**Now that you have your database information,** use the information to fill out the remainder of the form.  

After you enter your database's information, Metabase will try to connect to your database and validate the credentials.  If you get a validation error, no need to panic.  Validation errors occur when the wrong credentials are entered.  Simply double check the spelling and punctuation of the information you entered and try to connect to the database once more.  

Once Metabase successfully connects to your database, it'll run a few queries against your database to build a model of your data.  Click the prompt "continue" to see what data Metabase found in your database!

##Step 3: Discovering your Data
If you look at your homepage, you'll see the different tables that Metabase was able to find in your data source set and pull for you.  Click a table you want to lear more about.  Note the number of rows.  

For example, in the sample data set above, the database (data source) is "Bird Impact"(it's a database of the number of collisions between birds and aircrafts).  The table is "strikes" and the number of rows is 151,069.  

##Step 4: Asking your Question
By clicking on an individual table, you enter the interface (pictured below) that allows you to ask Metabase questions based on your data. 

Your screen will reflect the data source you connected to Metabase and the table you selected.  In our example, the data source is "Bird Impact" and the table  is "strikes" (exactly what we selected on the previous screen).  

For now, let's start with a basic question using our data set.  How many collisions were there between aircrafts and birds?  More precisely, this question translates to "How many records are in the table 'strikes'?"  To find a number, we want to see the **total count**.  

Click **total count** from the dropdown menu next to **I want to see**.  Then, click the **Find Out** button in the bottom right hand corner of the screen.

There were 151,069 collisions between aircraft and birds.  Stated in terms of the database, there are 151,069 records in the table.  *Does this number look familiar?*  When selecting a table on the homepage in Step 3 (See *Figure 1*), 151069 was labeled as "total" and listed next to the table "strikes".

**The total number listed next to each table is the number of records.  Each record is an iteration of the event your database records.**

Metabase can present the answers to your questions in a variety of formats.  To change the format, select one of the options from the dropdown menu in the bottom left hand corner of the screen next to **Show as**.  

Not every format is the best way to show an answer to a question.  If Metabase thinks that's the case with a specific question and display format, it'll say that the format is "not sensible" for the question.  For example, it wouldn't make sense to show the number of collisions between aircraft and birds as a singular bar graph.  

You can "group" your data into categories.  Next to **Grouped by:** select the category to filter your answers by.  Metabase will analyze your database to discover valid categories for adding filters to your question.  For example, by grouping the results by the filter "PRECIP" (short for "precipitation"), we can use Metabase to view the number of collisions between aircraft and birds categorized by the weather conditions at the time.  

**When you make any changes to the question (called the "query"), an orange alert appears to let you know that the answer displayed is outdated.**  Click **Find Out!** to refresh the answer and to find the answer to your new query.  

By clicking **Hide Query**, you're able to view all your results clearly.  Metabase temporarily hides the query interface, so you can easily see the results.  To ask a new question, select **Show query** to return to the question asking interface.  





  
  
  

