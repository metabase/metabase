---
title: Python transforms
summary: Use Python to wrangle your data in Metabase and write the results back to your database.
---

# Python transforms

> Python transforms require the **Transforms add-on**

Use Python to write [transforms](transforms-overview.md).

## How Python transforms work

Python-based transforms require a dedicated [Python execution environment](#set-up-a-python-runner).

- In your Metabase, you write a Python script that returns a `pandas` DataFrame and uses one or more tables from your database.
- When Metabase runs the transform, a new Python execution environment is spun up. Metabase then run your transform in a new Python execution environment (not on your Metabase instance).
- Metabase securely copies your source data to your Python environment and makes it available as pandas DataFrames.
- The Python environment executes your Python script _in memory_ and saves the resulting DataFrame as a file.
- Your Metabase reads the DataFrame file, writes the results to a new table in your database, and syncs the table to your Metabase.
- On subsequent transform runs, your database will overwrite that table with the updated results unless you mark the transform as [incremental](#incremental-python-transforms).

## Set up a Python runner

To execute Python transforms, you'll need a _Python runner_ - a dedicated environment for running Python code.

If you're on Metabase Cloud, get the **Transforms add-on**, and you're good to go.

If you're self-hosting Metabase, you'll need to set up a self-hosted Python runner, see [Python runner](python-runner.md).

## Create a Python transform

Once you've [set up the Python runner](#set-up-a-python-runner):

1. Go to **Data studio > Transforms**.
2. Click on **+ New** and select **Python script**.

3. Select a database that has the data you want to transform. See [Databases that support transforms](transforms-overview.md#databases-that-support-transforms).

4. Select one or more tables with the data that you'd like to transform. Optionally, assign aliases to the tables.

   The tables you select will be available as DataFrames in your Python code with your chosen aliases, and will be passed to the `transform()` function as parameters. For now, all the tables you pick must be in the same database.

5. Create a function `transform()` that does the data wrangling and returns a [pandas DataFrame](https://pandas.pydata.org/docs/reference/api/pandas.DataFrame.html).

   See [Tips for writing Python transforms](#tips-for-writing-python-transforms). The DataFrame returned by the function will be written back to your database when the transform is run.

6. To test your transform, press the **Run Python script** button at the bottom right of the editor.

   Metabase will pull 100 rows from each input table and run your transform on those rows. You'll be able to see the result in the **Results preview** tab below the editor. You can see any other output (e.g. outputs of any print statements in your code) in the **Output** tab.

   The transform preview will **only use first 100 rows from each input table**. This means that if you might not see the real results of your transforms in preview: for example, if your transform renames the values of `Doohickey` to `Widget`, and the first 100 records of the input table happen to not contain any doohickeys, you won't be able to preview the result.

7. Once you're done with your code, click **Save** in the top right corner.

8. Select a target schema for your transform and enter a name for the target table. Metabase will write the results of the transform into this table.

   You can only write back to the same database as you chose for the transform source.

9. Optionally, make your transform incremental. See [Incremental Python transforms](#incremental-python-transforms)
10. Optionally, assign tags to your transforms. Tags are used by [jobs](jobs-and-runs.md) to run transforms on schedule.

## Tips for writing Python transforms

- Metabase will automatically add `import common` to the code of your Python transform. This imports the [Python library](#common-python-library). You can use Python library for reusable functions and classes.
- A Python transform must have a function `transform()` that returns a single `pandas` DataFrame.
- You can use aliases to include tables from your database as DataFrames inside the `transform()` function. The tables will _only_ be available in the transform function. Other functions won't have access to the tables.
- Only `pandas` will be imported by default, but you can import [certain other packages](#available-python-packages). You can also use functions from the [common library](#common-python-library).
- Metabase won't write DataFrame indexes to the database, including indexes created by `groupby()`. If you're using a custom index that you'd like to include in the target table, you'll need to [reset index](https://pandas.pydata.org/docs/reference/api/pandas.DataFrame.reset_index.html) on your DataFrame inside the `transform()` function.

## Run a Python transform

See [Run a transform](transforms.md#run-a-transform). You'll see logs for a transform run (including the output of any `print()` statements you included in the `transform()` code) on the transform's page.

## Available Python packages

You can import any of the following Python packages in Python transforms:

- [`pandas`](https://pandas.pydata.org/);
- Any dependencies of `pandas`, e.g. [`numpy`](https://numpy.org/);
- Any packages from the [Python standard library](https://docs.python.org/3/library/index.html), e.g. `json` or `datetime`.

Due to security considerations for the Python execution environment, you won't be able to install or import any other packages.

You can also write your own functions and add them to the [common Python library](#common-python-library) in Metabase, which will be available across all your Python transforms.

## Common Python library

If you have functions or classes you'd like to reuse across multiple transforms, you can add them to the common library that will be available across all Python transforms.

To add things to the common Python library:

1. Go to **Data studio > Transforms**.
2. Scroll to the very bottom of the transforms list and click on **Python library**.

3. Add a Python function or class.

   Functions in this library can't access any data in your database.

To use functions or classes from your Python library:

1. Metabase will automatically add `import common` to your transform's code. The `common` here refers to the Python library. You can click on `common` in the editor to navigate to the library.

2. You can reference functions or classes from the common library in your code like `common.manifest_kittens()`.

## Incremental Python transforms

By default, Metabase will process all the data in all input tables, drop the existing target table (if one exists), and create a new table with the processed data. You can tell Metabase to only write **new** data to your target table by marking you transform as incremental.

### Prerequisites for incremental transforms

To update a table incrementally, your data has to have a certain structure. See [Prerequisites for incremental transforms](./transforms-overview.md#prerequisites-for-incremental-transforms).

### Make a Python transform incremental

To make a Python transforms incremental:

1. Go to the transform's page in **Data studio > Transforms**.
2. Switch to **Settings** tab.
3. In **Column to check for new values**, select the column that Metabase should check to determine which values are new. See [Prerequisites for incremental transforms](./transforms-overview.md#prerequisites-for-incremental-transforms) for more information on the requirements for that column

   Unlike [Query transforms](./query-transforms.md), where you select an _output_ column as the column to check for new values, with Python transforms, you have to select a column from the _input_ tables as the column to check for new values.

## Current limitations of Python transforms

- The transform function must return a single `pandas` DataFrame. Other data manipulation and DataFrame libraries like `polars` or `pyspark` are not supported.
- Transform preview only uses 100 input rows from each input table.
  Unlike [Query transforms](./query-transforms.md), where you select an _output_ column as the column to check for new values, with Python transforms, you have to select a column from the _input_ tables as the column to check for new values.
- Only a [limited set of packages](#available-python-packages) are available for import. You can't install additional packages.
- Because Python transforms use `pandas`, all data manipulation is done in memory. The available memory is determined by the Python execution add-on. For large datasets, consider using [query-based transforms](./query-transforms.md) that run in your database.
- Only one Python transform can be run at any given time.
