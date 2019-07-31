## Creating custom questions in the notebook editor

---

If you have a question that's a bit more involved than a [simple question](04-asking-questions.md), you can create a custom question using the notebook editor. You can get there by clicking the Ask a Question button in the top nav bar and selecting Custom Question. If you're on a question detail page, you can also open up the editor by clicking the icon in the top right of the screen.

### The parts of the notebook

The notebook is made up of a sequence of individual steps. Under each step you'll see buttons to add more steps after the current one. To the right of each step is a preview button that allows you to see the first 10 rows of the results of your question up to that step.

#### The data step

This first step is required, and is where you pick the data that you want to base your question on. In most cases you'll pick one of the tables in your database, but you can also choose a previously saved question's result as the starting point for your new question. What this means in practice is that you can do things like use complex SQL queries to create new tables that can be used as starting data in a question just like any other table in your database.

You can use most saved questions as source data, provided you have [permission](../administration-guide/05-setting-permissions.html) to view that question. You can even use questions that were saved as a chart rather than a table.

There are some kinds of saved questions that can't be used as source data:

- Druid questions
- Google Analytics questions
- Mongo questions
- questions that use `Cumulative Sum` or `Cumulative Count` aggregations
- questions that have columns that are named the same or similar thing, like `Count` and `Count 2`

#### Filter steps

When you add a filter step, you can select one or more columns to filter on. Depending on the type of column you pick, you'll get different options, like a calendar for date columns. [Learn more about filtering](04-asking-questions.md).

You can add subsequent filter steps after every Summarize step. This lets you do things like summarize by the count of rows per month, and then add a filter on the `count` column to only include rows where the count is greater than 100. (This is basically like a SQL `HAVING` clause.)

#### Summarize steps

Adding a summarize step lets you choose how to aggregate the data from the previous step. You can pick one or more metrics, and optionally group those metrics by one or more columns. When picking your metrics you can choose from basic functions like sum, average, and count; or you can pick a common metric that an admin has defined; or you can create a custom expression by writing a formula.

**Custom expressions**

Custom expressions allow you to do simple arithmetic within or between aggregation functions. For example, you could do `Average(FieldX) + Sum(FieldY)` or `Max(FieldX - FieldY)`, where `FieldX` and `FieldY` are fields in the currently selected table. You can either use your cursor to select suggested functions and fields, or simply start typing and use the autocomplete. If you are a Metabase administrator, you can now also use custom aggregation expressions when creating defined common metrics in the Admin Panel.

Currently, you can use any of the basic aggregation functions listed in #2 above in your custom expression, and these basic mathematical operators: `+`, `-`, `*` (multiply), `/` (divide). You can also use parentheses to clarify the order of operations.

#### Join steps

#### Sorting steps

#### Row limit steps

- steps
- actions
  - Pick data
  - Joins
    - Limitations
  - Custom column
  - Summarize
    - Custom expressions
  - Filter
  - Row limit
- previewing results
- converting to SQL
- multiple stages of aggregations and filters
-
