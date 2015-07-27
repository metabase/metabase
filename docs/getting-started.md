## Getting Started

### Installation
* download jar from www.metabase.com/download
* make sure you have java by running `java —version` and verify that you have version 1.6 or greater
* place the jar in a directory and run `java -jar metabase.jar`. this will create a file called metabase.db.h2.db which contains application data. Do not delete this file.
* go to http://localhost:3000 to start the installation process

### Configure your instance
* enter your name, email and a password
* collect the information you’ll need to point to a database
	* Heroku:
		* go to https://postgres.heroku.com/databases
		* select the database you want to connect to and click it
		* find the hostname, port, username, database name and password 
	* Amazon RDS:
		* go to your AWS management console
		* click RDS under ‘Database’ services
		* click “instances"
		* click on the database you want to use
		* the hostname is the “Endpoint” parameter, the port parameter under “Security and Network”, DB name and username are under “configuration details". You’ll need to ask you DB Administrator for password
	* other remote MySQL or Postgres:  ask your DB Administrator (or check you records) for hostname, port, database name, user name and password
	* Mongodb
		* collect the database name, host, port, username and password
	* H2 database (including examples)
		* get the file path
* Taking the connection information above, fill out the remainder of the form.
* Metabase will attempt to connect to your database and validate the information you’ve given it. If you get a validation error, double check the spelling and punctuation of the information you’ve connected. 
* If successful, Metabase will run a few queries against your database to build a model of your data and you can click “continue” to move on to see what data Metabase has found!

### Seeing what data you have
* In the bottom portion of the home page, you’ll see the tables that metabase was able to find
* note the number of rows 
* click on one of these that you find interesting

### Asking your first question
* you’re now in the question asking interface
* try getting the “Count” of records in this table.
* click “Find out" 
* this should match the number of rows you saw previously
* try performing a “group by” and selecting a field that looks interesting. 
* click “find out”.
* this should result in a table of how many rows have each value in that column
* click on the download icon and note that you’ve downloaded a csv with this information
* you can also filter results, try clicking “filter"
* you should see a list of fields. select an interesting one, and filter your results
* click “find out”
* note that the numbers changed

### Visualizing answers
* If the grouped by dimension was a date, try displaying it as a “line” graph, otherwise try clicking “bar” chart
* note that you can display your answer in a variety of ways

### Saving your question for later
* Click “save" and give the answer a name
* for now ignore description and permissions
* note that you can now favorite the card as well 

### Dashboards
* go to the question you previously saved and click on the add to dashboard icon
* select “Create new” and give your new dashboard a name
* click ok,  you should see a confirmation box that gives you a link to the new dashboard
* click on the link and check out the new dashboard. you’ll notice that the visualization of your question has been added to the dashboard.
* create another card and add it to this dashbaord
* go back to the dashboard and click on the edit layout link
* note that you can resize cards on the dashboard and drag them around
* click the edit layout link again to save the dashboard in this form


Congrats! you’ve learned how to ask questions, save them for later use or sharing and publish them to a dashboard you can use or share with others
