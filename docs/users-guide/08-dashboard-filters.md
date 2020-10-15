## Dashboard Filters

![Dashboard Filters](images/dashboard-filters/dashboard-filters.png)

Have you ever found yourself in a situation where it seems like you need to create nearly identical copies of the same dashboard, with just one different variable? Maybe you have an Earnings dashboard, but you want to see the data for each city your business is in, or maybe you have a KPI dashboard that you want to see broken out by month.

Instead of creating duplicate dashboards, you can use dashboard filters to create simple toggles to change a variable for cards on a dashboard.

### Adding a new filter

To add a filter to a dashboard, first click the **pencil icon** to enter dashboard editing mode, then click the **Add a Filter** button that appears in the top-right.

![Add a Filter](images/dashboard-filters/01-add-filter.png)

You can choose from a number of filter types: Time, Location, ID, or Other Categories. The type of filter you choose will determine what the filter widget will look like, as well as which fields you’ll be able to filter your cards by:

- **Time:** when picking a Time filter, Metabase will prompt you to pick a specific type of filter widget: Month and Year, Quarter and Year, Single Date, Date Range, Relative Date, or All Options. Single Date and Date Range will provide a calendar widget, while the other options all provide slightly different dropdown interfaces for picking values. To get a widget that's just like the time filter in the graphical query builder, choose All options.
- **Location:** there are four types of Location filters to choose from: City, State, ZIP or Postal Code, and Country.
- **ID:** this filter provides a simple input box where you can type the ID of a user, order, etc.
- **Other Categories:** this is a flexible filter type that will let you create either a dropdown or input box to filter on any category field in your cards.

**Note:** If you're trying to filter Native/SQL questions, you'll need to [add a bit of additional markup to your query](13-sql-parameters.md) in order to use a dashboard filter with that question.

For our example, we'll select a Time filter, and then select the Month and Year option.

![Choose filter type](images/dashboard-filters/02-filter-type.png)

Metabase will show a new interface where you can wire up your new filter to each applicable card. 

![Wiring up the cards](images/dashboard-filters/03-wiring-cards.png)

Each card will feature a dropdown menu where you can select the column to filter. The sidebar on the right displays the settings for the current filter. If there’s a card on your dashboard that you don’t want to use with the filter, or that it doesn’t make sense to use with the filter, that’s okay — the filter will only be applied to the cards you select.

So here’s what we’re doing — when we pick a month and year with our new filter, the filter needs to know which column in the card to filter on. For example, if we have a **Total Orders** card, and each order has a `Date Ordered` as well as a `Date Delivered` column, we have to pick which of those columns to filter — do we want to see all the orders _placed_ in January, or do we want to see all the orders _delivered_ in January? So, for each card on our dashboard, we’ll pick a date column to connect to the filter. If one of your cards says there aren’t any valid columns, that just means that card doesn’t contain any columns that match the kind of filter you chose.

![Select fields](images/dashboard-filters/04-select-fields.png)

Before we **Save** our changes, we can use the right sidebar to customize the **Label** of our new filter, or set a **Default value**.

When you're finished wiring up the filter, click **Done** at the bottom of the sidebar, then click on **Save** in the top right to save the dashboard.

### Editing a filter

- **To edit a filter**: click the **pencil** icon to enter dashboard editing mode, then click the **gears** icon button on the filter you want to change. 
- **To reorder your filters**: just click on the grabber handle on the left side of a filter and drag the filter to a different position.
- **To set a default value**: click on the **gears** icon to open the filter sidebar, and enter a value in the **Default value** input field.
- **To remove a filter**: click **Remove** in the sidebar. If you accidentally remove a filter, just click **Cancel** in the top-right to exit dashboard editing mode without saving your changes. 

### Using filters

Once you’ve added a filter to your dashboard, just click on the filter to select a value and activate the filter. To stop filtering, just click the blue X. To change the filter, click anywhere else on it.

![Using a filter](images/dashboard-filters/08-use-filter.png)

You can also set up a dashboard question to [update a filter on click](interactive-dashboards.md#cross---filtering-a-dashboard).

### Choosing between a dropdown or autocomplete for your filter

Picking selections for a filter with lots of options is easier than ever before. If the field you're using for a filter has more than 100 unique values, you'll now automatically see a search box with autocomplete suggestions:

![Autocomplete](images/dashboard-filters/autocomplete.png)

Fields with fewer than 100 distinct values will list all options:

![List](images/dashboard-filters/list.png)

In both cases, you can pick one or multiple selections for your filter.

![Multi-select](images/dashboard-filters/multi-select.png)

If Metabase somehow picked the wrong behavior for your field, admins can go to the [Data Model](../administration-guide/03-metadata-editing.md) section of the admin panel and click on the **gear** icon by the field in question to specify a list, search box, or plain input box.

![Search options](images/dashboard-filters/search-options.png)

### Linking filters

You can also **link filters** so that a child filter knows to limit its choices based on the activation of a parent filter.

Say you have two filters, one to filter by state, the other to filter by city. You can link the city filter to the state filter so that when someone filter for California, the city filter will only show cities in California. In this case, state is the parent filter, and city is the child filter.

To link filters, you'll need to set up this parent-child relationship. And you set up this relationship through the child filter. In the above scenario, with a state and city filter, we'd edit the child filter, city, by clicking on the **gears** icon on the city filter. From the filter sidebar on the right, select the **Linked filters** tab. 

![Linked filters](images/dashboard-filters/linked-filter.png)

Here you can limit the current filter's choices. If you toggle on one of these dashboard filters, selecting a value for that filter will limit the available choices for this filter. In this case, we toggle on the state filter (the parent), to limit the choices for the city filter. When states are selected, the city filter will limit its choices to cities in those states. Click **Done**, then **Save** to save the dashboard.

### Best practices

Here are a few tips to get the most out of dashboard filters:

- **Limit filters to 3 or fewer**. Try to keep the number of filters you add to a dashboard to two or three. This will make it easier for your teammates to quickly understand what options are available to them when viewing your dashboard.
- **Start with a new dashboard**. While you can add dashboard filters to an existing dashboard with a bunch of cards in it, it can be easier to start a new dashboard and think about what filters you intend to add to it, and then make sure that you only put cards in that dashboard that can be used with the filters. You can also duplicate an existing dashboard, and pare down the number of cards.
- **Link filters** so people don't have to sift through irrelevant filter options (like cities not in a filtered state).
- **Use a chart or table to update a filter**. You can [set up a question to update a filter on click](interactive-dashboards.md). 

---

## Next: Interactive dashboards

We'll learn how to [customize what happens when people click on questions in your dashboards](interactive-dashboards.md).
