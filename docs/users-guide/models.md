# Models

Models are a fundamental building block in Metabase. Models curate data from another table or tables from the same database to anticipate the kinds of questions people will ask of the data. You can think of them as derived tables, and they're meant to be used as the starting point for new questions.

Models can:

- Let you update column descriptions and customize metadata to create great starting points for exploration.
- Show up higher in search results and get highlighted when other users start new questions to promote reuse.
- Live in collections to keep them separate from messy database schemas.

## How to use models

You can use Models to do things ike use complex SQL queries to create models (derived tables) that can be used as starting data in a question just like any other table in your database.

You can use Models to:

- Create models, like a "customer" dataset, or 
- Summary tables that aggregate data from multiple tables, or
- Clean up tables with unnecessary columns and rows removed, or
- Results of a SQL question plus metadata to describe it's columns.

Or whatever else you want to create. The idea with Models is to give other people a good "starting point table" that makes it easier to answer any questions they have. In this sense, they're like a special sort of saved question that you can add metadata to.

## Create a model

First, look for models that already exist. If you can't find one that meets your needs, you can create a dataset like so:

1. [Ask a question][question] using either the query builder or the SQL editor.
2. Save the question.
3. Click on the down arrow next the question title to open the question details sidebar.
4. Click on the model icon to turn the question into a model. 

Convert the question to a dataset (from the sidebar). You can add metadata for each column (especially useful for SQL questions), and edit the underlying query if you need to. People will be able to select models in the data picker as the starting point for a new question, and you can place models in collections for people to discover.

## Add metadata to columns in a model

You can optionally add metadata to each of the columns in Metabase, which is especially useful for SQL questions. When you write a SQL query in Metabase, Metabase can display the results, but it can't "know" what kind of data it's returning. What's not the case with questions built using the query builder; Metabase does some work behind the scenes to keep track of what kind of data it's working with, which is why you can click on the results and drill through the data. Normally, when you create a SQL question, you can't drill through the results, because Metabase can't parse SQL, so it doesn't understand what the results are. With Models, however, you can tell Metabase what kind of data is in each of the resulting columns so that it can still do its drill through magic, 

## Start a question from a model

See [asking questions][question].

## Refer to a model in the SQL query editor

You can refer to model in a SQL query like so:

```
{% raw %}
SELECT * FROM {{#1}}
{% endraw %}
```

Or as a [CTE][CTE]:

```
{% raw %}
WITH model AS {{#3807}}
SELECT *
FROM model;
{% endraw %}
```

[cte]: https://www.metabase.com/learn/sql-questions/sql-cte

[question]: 04-asking-questions.md
