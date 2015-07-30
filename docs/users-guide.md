# User Manual

## Overview
### What is metabase?
It's an open source business intelligence server

* a way to ask simple questions
* a way to save them for later
* group them into dashboards
* and share questions + dashboards with others


### A Short Overview of Databases
Before we talk about metabase, it's useful to give a short overview of the terminology we will use. 
A database is a collection of tables.

#### Tables
Tables have one or more columns and one or more rows. 
A row is made up of cells where each cell has a value for the columns in the 
An example of a table:

| Name | Age |
| ---- | --- |
| John | 25 |
| Jenny | 31 |

Here the columns would be `Name` and `Age`. The first row would contain two cells, one with `John` and one with `25`


#### Columns
Each field has a type that describes what kind of data a field stores.
Examples of types:

* String Types (TEXT, CHAR, VCHAR etc)  - These store things like names, addresses, and anything else that is free text.
* Numerical Types (Integer, Float, DoubleFloat, Decimal, etc) - These store numbers. Integers are whole numbers while Floats and Decimals are ways to store numbers with decimals in them. These store things like age, bank account balances, costs, latitudes, longitudes, etc. 
* Time Types (Timestamp etc) - These are a special format of a number to store dates and times (or both). Sometimes databases store an integer timestamp which is either seconds or milliseconds since `00:00:00 Coordinated Universal Time (UTC), Thursday, 1 January 1970`. This is a convention that allows for compact storage of timestamps. 
* IDs - Also called primary keys

#### Relationships
Tables can contain references to other tables. For example, imagine a car reservation application where one can book a car in advance. 
Our application would have two tables, one for reservations, let's call it `Reservations` and one for customers, called `Customers`. 
To connect reservations to customers, it is typical in databases to use a field called a `Foreign Key` where the contents of the field are the same value as the ID value of the connected row in the other table.
For example, in our hypothetical application, we could connect each reservation to the customer that made the reservation by having the `customer` column of the reservation contain the same value as the `id` column of the customer who made the reservation.

##### Reservations

| ID | Customer | Time |
| --- | ---- | --- |
| 1  | 11 | 12/20/2015 |
| 2  | 12 | 1/2/2016 |

##### Customers

| ID | Name | Age |
| --- | ---- | --- |
| 11 | John | 25 |
| 12 | Jenny | 31 |

If your database contains these kinds of relationships (and many do), you can use linked objects in this way. So if our hypothetical application database were examined with Metabase, we could ask questions like:
-- Example of a join -- 


### Questions
The core concept in Metabase are Questions and their corresponding Answers. 
Questions are made up of a number of parts:

* source data - database + table. Typically you will be working with a single table in your database as the starting point for you questions. 
* optional filter - this narrows down the source data to an interesting subset, like "active users" or "bookings after June 15th, 2015"
* aggregation clause - bare rows, count, etc
* group by field or fields
* Advanced Options
	* Limit to 1, 10,1000 or more entries
	* Sort by a column: either by clicking on the column header or by selecting the column in the advanced section

And can be visualized in a number of ways

* scalar
* table
* charts
* maps

Once answered they can be saved, favorited or downloaded

### Dashboards
* made up of multiple cards in a given position
* used to share groups of questions that should be 


## Asking questions

### Raw Data: 
Just a table with the rows in the answer.
Useful to see the data you're working with, or for exploring small tables.
Useful when combined with Filtering to see segments of interesting Users, venues, etc. These segments can be saved and passed around.

### Different kinds of metrics
What is a metric? It's a number that is derived from your the source table (filtered by any filters you've added described later). 

#### Basic Metrics
* Count: Total of number of rows in the answer
* Sum: Sum of all values in a column
* Average: Average of all values in a column
* Advanced Metrics
* Number of Distinct Values: Number of unique values of a column among all the rows in the answer
* Cummulative Sum: Additive sum of all the columns, eg. total revenue over time
* Standard Deviation: Number which expresses how much the values of a column vary among all rows in the answer


### Breaking out metrics
Metrics are single numbers. 
Often you'll want to know more detailed information. 
For example, the sum of all invoiced amounts is a metric. 
It's natural to want to look at this metric across either time or another dimension, such as whether the invoice is paid or not. 
You can do this by adding a "Grouping" to your question.
You can breakout by any date or time dimension you have, as well as any category field. 
If you break out by a single dimension you get a table where the leftmost column is the dimension and the rightmost column is the value of the metric for that point.
Two dimension breakouts are equivalent to a pivot table in excel and are one of the workhorses of the business intelligence world.
If you break out by additional dimensions, you will add columns to the left of the dimension.

--Exmaple of a 2 and 3 d breakout--

### Filtering your data

You can filter by any fields in the table you're working with or any connected tables through foreign keys in that table. 
Different fields can have different filters based on them.
All fields can be filtered by:

* is a value, eg. "Status is 'closed'"
* is not a value eg. "Status is not 'closed'"
* is null, i.e. it isn't set in the record
* is not null

Some fields will have a limited number of possible values. Metabase will pick up on this and limit the choices in the filter selection to only valid values.
Some field (eg. price) will have too many.

Fields that are comparable, like numbers or dates, can also be filtered using the following operators:

* Less than a value you enter
* Greater than a value you enter
* Between two values you enter

If filtering by dates, a datepicker should appear to allow you to input them easily.	


## Digging into individual records
* you can click on ids to see more info about a given person, venue, etc
* you can see all the fields that are hidden for readability
* you can see all connected tables


## Asking more advanced questions in SQL

* If you ever need to ask questions that can't be expressed  using our interactive GUI query builder, you can use SQL.
* SQL is short for Structured Query Language and is a widely used standard for getting data from databases. To learn more about it read: [SQL Tutorial](http://www.w3schools.com/sql/default.asp)
* Even if you don't understand SQL or how to use it, it's worthwhile understanding how to use SQL inside Metabase as sometimes other people will share SQL based questions that are useful to you.
* You can switch a card from GUI mode to SQL mode by clicking on the cursor icon in the upper right
* Once there you can write SQL directly.
* To see how it work try running `select count(*), date from purchases group by date`. Don't worry if you don't understand this just yet. Click 'run query' and note the table that comes back is the same as if you had graphed "count" broken out by "date"
* Note also that you can treate the result the same way you would treat a result of the GUI, and yu can save it, download the results, or add it to a dashboard.


## Visualizing results
While tables are useful to lookup information and to pull out hard numbers, it is usually easier to see trends and make sense of data using graphs.
Metabase offers a number of charting options.
### line graphs
### Area graphs
### Bar + Pie graphs

## Maps
### US State maps
* default GeoJSON
* requires a column that is a state in the result
* expect states as abbreviations or full names
### Country maps
* default GeoJSON
* requires a column that is a country in the result
* expect countrys as full names or abbreviations
### Pin maps
* requires your admin to set up a google maps api key
* requires both a latitude and a longitude marked column in the result
* heat maps vs pin maps


## Saving questions + dashboards
### what are dashboards?

* a collection of saved questions that are meant to be referred back to regularly 
* meant to be consumed together
* public dashboards contain canonical KPIs, etc
* personal dashboards can be used for projects and deleted or for long standing areas of interest
### arranging dashboards
to make any changes to a dashboard, click on the edit button 
this will allow you to resize, reorder or remove cards

* resizing cards
clicking on the borders or the handle on the lower right corner will allow you to drag the cursor to resize the card
* reordering cards
to reorder cards, click+drag the card to its new place. Note that other cards will rearrange as you do this. 
* removing cards vs deleting cards
when you click on the "x" icon t

### deleting dashboards
when you delete a dashboard, you aren't deleting the cards
be careful deleting public dashboards

### tips on creating dashboards

* figure out which cards you need
* once you have all the cards, try to find a structure that will allow a user to consume related information together
* if you have more than 10 cards, strongly consider 

## Getting help on your data model
* You can get to the data model reference at any time by clicking on the book icon
* You will see a list of databases available to you and the tables in them
	* pick the table that is relevant to you
		* description
		* see the list of fields
			* description
			* each field has some information about the field as well as easy ways to run queries based on it
			* distinct values
			* bar chart of count grouped by this field
			* line chart of count grouped by this field
		* See all the connections


