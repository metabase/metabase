# I’m trying to ask a question, but it looks like I can’t access some of the data I need.

There are a few reasons that this may be occurring:

- The data source containing the data may not be connected to Metabase. If you are an administrator, you can see a list of all of your connected data sources by clicking the gear icon, navigating to the Admin Panel, then clicking Databases in the top navigation. 
- You may not have permission to access the data in question. Your administrator may need to [adjust your access](../../administration-guide/05-setting-permissions.md) by changing or modifying your user group.
- The data may live in a different table other than the one you selected to begin the question. 
 - If you are using a Metabase version earlier than 0.33, you will need to either write a SQL query that contains joins, or have your Metabase administrator [set up foreign keys](../../administration-guide/03-metadata-editing.md)). 
 - If you are using Metabase 0.33 or above, you can perform joins using the Notebook editor. Note that you will need to choose a field to join on, or link, the two tables together. For instance, if you want to combine a Customer table with an Order table, you might select the ID field in the Customer table and link it to the customer_id field in the order table.
 
* The data may live in a different database than the one you selected to begin the question. Metabase does not currently support joining across multiple databases. Generally, it is better to bring related data into the same database.

