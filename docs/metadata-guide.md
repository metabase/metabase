## Metadata Guide
### This guide will teach you:
* What kinds of metadata Metabase stores and uses
* How Metabase analyzes your database
* How to improve the data model by adding your own knowledge to the auto-generated model

### Overview

Metabase allows you to optionally annotate the data in your database or data warehouse. These annotations provide Metabase with an understanding of what the data actually means, and allows it to more intelligently process and display it for you. We currently allow you to annotate tables and columns. 

All of these settings are editable via the **Metadata** page within the **Admin Panel**.

### Tables

Tables can either be set to **Queryable** or **Hidden**. Queryable tables can be selected from the question builder, and all of the data in the table can be displayed (unless certain fields are excluded — more on that below).

Hidden tables can’t be selected from the query builder, and their data can’t be accessed. 

You can also change the name and description of your tables here. Note that the underlying database won’t be affected — this will only change the name of the table while you’re viewing it within Metabase. 

If you ever want to see the underlying original schema for a given table, just click the **Show original schema** toggle in the top-right of the screen.

### Fields

A field is a representation of either a column (when using a SQL based database, like PostgreSQL) or a field in a document (when using a document- or JSON-based database like MongoDB). 

There are several pieces of metadata you can edit per field: name, description, visibility, type, and details:

#### Name

Clicking on the name of the field allows you to change how the field name is displayed. For example, if your ORM produces table names like “auth.user", you can replace this with “User” to make it more readable. Again, this only changes how the field is displayed in Metabase.

#### Description

This is a human-readable description of what the field is and how it is meant to be used. Any caveats about interpretation can go here as well.

#### Visibility

If you have really long data in certain fields, like descriptions or biographies, you can set the visibility to display the field **Only in Detail Views** when looking at a single record. By default, any column with an average length of longer than 50 characters is assigned this setting.

Similarly, if you have sensitive or irrelevant fields, you can set them to **Do Not Include**, preventing the field from being accessed by Metabase.

#### Types

A field can get assigned one of four basic types:

* Metric — a metric is a number that you expect to plot, sum, take averages of, etc. You could think of it as anything that would end up being plotted on the y-axis of a graph.
* Dimension — This is any field that you expect to use as an x-axis of a graph or as part of a pivot table. Anything that you could group your results by could be called a dimension, such as dates.
* Information — This is any other information that is not expected to be used in any kind of aggregate metrics but contains other information. Examples include descriptions, names, emails.
* Sensitive Information — Use this setting for fields that you don’t want to show up anywhere in Metabase. This does the same thing as changing the visibility to Do Not Include, and in fact if you set a field’s visibility to Do Not Include, it’ll automatically get assigned the type Sensitive Information.

#### Details

A field’s detailed type is used to determine how to display it as well as providing information to users of the data about the underlying meaning. For example, by marking fields in a table as Latitude and Longitude, you allow the table to be used to create pin and heat maps. Similarly, marking a field as a URL allows users to click on it and go to that URL.

Common detailed types include:

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

This is also where you set mark special fields in a table:
* Entity Key — the field in this table that uniquely identifies each row. Could be a product ID, serial number, etc.
* Entity Name — different from the entity key, this is the field whose heading represents what each row in the table *is*. For example, in a Users table, the User column might be the entity name.
* Foreign Key — this is a field in this table that uniquely identifies a *row* in another table. In other words, this is a field that, almost always, points to the primary key of another table. For example, in a Products table, you might have a Customer ID field that points to a Customers table, where Customer ID is the primary key.