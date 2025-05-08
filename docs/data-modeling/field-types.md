---
title: "Data and field types"
redirect_from:
  - /docs/latest/users-guide/field-types
summary: "Metabase uses both data and semantic types to understand how to format and visualize your data."
---

# Data and field types

Metabase distinguishes between two types of column metadata: data types and field types.

- [**Data types**](#data-types) are the underlying column type as defined in your database, like `Date` or `Text`. Metabase reads the data types during the [database sync process](../databases/sync-scan.md).
- [**Semantic types**](#semantic-types), also called **field types**, are labels that describe how the data should be interpreted. For example, if you have a column with a data type of `Text` that you use to store emails, you can add a semantic type of `Email` to let people (and Metabase) know what kind of text the column stores.

Data and semantic types determine how Metabase formats the data, which charts are available, how the filters work, and other functionality.

## Data types

Data types are the underlying column types as defined in your database. Metabase reads the data types during the [database sync process](../databases/sync-scan.md). Because Metabase connects to many different databases, it uses its own type hierarchy under the hood, so that it can, for example, handle date fields in databases as different as PostgreSQL and MongoDB.

The main data types in Metabase:

| Data Type  | Example database types                      |
| ---------- | ------------------------------------------- |
| Numeric    | `INTEGER`, `FLOAT`                          |
| Temporal   | `DATE`, `TIMESTAMP`                         |
| Text       | `VARCHAR`, `TEXT`                           |
| Text-like  | MongoDB `BSONID`, Postgres `Enum`           |
| Boolean    | Boolean                                     |
| Collection | `JSON`, BigQuery `RECORD`, MongoDB `Object` |

Metabase currently doesn't support array types. On columns containing arrays, you'll only be able to filter by **Is empty** or **Is not empty**.

For some fields, you can tell Metabase to [cast the field to a different data type](#editing-data-and-semantic-types) (for example, changing a text type to a date type).

## Semantic types

You can think of semantic types as adding extra flavor to a field to communicate meaning and enable [additional functionality](#what-data-and-semantic-types-enable). Available semantic types depend on the underlying data types.

### Semantic types for any field

- **Entity key.** Used to indicate that the field uniquely identifies each row. Could be a Product ID, serial number, etc.

- **Foreign key.** Used to refer to an Entity key of another table in order to connect data from different tables that are related. For example, in a Products table, you might have a Customer ID field that points to a Customers table, where Customer ID is the Entity key. If you want to use [linked filters on dashboards](../dashboards/linked-filters.md), you must set up foreign key relationships.

### Semantic types for numeric fields

- Quantity
- Score
- Percentage
- Financial
  - Currency
  - Discount
  - Income
- Location
  - Latitude
  - Longitude
- Category

### Semantic types for temporal fields

- Creation date
- Creation time
- Creation timestamp
- Joined date
- Joined time
- Joined timestamp
- Birthday

### Semantic types for text fields

- Entity name
- Email
  - URL
  - Image URL
  - Avatar URL
- Category
- Name
- Title
- Product
- Source
- Location
  - City
  - State
  - Country
  - ZipCode

### Semantic types for collection fields

- Field containing JSON.

  See [Working with JSON](./json-unfolding.md).

## Editing data and semantic types

Admins, and people with [permission to manage table metadata](../permissions/data.md#manage-table-metadata-permissions), can cast data types and edit semantic types in the Admin setting's Table Metadata tab.

### Cast data types

Data types can't be edited in Metabase directly, but you can cast certain [data types to different types](./metadata-editing.md#casting-to-a-specific-data-type) so that, for example, Metabase will interpret a text data type as a date type.

Changes made in Table Metadata apply across your entire Metabase. Metabase currently only supports casting to a datetime type in Metadata settings. However, if you you build a query in the query builder, in you can use type casting custom expressions like [`date()`](../questions/query-builder/expressions-list.md#date) or [`integer()`](../questions/query-builder/expressions-list.md#integer) to cast a string to a different type in your query.

### Semantic types don't change the data types

You can pick a semantic type compatible with the underlying data type in [table metadata settings](./metadata-editing.md#field-type)

Semantic types only add meaning; they should NOT be used for type casting. For example, if you set a text field's semantic type to "Quantity", Metabase will still treat the field as a text field. Instead, apply semantic types to tell Metabase how to format or visualize the field (like telling Metabase that a numeric values represents a percentage).

## What data and semantic types enable

### Display format

Some semantic types change the way the data in the field is displayed.

Formatting setting from Table Metadata settings will be applied across your Metabase, but people can change them for individual charts.

| Semantic type          | Format                                                                                                                                                                                                                                                                   |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Percentage             | Displayed as percentage, for example 0.75 will be displayed as 75\%                                                                                                                                                                                                      |
| Currency               | On charts and in detail view, the values are prepended by the currency symbol, e.g., `$134.65`. By default in the table view, the currency symbol is only displayed in the header, but you can change the metadata formatting settings to show the symbol for every row. |
| Latitude/Longitude     | Displayed as coordinates, e.g., `0.00000000° N`                                                                                                                                                                                                                          |
| Email                  | Display as a `mailto` link                                                                                                                                                                                                                                               |
| URL                    | Can format as a clickable link                                                                                                                                                                                                                                           |
| Image URL              | Can display as an image. See [table format settings](../questions/visualizations/table.md#display-as)                                                                                                                                                                    |
| Avatar URL             | Can display as avatar circle image. See [table format settings](../questions/visualizations/table.md#display-as)                                                                                                                                                         |
| Field containing JSON  | In detail view, display as prettified JSON                                                                                                                                                                                                                               |
| Entity and Foreign key | Highlighted in table view                                                                                                                                                                                                                                                |

### Visualizations

When you create a question in the query builder, Metabase will automatically choose the most suitable chart for you based on the data types and the semantic types of the field in the "Group by" step (you can change the chart type later).

| Group by data type   | Automatic chart |
| -------------------- | --------------- |
| Text/Category        | Bar chart       |
| Temporal             | Line chart      |
| Numeric - binned     | Bar chart       |
| Numeric - not binned | Table           |
| Boolean              | Bar chart       |
| No aggregation       | Table           |

Additionally, if you use location semantic types:

| Group by semantic type          | Functionality            |
| ------------------------------- | ------------------------ |
| Latitude/Longitude - binned     | Grid map                 |
| Latitude/longitude - not binned | Pin map                  |
| Country                         | World region map         |
| State                           | United States region map |

### Extract values from columns

For some fields, you can quickly extract values from columns using [shortcuts in table view](../questions/visualizations/table.md#extract-domain-subdomain-host-or-path) or in the [custom expression editor](../questions/query-builder/expressions.md) in the query builder:

| Group by data type  | Extract                                 |
| ------------------- | --------------------------------------- |
| URL semantic types  | Extract host, domain, subdomain, path   |
| Email semantic type | Extract host, domain                    |
| Temporal data types | Extract date parts like month, day, etc |

### X-rays

When you [X-ray](../exploration-and-organization/x-rays.md) a table, model, or entity, Metabase considers both the data type and the field type to display different charts that summarize that data.

### Field Filters

Knowing what field types are and how they work is helpful when using [field filters](https://www.metabase.com/learn/metabase-basics/querying-and-dashboards/sql-in-metabase/field-filters), as you can only create field filters for [certain field types](../questions/native-editor/sql-parameters.md#field-filter-compatible-types).

### JSON unfolding

See [Working with JSON](./json-unfolding.md).

## Set semantic types in models to enable people to explore results with the query builder

You can set field types for [models](./models.md), which helps Metabase understand how to work with data in models built using SQL. If you set each column type in a SQL model, people will be able to explore that model using the query builder and drill-through menus.

With records that include integer entity keys, you can also configure text fields in models to [surface individual records in search](./models.md#surface-individual-records-in-search-by-matching-against-this-column).

## Further Reading

- [Exploring data with Metabase's data browser](https://www.metabase.com/learn/metabase-basics/querying-and-dashboards/data-browser).
- [The Table Metadata page: editing metadata](./metadata-editing.md).
- [Field Filters: create smart filter widgets for SQL questions](https://www.metabase.com/learn/metabase-basics/querying-and-dashboards/sql-in-metabase/field-filters).
