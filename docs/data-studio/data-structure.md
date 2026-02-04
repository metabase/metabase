---
title: Data structure
summary: Visualize how your content connects and what depends on what in Metabase.
---

## Data structure

_Data studio > Data structure_

**Data structure** area of [Data Studio](overview.md) is where you can manage table metadata and configure how the end users of your Metabase interact with the data.

You can do things like:

- Browse all the tables in your Metabase
- Publish tables to the Library
- Sync and scan tables
- Assign owners and other attributes to tables
- Set table and field visibility
- Edit table and column names and types
- Set data formatting settings
- Create metrics and segments

## Permissions for Data Structure

To access the Data Structure area of Data Studio, people will need to be members of the Admin group or Data Analyst group (Data Analyst group is only available on Pro/Enterprise plans).

Note that putting someone into Data Analyst group will give them table metadata and data structure access to _all_ tables in your Metabase, even if they have limited View Data permissions for those tables.

If you only want to give someone access to table metadata for some - but not all - tables, use the table metadata permissions and access the Table Metadata through Admin > Table metadata instead of Data Studio.

## Browse tables

Data Structure gives you an overview of all tables in all databases connected to your instance. You can select a table to edit metadata, publish the tables, or create segments or measures on the table.

You can search for table names, but the search will only match beginnings of word in table names. This means if you search for “base”, it can find names like “Baseball stats”, “All your base are belong to us”, but it will not find tables like “Metabase secrets”.

You can also filter tables by attributes like owners, visibility - for example, if you wanted to find all

You can select tables in bulk to [publish them](section link) or [assign attributes](section link) to them.

estimated rows - PG only?

## Publishing and unpublishing tables

{% include plans-blockquote.html feature="Publishing tables to the Library" %}

Once you select a table in Data Structure, you can publish the table to add it to the Library. The Library is a special collection that helps you create a source of truth for analytics by providing a centrally managed set of curated content.

See [Publishing tables](./library.md#publishing-tables) in the [Library docs](./library.md).

Publishing a table will change permissions for the table: every person in your instance who has View access to the Library will automatically get Create Queries permissions on a published table

## Sync the table

See [sync table](table metadata docs link)

## Table attributes

- Owner - who owns the table. You can type someone’s email and it’ll send them an invite. This is _not_ exposed to users outside data studio
- Visibility type - where is this table visible in normal Metabase UI. TBD how this words
- Entity type - describes the type of entity in the table. TBD what this actually does
- Source - where the data comes from. Tables created by [Metabase transforms](link) get automatic source “Metabase transforms” that can’t be edited. other stuff you can assign manually, and it does’t have any real meaning beyond helping you in Search

## Segments

Segments are saved filters on tables. You can use segments to blah blah. See [Segments](link to old modeling docs) for more info.

You can click on a segment to see its definition, [revision history](link to old docs), and dependencies.

For published tables, you can also manage segments in [the library](Link)

## Measures

Measures are saved aggregations on tables. You can use measures to blah blah.

For published tables, you can also manage segments in [the library](Link)

**See all measures**

1. Select the table in Data Structure
2. Scroll down and switch to Measures

**Create a measure on a table**

1. Select the table in Data Structure
2. Scroll down and switch to Measures
3. Click “new measure”
4. Add a custom aggregation. You will probably be interested in [Custom expressions](LINK)

**Edit a measure**

blah blah

**Remove a measure**

**Use a measure in the query builder**

## Field metadata

Read [these docs](link to old metadata docs)
