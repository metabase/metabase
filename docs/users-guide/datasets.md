# Datasets

Datasets are a fundamental building block in Metabase. Datasets curate data from another table or tables from the same database to anticipate the kinds of questions people will ask of the data. Datasets are meant to be used as the starting point of new questions.

Datasets can:

- Let you update column descriptions and customize metadata to create great starting points for exploration.
- Show up higher in search results and get highlighted when other users start new questions to promote reuse.
- Live in collections to keep them separate from messy database schemas.

## How to use datasets

You can use datasets to:

- Create models, like a "customer" dataset, or 
- Summary tables that aggregate data from multiple tables, or
- Cleaned up tables with unnecessary columns and rows removed, or
- Results of a SQL question plus metadata to describe it's columns.

Or whatever else you want to create. The idea with datasets is to give other people a good "starting point table" that makes it easier to answer any questions they have. In this sense, they're like a special sort of saved question that you can add metadata to.

## Create a dataset

First, look for datasets that already exist. If you can't find one that meets your needs, you can create a dataset like so:

1. [Ask a question][question] using either the query builder or the native SQL editor.
2. Save the question.
3. Click on the down arrow next the questions to open the question details sidebar.
4. Click on the dataset icon to turn the question into a dataset. 


Convert the question to a dataset (from the sidebar). You can add metadata for each column (especially useful for SQL questions), and edit the underlying query if you need to. People will be able to select datasets in the data picker as the starting point for a new question, and you can place datasets in collections for people to discover.

## Add metadata to columns in a dataset

You can optionally add metadata to each of the columns in Metabase, which is especially useful for SQL questions.

TODO

## Start a question from a dataset

See [asking questions][question].

## Refer to a dataset in the native editor

You can refer to datasets in a SQL query like so:

```
{% raw %}
SELECT * FROM {{#1}}
{% endraw %}
```

Or as a [CTE][CTE]:

```
{% raw %}
WITH dataset AS {{#3807}}
SELECT *
FROM dataset;
{% endraw %}
```

[cte]: https://www.metabase.com/learn/sql-questions/sql-cte

[question]: 04-asking-questions.md
