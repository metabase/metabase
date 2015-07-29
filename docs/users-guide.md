# User Manual

## Overview
### What is metabase?
It's an open source business intelligence server

* a way to ask simple questions
* a way to save them for later
* group them into dashboards
* and share questions + dashboards with others

### Questions
The core concept in Metabase are Questions and their corresponding Answers. 
Questions are made up of a number of parts:

* source data - database + table
* optional filter
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

### A Short Overview of Databases
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

### Dashboards
* made up of multiple cards in a given position
* used to share groups of questions that should be 


## Asking questions

### Raw Data: 
Just a table with the rows in the answer.
Useful to see the data you're working with, or for exploring small tables.
Useful when combined with Filtering to see segments of interesting Users, venues, etc. These segments can be saved and passed around.

### Different kinds of metrics
What is a metric? It's a number that is derived from your data. 

#### Basic Metrics
* Count: Total of number of rows in the answer
* Sum: Sum of all values in a column
* Average: Average of all values in a column
* Advanced Metrics
* Number of Distinct Values: Number of unique values of a column among all the rows in the answer
* Cummulative Sum: Additive sum of all the columns, eg. total revenue over time
* Standard Deviation: Number which expresses how much the values of a column vary among all rows in the answer
### Filtering your data
### Breaking out metrics


## Digging into individual records
* you can click on ids to see more info about a given person, venue, etc
* you can see all the fields that are hidden for readability
* you can see all connected tables

## Saving questions + dashboards
### what are dashboards?
* public dashboards contain canonical KPIs, etc
* personal dashboards can be used for projects and deleted or for long standing areas of interest
### arranging dashboards
* resizing cards
* reordering cards
### tips on creating dashboards

## Graphing things
### line graphs
### Area graphs
### Bar + Pie graphs

## Mapping things
### US State maps
* default GeoJSON
* expect states as abbreviations or full names
### Country maps
* default GeoJSON
* expect countrys as full names or abbreviations
### Pin maps
* requires your admin to set up a google maps api key
* heat maps vs pin maps

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
