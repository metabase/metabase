---
title: "Models"
redirect_from:
  - /docs/latest/users-guide/models
---

# Models

Models are a fundamental building block in Metabase. Models curate data from another table or tables from the same database to anticipate the kinds of questions people will ask of the data. You can think of them as derived tables, or a special kind of saved question meant to be used as the starting point for new questions. You can base a model on a SQL or query builder question, which means you can include custom, calculated columns in your model.

Models:

- Let you update column descriptions and customize metadata to create great starting points for exploration.
- Show up higher in search results and get highlighted when other users start new questions to promote reuse.
- Live in collections to keep them separate from messy database schemas.
- Can [surface individual records in search results](#surface-individual-records-in-search-by-matching-against-this-column).
- Can be [persisted for faster loading](./model-persistence.md).

For a deep dive on why and how to use models, check out our [Learn article on models][learn-models].

## How to use models

You can use models to:

- Create, uh, models, with model here meaning an intuitive description of some concept in your business that you codify as a set of columns. An example model could be a "customer", which is a table that pulls together customer information from multiple tables and adds computed columns, like adding a lifetime value (LTV) column. This model represents the [measures and dimensions][measures-dimensions] that you think are relevant to your understanding of your customers.
- Let people explore the results of SQL queries with the drill-through menu and query builder (provided you [set the column types](#column-type)).
- Create summary tables that pull in or aggregate data from multiple tables.
- Clean up tables with unnecessary columns and rows filtered out.

The idea with models is to give other people a good "starting point table" that makes it easier to answer any questions they have about the subject being modeled.

## Create a model

First, search for models that already exist. If you can't find one that meets your needs, you can create a model:

- [from scratch](#create-a-model-from-scratch), or
- [from a saved question](#create-a-model-from-a-saved-question).

Models you create are automatically [pinned to the current collection](../exploration-and-organization/collections.md#pinned-items).

### Create a model from scratch

1. In the upper right, click **New +** > **Model**.
2. Choose either the query builder or a native query (if you want to use SQL). The advantage of using the query builder is that Metabase will be able to fill out some of the metadata for you; if you use SQL, you'll have to fill out that metadata manually.
3. Select your data.
4. Create and save your query.

### Create a model from a saved question

1. [Ask a question][question] using either the query builder or the SQL editor, or select an existing saved question that you want to convert to a model.
2. Save the question.
3. Click on the **...** > **Turn this into a model**.

![Turn a saved question into a model](./images/turn-into-a-model.png)

## Model detail page

To view a model's detail page:

- From a collection: click on the **book** icon next to a model.
- From a model: click on the **info** button in the upper right, then click **Model details**.

![Model detail page](./images/model-detail.png)

Here you'll see several tabs:

- **Used by**: lists the items based on the model.
- **Schema**: lists the fields in the model.
- **Actions**: lists the actions in the model, and allows you to create new [actions](../actions/start.md).

The model detail page also shows some basic info about the model:

- Description
- Contact (who wrote the model)
- Backing table(s)

To start a new question based on the model, click **Explore**.

To edit the model's underlying query, click **Edit definition**.

You can also edit the model's metadata.

## Add metadata to columns in a model

Metadata is the secret sauce of models. When you write a SQL query, Metabase can display the results, but it can't "know" what kind of data it's returning (like it can with questions built using the query builder). What this means in practice is that people won't be able to drill-through the results, or explore the results with the query builder, because Metabase doesn't understand what the results are. With models, however, you can tell Metabase what kind of data is in each returned column so that Metabase can still do its drill-through magic. Metadata will also make filtering nicer by showing the correct filter widget, and it will help Metabase to pick the right visualization for the results.

If you only set one kind of metadata, set the **Column type** to let Metabase know what kind of data it's working with.

### Display name

What people will see as the column's name.

### Description

A place to write helpful context for the column.

### Database column this maps to

For models based on SQL queries, you can tell Metabase if the column has the same type as an existing database column.

### Column type

You can set the [column type][column-type]. The default is "No special type".

If your model is based on a SQL query and you want people to be able to explore the results with the query builder and drill-through menu, you'll need to set the [column type](./field-types.md) for each column in your model.

### This column should appear in...

You can specify whether a column should appear in the table view, or just in a detail view (when you click on the entity/primary key for the row).

- Table and detail views
- Detail views only

### Display as

- Text
- Link (it's a URL people should be able to click on)

### Surface individual records in search by matching against this column

For string fields in records with integer entity keys, Metabase will give you the option make the values in that field show up when people search your Metabase. Essentially, Metabase will index these values and make them available to Metabase's search engine. This option is handy when people often want to jump straight to an individual record in your model.

For example, if you have a model with accounts, you could turn on this option for a column listing the account's name or email so that people can quickly search for specific accounts in the model from anywhere in your Metabase. When people click on a record in the search results, Metabase will jump straight to the model and the object detail for that record.

There are some limitations to this indexing:

- The indexed field must be a text/string type.
- The record containing the field must have an integer entity key.
- To keep your search speedy, Metabase will only index 5000 unique values from that field, so this option isn't the best choice to turn on for tables with a ton of records.

## Edit a model's query

You can edit a model's query by clicking on the down arrow next to the model's name and clicking on **Edit query definition**. When you're doing editing, be sure to save your changes. Unlike questions, which prompt you to save as a new question, any changes here will overwrite the existing model. If you want to create a new model from an existing model, select **Duplicate this model** from the model sidebar (the icon of two overlapping squares).

## Start a question from a model

See [asking questions][question].

## [Refer to a model in the SQL query editor](../questions/native-editor/referencing-saved-questions-in-queries.md)

You can refer to a model in a SQL query just like you can refer to a saved question:

```
{% raw %}
SELECT * FROM {{#1-customer-model}}
{% endraw %}
```

Or as a [common table expression (CTE)][cte]:

```
{% raw %}
WITH model AS {{#3807-invoice-model}}
SELECT *
FROM model;
{% endraw %}
```

Simply typing `{% raw %}{{#}} {% endraw %}` will allow you to search for models (for example, you could type in `{% raw %}{{#customer}}{% endraw %}` to search models, questions, and tables with the word "customer" in the title.

You can also use the data reference sidebar to browse the models available. To open the data reference sidebar, click on the **book** icon.

## Model version history

For [questions](../questions/start.md), [dashboards](../dashboards/start.md), and models, Metabase keeps a version history for the previous fifteen versions of that item. You can view changes, revert to previous versions, and archive outdated items.

See [History](../exploration-and-organization/history.md).

## Verifying a model

{% include plans-blockquote.html feature="Model verification" %}

Just like with a question, admins can verify models. Verifying a model will give it a check mark to let others know an admin vetted the model. If anyone makes any changes to the model, the check mark will disappear. An admin will have to verify the question again to restore the check mark.

## Model persistence

See [Model persistence](./model-persistence.md)

## Further reading

- [Models in Metabase][learn-models]
- [Troubleshooting models][troubleshooting-models].

[column-type]: ./field-types.md
[cte]: https://www.metabase.com/learn/sql-questions/sql-cte
[measures-dimensions]: https://www.metabase.com/learn/databases/dimensions-and-measures
[question]: ../questions/start.md
[learn-models]: https://www.metabase.com/learn/getting-started/models
[troubleshooting-models]: ../troubleshooting-guide/models.md
