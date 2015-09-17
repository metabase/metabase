
##Asking Questions
---
Metabase's two core concepts are questions and their corresponding answers.  Everything else is based around this functionality.  To ask Metabase a question, use the query interface bar.  

![queryinterfacebar](images/QueryInterfaceBar.png)

Questions are made up of a number of parts:

###Source Data
---
Source data comes from a table in your database.  Typically, users use a single table from their database as the starting point for their questions.  

###Filtering your Data 
---
You can filter your data by any field in the table you're working with or any connected tables through foreign keys. Filters narrow down the source data to an interesting subset, like "active users" or "bookings after June 15th, 2015."  

Different fields can have different filters based on them.
There are four universal operators that can be applied to any field.  These operators are:

* *is a value,* eg. "Status is 'closed'"
* *is not a value* eg. "Status is not 'closed'"
* *is null*, i.e. it isn't set in the record
* *is not null*

Some fields have a limited number of possible operators. Metabase will pick up on this and limit the choices in the filter selection to only valid values.
Some fields (eg. price) will have many possible operators.

Fields that are comparable, like numbers or dates, can also be filtered using the following operators:

* *Less than* a value you enter
* *Greater than* a value you enter
* *Between* two values you enter

If filtering by dates, a datepicker will appear to allow you to input dates easily.

###Answer Output
---
Metabase can output the answer to your query in seven different ways.  
#### Raw Data: 
Raw Data is a table with the answer listed in rows.  It's useful when you want to see the actual data you're working with (rather than an aggregate sum) or when you're exploring a small table with a limited number of records.  

Filter your query by field to see segments of interesting users, venues, or groups, etc. Raw data is an output of each individual record that matches your question's criteria.   
####Other Output Options
What's a *metric*? It's a number that is derived from your source table and takes into consideration any filters or elements you asked Metabase to apply to your question.  Instead of listing an answer in terms of raw data, Metabase can give the answer to certain questions in metric format.  

####Basic Metrics
* **Count:** Total of number of rows in the answer.  Each row corresponds to a separate record.

* **Sum:** Sum of all the values in a column
* **Average:** Average of all the values in a column

####Advanced Metrics
* **Number of Distinct Values:** Number of a column's unique values among all the rows in the answer (Ex. number of different types of items sold in store—*not to be confused with the total number of items sold*)

* **Cumulative Sum:** Additive sum of all the columns (Ex. total revenue over time)
* **Standard Deviation:** Number which expresses how much the values of a column vary among all rows in the answer 

###Breaking Out Metrics: Add a group
---
Metrics are a single number. Often you'll want to know more detailed information. 

For example, the sum of all invoiced amounts is a metric.  It's natural to want to look at this metric across time or another dimension, such as whether the invoices are paid or not. 

You can do this by adding a **Group** element to your question.  You can break out your answer by any date or time dimension in your table, as well as any category field. 

If you apply a *single dimension* to your question, you get a table where the leftmost column is the dimension and the rightmost column is the value of the metric for that dimension's value.
*Two dimension* breakouts are equivalent to a pivot table in Excel and are one of the workhorses of the business intelligence world.
If you break out by additional dimensions, you will add columns to the left of the dimension.

###Advanced Options
---
Click on the three dots on the right hand side of the query interface bar to set advanced settings.  

* Limit your results to 1, 10, 25, 100, or more entries
* Sort by a column: either by clicking on the column header or by selecting the column in the advanced section

####Digging into Individual Records

Click on a record's ID to see more information about a given person, venue, etc.  You can see all fields related to that ID and all connected tables that are hidden for readability in the standard dispaly.  

##Asking more Advanced Questions in SQL
---

If you ever need to ask questions that can't be expressed  using our interactive GUI (guided user interface) query builder, you can use **SQL**.

*What's SQL?* 

* SQL (pronounced "sequel") is short for Structured Query Language and is a widely used standard for getting data from databases. To learn more about it read: [SQL Tutorial](http://www.w3schools.com/sql/default.asp)

Even if you don't understand SQL or how to use it, it's worthwhile to understand how to use it inside Metabase because sometimes other people will share SQL based questions that are useful to you.

###Using SQL
You can switch a card from GUI mode to SQL mode by clicking on the "**>_**" button in the upper right hand corner.  

![sqlbutton](images/SQLButton.png)

You can write SQL directly into the text box that appears.

![sqlinterface](images/SQLInterface.png)

To try it out, type the command `select count(*), date from purchases group by date`. Don't worry if you don't understand this just yet. Click 'run query' and note the table that comes back is the same as if you had graphed "count" broken out by "date". 

Questions asked using SQL can be saved, downloaded, or added to a dashboard just like questions asked using the GUI.


Once you have an answer to your question, you can now learn more about [Visualizing Results](04-visualizing-results.md)