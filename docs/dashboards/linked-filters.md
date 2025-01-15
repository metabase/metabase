---
title: Linked filters
---

# Linked filters

You can **link filters** on a dashboard so that a child filter knows to limit its choices based on the activation of a parent filter.

For example, you can have two dashboard filters: one to filter by state, the other to filter by city. You can link the city filter to the state filter so that when someone filters by California, the city filter only show cities in California in dropdown of suggested filter values. In this case, state is the parent filter, and city is the child filter.

![Linked filters](./images/field-values-linked-filters.png)

## Set up tables for linked filters

You can only link dashboard filters that are wired to database columns (not custom columns or summaries) on dashboard cards, because Metabase needs column metadata to create linked filters. Metabase needs to know what values are there in the columns, and how the columns in the parent and child relate to each other.

To make linked filters work, you need to set up an explicit relationship between the columns used in the parent filter and the child filters in table metadata. This means that your columns should be either:

- In the same table;
- In two different tables that have a foreign key relationship specified in [table metadata in Admin settings](../data-modeling/metadata-editing.md)
- In two different tables that have a foreign key relationships to one or more intermediate tables specified in [table metadata in Admin settings](../data-modeling/metadata-editing.md)

![Setting up foreign key in table metadata](./images/foreign-key-linked-filters.png)

Note that Metabase will not show an error if you try to set up linked filters with improperly linked columns, but you'll see that the values in child linked filter will not be filtered by parent filter. See [Troubleshooting link filters](../troubleshooting-guide/linked-filters.md) for more troubleshooting tips.

## Set up linked filters

You can link a child filter to one or more parent filters. The child filter (filter whose values are determined by another filter), must be an ID, Location, or Text or Category filter. Parent filters can have any [filter type](./filters.md).

To link a child filter on a dashboard to one or more parent filters:

1. Edit the dashboard by clicking on the pencil icon in the top right of the dashboard;
2. Edit the child filter by clicking on the gear icon in the filter;
3. In the filter settings sidebar on the right, switch to **Linked filters** tab;
4. Select the parent filters.

![Linked filters](./images/linked-filter.png)

The filters you select in the **linked filters** tab will be used to limit the choices of filter values for the child filters.

## Linked filters limitations

### Linked filters only use table-level information

A single dashboard filter can be wired to the same column on multiple dashboard cards, so dashboard filters — including linked filters — can only use table-level information about the column to populate possible filter values, and can't rely on any logic included in any specific dashboard card.

For linked filters specifically, this means that they can only use relationships specified on the table level in Table Metadata, and they will ignore any relationships specified only the model or question level.

In particular, this means that:

- Joining tables in a question or a model source, or even setting foreign key relationships in model metadata only, is **not sufficient** to enable linked filter values. You need to specify relationships in table metadata.

- Linked dashboard filters will not use any filter or join logic from any underlying card or model.

  For example, if you have State and City columns, and you build a model that filters out any data with `City = San Francisco`, then build a question based on this model and add it to a dashboard with linked State and City filters, selecting `State = CA` will still show San Francisco as an option for the City filter (although of course actually selecting this option will return no data for the question built on the "no San Francisco" model) .

### Linked filter work only with database columns

Metabase uses database column metadata to populate values for linked filters, which means that linked filters have to be connected to database columns. In particular:

- You can't create linked filters on custom columns

- Native/SQL questions must have a [field filter](../questions/native-editor/sql-parameters.md#the-field-filter-variable-type) variable in order to be linked. Basic SQL variables aren't connected to database columns, so they won't work for linked filters.

- You can't link filters that use "Custom List" or "From another model or question" as their value's source.

## Troubleshooting linked filters

If you're not seeing what you expect with linked filters, make sure that your table relationships are [set up to support linked filters](). See [Troubleshooting linked filters](../troubleshooting-guide/linked-filters.md) for more troubleshooting information.
