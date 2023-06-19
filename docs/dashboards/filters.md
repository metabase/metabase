---
title: Dashboard filters
redirect_from:
  - /docs/latest/users-guide/08-dashboard-filters
---

# Dashboard filters

![Dashboard Filters](./images/filters.png)

Have you ever found yourself in a situation where it seems like you need to create nearly identical copies of the same dashboard, with just one different variable? Maybe you have an Earnings dashboard, but you want to see the data for each city your business is in, or maybe you have a KPI dashboard that you want to see broken out by month.

Instead of creating duplicate dashboards, you can add [filter widgets](#filter-widgets) to let people change variables for cards on a dashboard.

## Adding a new filter

To add a filter to a dashboard, first click the **pencil icon** to enter dashboard editing mode, then click the **Add a Filter** button that appears in the top-right.

![Add a Filter](./images/add-filter.png)

You can choose from a number of filter types:

- [Time](#time-filters)
- [Location](#location-filters)
- [ID](#id-filter)
- [Number](#number-filter)
- [Text or categories](#text-or-category-filter)

The type of filter you choose will determine what the [filter widget](#filter-widgets) will look like, as well as which fields you’ll be able to filter your cards by:

### Time filters

When picking a Time filter, Metabase will prompt you to pick a specific type of filter widget:

- Month and Year
- Quarter and Year
- Single Date
- Date Range
- Relative Date
- All Options

Single Date and Date Range will provide a calendar widget, while the other options all provide slightly different dropdown interfaces for picking values. To get a widget that's just like the time filter in the query builder, choose All options.

### Location filters

There are four types of Location filters to choose from:

- City
- State
- ZIP or Postal Code
- Country

### ID filter

The ID filter provides a simple input box where you can type the ID of a user, order, etc.

### Number filter

You can choose from:

- Equal to
- Not equal to
- Between
- Greater than or equal to
- Less than or equal to

### Text or category filter

A flexible filter type that will let you create either a dropdown menu or an input box to filter on any category field in your cards. Options include:

- **Is**. Select one or more values from a list or search box.
- **Is not**. Exclude one or more specific values.
- **Contains**. Match values that contain the entered text.
- **Does not contain**. Filter out values that contain the entered text.
- **Starts with**. Match values that begin with the entered text.
- **Ends with**. Match values that end with the entered text.

## Filtering dashboards with native/SQL questions

If you're trying to filter native/SQL questions, you'll need to [add a bit of additional markup to your query](../questions/native-editor/sql-parameters.md) in order to use a dashboard filter with that question. For an in-depth article on this, check out [Adding filters to dashboards with SQL questions](https://www.metabase.com/learn/dashboards/filters).

## Example filter

Let's add a filter widget to our dashboard. We'll select a **Text or Category** filter, and then select the **Is** option to select one or more values from a list.

Metabase will display a filter editing sidebar where you can wire up your new filter to each applicable card. Each card will feature a dropdown menu where you can select the column to filter. The sidebar on the right displays the settings for the current filter.

If there’s a card on your dashboard that you don’t want to use with the filter, or that doesn’t make sense to use with the filter, that’s okay — the filter will only be applied to the cards you select.

Here we've wired up a Text filter to a card on the `Analytics.Event.Button.Label` field:

![Wiring up a dashboard filter to a card](./images/wiring-cards.png)

Before we **Save** our changes, we can edit our filter's settings.

## Editing a filter

To access a filter's settings:

1. Click the **pencil** icon to enter dashboard editing mode.
2. Click the **gear** icon on the filter you want to edit.

From this filter editing view, you can wire up individual dashboard cards to the filter, or use the settings in the sidebar to:

- [Remove a filter](#remove-a-filter)
- [Reorder filter widgets](#reorder-filter-widgets)
- [Set a default filter value](#set-a-default-filter-value)
- [Make a multi-select filter](#make-a-multi-select-filter)
- [Change the filter widget type](#filter-widgets)
- [Change a filter's selectable values](#change-a-filters-selectable-values)

### Remove a filter

1. In dashboard edit mode, click your filter's **gear** icon.
2. From the sidebar, click **Remove**.

If you accidentally remove a filter, just click **Cancel** in the top-right to exit dashboard edit mode without saving your changes.

### Reorder filter widgets

In dashboard edit mode, click on the grabber handle (six dots) on the left side of a filter widget, then drag the widget to a different position.

### Set a default filter value

1. In dashboard edit mode, click your filter's **gear** icon.
2. From the sidebar, choose a value from the **Default value** input field.

For example, you might want to set a default filter value like "Active", so that when people load your dashboard, they only see data for "Active" records (not "Inactive", "Cancelled", etc).

### Make a multi-select filter

1. In dashboard edit mode, click your filter's **gear** icon.
2. From the sidebar, find **Users can pick** and select "Multiple values".

A multi-select filter with the widget type [Dropdown list](#dropdown-list) or [Search box](#search-box) will display a list of values with checkboxes.

### Change a filter's selectable values

1. In dashboard edit mode, click your filter's **gear** icon.
2. From the sidebar, find **How should users filter on this column?**.
3. Select "Dropdown list".\*
4. Click **Edit** (to the right of "Dropdown list") to specify where the values should come from:
    - From connected fields
    - From another model or question
    - Custom list

![Selectable values](./images/selectable-values.png)

\* If you don't see "Dropdown list" as an option, go to [Filter widgets: Dropdown list](#dropdown-list) for more info.

## Using filters

Once you’ve added a filter to your dashboard, just click on the filter widget to select a value and activate the filter. To stop filtering, just click the blue X.

![Using a filter](./images/use-filter.png)

You can also set up a dashboard question to [update a filter on click](./interactive.md#use-a-chart-to-filter-a-dashboard).

## Filter widgets

The filter widget is the little box at the top of your dashboard which people will use to enter their filter values.

You can find a filter's widget settings from dashboard edit mode (**pencil** icon), then clicking on a filter widget's **gear** icon.

From the filter settings sidebar, you'll find the widget types under **How should people filter on this column?**:

- [Dropdown list](#dropdown-list)
- [Search box](#search-box)
- [Input box](#plain-input-box)

### Dropdown list

A list of all of the possible values in a column. People can use checkboxes to select more than one value on [multi-select filters](#make-a-multi-select-filter). You should choose the dropdown widget if you want the list of filter values to load instantly (from cache).

If you're not seeing the **Dropdown list** option, and your dashboard filter is based on a column from a:

- Table or GUI model: an admin will need to [enable the dropdown widget](../data-modeling/metadata-editing.md#changing-a-search-box-filter-to-a-dropdown-filter) for that column from Metabase's **Admin settings**.

- SQL model: go to your [model's metadata settings](../data-modeling/models.md#add-metadata-to-columns-in-a-model), find your column, and set the **Database column this maps to**.

### Search box

A search box that suggests a list of matching filter values as you type. The suggestion list will display checkboxes for [multi-select filters](#make-a-multi-select-filter).

The search box is a good choice for most columns containing labels, categories, statuses, and so on. This is the default filter widget for columns with less than 100 unique values.

### Plain input box

An input box that lets people enter plain text (no suggestion list).

Useful for looking up partial matches (such as the ["contains" filter](#text-or-category-filter)) in columns that contain free text, such as comments or descriptions. The input box is the default filter widget for columns with more than 100 unique values.

## Linking filters

You can also **link filters** so that a child filter knows to limit its choices based on the activation of a parent filter.

Say you have two filters, one to filter by state, the other to filter by city. You can link the city filter to the state filter so that when someone filters by California, the city filter will "know" to only show cities in California. In this case, state is the parent filter, and city is the child filter.

To link filters, you'll need to set up this parent-child relationship. And you set up this relationship through the child filter. In the above scenario, with a state and city filter, we'd edit the child filter, city, by clicking on the **gears** icon on the city filter. From the filter sidebar on the right, select the **Linked filters** tab.

![Linked filters](./images/linked-filter.png)

Here you can limit the current filter's choices. If you toggle on one of these dashboard filters, selecting a value for that filter will limit the available choices for this filter. In this case, we toggle on the state filter (the parent), to limit the choices for the city filter. When states are selected, the city filter will limit its choices to cities in those states. Click **Done**, then **Save** to save the dashboard.

To learn more, check out [Linking filters in dashboards](https://www.metabase.com/learn/dashboards/linking-filters).

## Auto-apply filters

By default, each time you change the value in a filter on a dashboard, the dashboard will refresh to get the results of each card with that new filter value applied.

If a dashboard is particularly large or slow, or you have multiple filters that you want to adjust, you may want to tell Metabase when to refresh the dashboard.

To turn off the automatic application of filters, click on the info **i** icon, and toggle the **Auto-apply filters** option. With auto-apply turned off, each time you change a value in a filter, you'll need to click the apply button to refresh the dashboard with the new filter value.

![Click Apply to apply the filters and refresh the dashboard](./images/apply-button.png)

## Best practices

Here are a few tips to get the most out of dashboard filters:

- **Limit filters to 3 or fewer**. Limiting filters will make it easier for your teammates to quickly understand what options are available to them when viewing your dashboard.
- **Start with a new dashboard**. While you can add dashboard filters to an existing dashboard with a bunch of cards in it, it can be easier to start a new dashboard and think about what filters you intend to add to it. That way you can make sure that you only put cards in that dashboard that can be used with the filters. Alternatively, you could duplicate an existing dashboard, and pare down the number of cards.
- **Link filters** so people don't have to sift through irrelevant filter options (like cities not in a filtered state).

## Further reading

- [Introduction to dashboards](./introduction.md)
- [Interactive dashboards](./interactive.md)
- [Dashboard subscriptions](./subscriptions.md)
- [Charts with multiple series](./multiple-series.md)
- [Learn dashboards](https://www.metabase.com/learn/dashboards)
