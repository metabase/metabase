---
title: Filters
---

# Filters

Filtering just means narrowing things down based on certain criteria. You're probably already familiar with filtering when looking for something online, like when shopping. Maybe you only want to see olive-colored pants, or books where the author's last name is "Borges," or pictures of people wearing olive-colored pants reading Jorge Luis Borges.

![Filtering](../images/filter-step.png)

When you add a filter step, you can select one or more columns to filter on. Depending on the [data type](https://www.metabase.com/learn/grow-your-data-skills/data-fundamentals/data-types-overview) of the column you pick, you'll get different [filter types](#filter-types), like a calendar for date columns.

You can add subsequent filter steps after each summarize step. This lets you do things like summarize by the count of rows per month, and then add a filter on the `count` column to only include rows where the count is greater than 100. (This is basically like a SQL `HAVING` clause.)

Once you're happy with your filter, click **Add filter**, and visualize your results. Your data will be updated with the filter applied.

If you want to edit your filter, just click the little purple filter at the top of the screen. If you click on the X, you'll remove your filter. You can add as many filters as you need.

## Filter types

Depending on the data type of the column, Metabase will present different filtering options.

- **Numeric columns** let you add filters to only include rows in your table where this number is between two specific values, or is greater or less than a specific value, or is exactly equal to something.
- **Text or category columns** let you specify that you only want to include data where this column is or isn't a specific option, whether it contains, starts with, or ends with a substring, or whether the row is empty or not.
- **Date columns** give you a lot of options to filter by specific date ranges, relative date ranges, and more.
- **Structured data columns**, typically JSON or XML, can only be filtered by "Is empty" or "Not empty". Some databases, however, support [JSON unfolding](../../data-modeling/json-unfolding.md), which allows you to split up JSON data into separate columns, which you can then filter on.

## Filter multiple columns

When viewing a table or chart, clicking on the **Filter** will bring up the filter modal.

![Bulk filter modal](../images/bulk-filter-modal.png)

Here you can add multiple filters to your question in one go (which can save you a lot of loading time). Filter options will differ depending on the [field type](../../data-modeling/field-types.md). Any tables linked by foreign keys will be displayed in the left tab of the modal. You can also filter your summaries.

When you're done adding filters, hit **Apply filters** to rerun the query and update its results. To remove all the filters you've applied, click on **Clear all filters** in the bottom left of the filter modal. Any filters you apply here will show up in the editor, and vice versa.

## Filtering by date

One important thing to understand when filtering on a date column is the difference between specific and relative dates:

- **Specific dates** are things like November 1, 2010, or June 3 – July 12, 2017; they always refer to the same date(s).
- **Relative dates** are things like "the previous 30 days," or "the current week;" as time passes, the dates these options refer to _change_. Relative dates are a useful way to set up a filter on a question so that it stays up-to-date by showing you, for example, how many people visited your website in the last 7 days. You can also click on the **...** to specify a **Starting from** option, which lets you offset the relative date range. For example, you could set the range as the "Previous 7 days, starting from 2 days ago".

## Filter with custom expressions

![Filter expression](../images/filter-expression.png)

If you have a more complex filter you're trying to express, you can pick [Custom Expression](./expressions.md) from the add filter menu to create a filter expression. You can use comparison operators like greater than, `>`, or less than ,`<`, as well as spreadsheet-like functions. For example, `[Subtotal] > 100 OR median([Age]) < 40`.

Learn more about writing [expressions](./expressions.md) or skip right to the [list of expressions](./expressions-list.md).

## Filtering by a segment

If your Metabase administrators have created special named filters for the table you're viewing, they’ll appear at the top of the filter dropdown in purple text with a star next to them. These are called [**Segments**](../../data-modeling/segments.md), and they're shortcuts to a combination of filters that are commonly used in your organization. They might be called things like “Active Users,” or “Most Popular Products.”

