---
title: Linked filters
---

# Linked filters on dashboards

You can **link filters** so that a child filter knows to limit its choices based on the activation of a parent filter.

Say you have two filters, one to filter by state, the other to filter by city. You can link the city filter to the state filter so that when someone filters by California, the city filter will "know" to only show cities in California. In this case, state is the parent filter, and city is the child filter.

## Set up data for linked filters

Metabase uses table and column metadata to create linked filters. For linked filters to work, Metabase needs to know how the columns and tables relate to each other, so there needs to be an explicit relationship between the columns used in the parent filter and the child filters.

The parent and child columns should be either:

- In the same table;
- In two different tables that have an explicit foreign key relationship specified in table metadata in Admin settings
- In two different tables that have foreign key relationships to one or more intermediate tables specified in table metadata in Admin settings

For example, if you have an entity-relationship diagram like this:

Then some of the example linked filters that will work correctly:

| Parent | Child | Why it works |
| ------ | ----- | ------------ |
| A      | B     | C            |

Here are linked filters that **won't work correctly**

| Parent | Child | Why it **won't work** |
| ------ | ----- | --------------------- |
| A      | B     | C                     |

Note that Metabase will not give an errors for , but the values in linked filters. See [Troubleshooting]

## Set up linked filters

To link filters, you'll need to set up this parent-child relationship. And you set up this relationship through the child filter. In the above scenario, with a state and city filter, we'd edit the child filter, city, by clicking on the **gears** icon on the city filter. From the filter sidebar on the right, select the **Linked filters** tab.

![Linked filters](./images/linked-filter.png)

Here you can limit the current filter's choices. If you toggle on one of these dashboard filters, selecting a value for that filter will limit the available choices for this filter. In this case, we toggle on the state filter (the parent), to limit the choices for the city filter. When states are selected, the city filter will limit its choices to cities in those states. Click **Done**, then **Save** to save the dashboard.

## Linked filters only use table-level information

Because a single dashboard filter can be wired to the same column on multiple dashboard cards, dashboard filters - including linked filters - can only use table-level information about the column to populate possible filter values, and can't rely on any logic included in any specific dashboard card.

For linked filters specifically, this means that they can only use relationships specified on the table level in Table Metadata, and they will ignore any relationships specified only the model or question level.

In particular, this means that:

- Joining tables in a question or a model source, or even setting foreign key relationships in model metadata only, is **not sufficient** to enable linked filter values. You need to specify relationships in table metadata

- Linked dashboard filters will not use any filter or join logic from any underlying card or model.

  For example, if you have State and City columns, build a model that filters out any data with city=San Francisco, then build a question based on this model and add it to a dashboard with linked State and City filters, selecting State = CA will still show San Francisco as an option for the City filter (although of course actually selecting this option will return no data for the question built on the "no San Francisco" model) .

## Other linked filter limitations

- Metabase uses table-level about columns to populate values for linked

- You can't create linked filters on custom columns. That's because Metabase uses column metadata to create linked filters, so it can only work with filters that are explicitly connected to actual database columns.

- Native/SQL questions must have a [field filter](../questions/native-editor/sql-parameters.md#the-field-filter-variable-type) variable in order to be linked. That's because Metabase uses column metadata to create linked filters, so it can only work with filters that are explicitly connected to actual database columns. Basic SQL variables aren't connected to columns, so they won't work for linked filters.

- You can't link filters that use "Custom List" or "From another model or question" as their value's source. That's because Metabase uses column metadata to create linked filters, and so it needs to have an actual database column as a data source.

## Troubleshooting linked filters

If you're not Make sure that your table metadata is set up to support linked filters

See [Troubleshooting linked filters] for more information.
