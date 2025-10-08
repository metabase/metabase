---
title: Python transforms
summary: Use Python to wrangle your data in Metabase and write the results back to your database.
---

# Python transforms

> Python transforms are only available on Metabase Cloud [Pro and Enterprise plans](https://www.metabase.com/pricing) with the **Python execution add-on**.

You can write a Python script to transform the data from your database, and write the result back into the database as another table.

For general information about Metabase transforms, see [Transforms](transforms.md).

## Create a Python transform

To write Python transforms, you'll need to have the Python execution add-on. Once you've enabled the add-on:

1. Go to **Admin settings > Transforms** and click **Create a transform > Python script**.

2. Select a database that has the data you want to transform. See [Databases that support transforms](transforms.md#databases-that-support-transforms).

3. Select one or more tables with the data that you'd like to transform. Optionally, assign aliases to the tables.

   The tables you select will be available as DataFrames in your Python code with your chosen aliases, and will be passed to the `transform()` function as parameters.

4. Create a function `transform()` that does the data wrangling and returns a [pandas DataFrame](https://pandas.pydata.org/docs/reference/api/pandas.DataFrame.html). The DataFrame returned by the function will be written back to your database when the transform is run.
5. Click **Save** in the top right corner.
6. Select a target schema for your transform and enter a name for the target table. Metabase will write the results of the transform into this table.

   You can only write back to the same database as you chose for the transform source.

7. Optionally, assign tags to your transforms. Tags are used by [jobs](transforms.md#jobs-and-tags) to run transforms on schedule.

## Tips for Python transforms

- A Python transform must have a function `transform()` that returns a single `pandas` DataFrame.
- You can use aliases to include tables from your database as DataFrames inside the `transform()` function. The tables will _only_ be available in the transform function. Other functions won't have access to the tables.
- Only `pandas` will be imported by default, but you can import [certain other packages](#available-python-packages). You can also use functions from the [common library](#common-python-library).
- You'll see the output of `print()` statements in the transform's logs.
- Metabase won't write DataFrame indexes to the database, including indexes created by `groupby()`. If you're using a custom index that you'd like to include in the target table, you'll need to [reset index](https://pandas.pydata.org/docs/reference/api/pandas.DataFrame.reset_index.html) on your DataFrame inside the `transform()` function.

## Run a Python transform

See [Run a transform](transforms.md#run-a-transform). You'll see logs for a transform run (including the output of any `print()` statements you included in the `transform()` code) on the transform's page.

## Available Python packages

You can import any of the following Python packages in Python transforms:

- [`pandas`](https://pandas.pydata.org/);
- Any dependencies of `pandas`, e.g. [`numpy`](https://numpy.org/);
- Any packages from the [Python standard library](https://docs.python.org/3/library/index.html), e.g. `json` or `datetime`.

Due to security considerations for the Python execution environment, you won't be able to install or import any other packages.

You can also write your own functions and add them to the [common library](#common-python-library) in Metabase, which will be available across all your Python transforms.

## Common Python library

If you have functions or classes you'd like to reuse across multiple transforms, you can add them to the common library that will be available across all Python transforms.

To add things to the common Python library:

1. Go to **Admin > Transforms > Python library**.

2. Add a Python function or class.

   Functions in this library can't access any data in your database.

To use functions or classes from your Python library:

1. When editing your Python transform script, check **Import common library** in the top right.

   This will add an aptly named import `import common` to the transform's code.

2. Reference functions or classes from the common library in your code like `common.manifest_kittens()`.

## Current limitations of Python transforms

- Currently, Python transforms are only available on Metabase Cloud.
- The transform function must return a single `pandas` DataFrame. Other data manipulation and DataFrame libraries like `polars` or `pyspark` are not supported.
- DataFrame indexes, including indexes created by `groupby()`, are ignored from writing back to the database. If you're using a custom index that you'd like to include in the target table, you'll need to [reset index](https://pandas.pydata.org/docs/reference/api/pandas.DataFrame.reset_index.html) on your DataFrame inside the `transform()` function to make the index into a real column.
- You can't preview the results of a Python transform.
- Only a [limited set of packages](#available-python-packages) are available for import. You can't install additional packages.
- Because Python transforms use `pandas`, all data manipulation is done in memory. The available memory is determined by the Python execution add-on. For large datasets, consider using [query-based transforms](transforms.md#query-based-transforms) that run in your database.
