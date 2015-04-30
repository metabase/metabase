# Overview

Metabase allows you to optionally annotation the data in your database or datawarehouse. These annotations provide metabase with an understanding of what the data actually means and allows it to more intelligently process and display it for you. We currently allow you to annotate tables and columns. 

All of these settings are editable via the metadata editing page.

# Types of Metadata

## Tables

### Table type

A table can be marked as one of the below types. 

* Business Entity Table
* Rollup or Metrics Table
* System Table - this is something that is only used 
* Intermediate Table

Typically, only Business Entities and Metrics tables are displayed in list, and they will be colored differently to allow you to quickly find the table of interest.

## Fields

A field is a representation of either a Column (when using a SQL based database, like PostgreSQL) or a field in a document (when using a document or json based database like MongoDB). 

### Name

Clicking on the name of the field allows you to change how the field name is displayed. For example, if your ORM produces table names like “auth.user", you can replace this with “User” to make it more readable.

### Description

This is a human readable description of what the field is and how it is meant to be used. Any caveats about interpretation can go here as well.

Fields 

### Visibility

Fields are always displayed in “long form” spots like the detail pages for a specific row. By default, any column with an average length of longer than 50 characters is clipped. If you wish to toggle this, click on the checkbox next to a field name.

### Position

A field has a default position, which is used whenever a row is displayed. Some views allow you to rearrange the order of column. Cases where you might want to use this are if you have a clear primary identifier for a table that for whatever reason is not the first column, or to move variable length columns to the end to make it easier to scan a table. 

### Database Representation

This refers to how the basic representation of the field in the database. It is not editable as it represents how things are stored. It is useful to see if say “1” refers to a number or a string in the underlying database.

### Basic Types

* Metric - A metric is a number that you expect to plot, sum, take averages of, etc. Basically anything that would end up being plotted on the Y-Axis of a graph.
* Dimension - This is any field that you expect to use as an X-Axis of a graph or as part of a pivot table. 
* Information - This is any other information that is not expected to be used in any kind of aggregate metrics but contains other information. Examples include descriptions, names, emails

### Semantic Types

A field’s semantic type is used to determine how to display it as well as providing information to users of the data about the underlying meaning. For example, by marking a fields in a table as Latitude and Longitude, you allow the table to be used to power pin and heat maps. Similarly, marking a field as a URL allows users to click on it and go to that url.

Semantic types include
* Avatar Image URL
* Category
* City
* Country
* Description
* Foreign Key
* Entity Key
* Image URL
* Field containing JSON
* Latitude
* Longitude
* Entity Name
* Number
* State
* URL
* Zip Code