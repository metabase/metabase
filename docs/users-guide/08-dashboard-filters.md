## Dashboard Filters

![Dashboard Filters](images/dashboard-filters/dashboard-filters.png)

Have you ever found yourself in a situation where it seems like you need to create nearly identical copies of the same dashboard, with just one different variable? Maybe you have an Earnings dashboard, but you want to see the data for each city your business is in, or maybe you have a KPI dashboard that you want to see broken out by month.

Instead of creating duplicate dashboards, you can use Metabase’s dashboard filters feature to create simple toggles to change a variable for all the cards on a dashboard.

### Adding a new filter

To add a filter to a dashboard, first enter dashboard editing mode, then click the Add a Filter button that appears in the top-right.

![Add a Filter](images/dashboard-filters/01-add-filter.png)

You can choose from a number of filter types: Time, Location, ID, or Other Categories. The type of filter you choose will determine what the filter widget will look like, and will also determine what fields you’ll be able to filter your cards by:

- **Time:** when picking a Time filter, you'll also be prompted to pick a specific type of filter widget: Month and Year, Quarter and Year, Single Date, Date Range, Relative Date, or All Options. "Single Date" and "Date Range" will provide a calendar widget, while the other options all provide slightly different dropdown interfaces for picking values. Choose "All Options" to get a widget that's just like the time filter in the graphical query builder.
- **Location:** there are four types of Location filters to choose from: City, State, ZIP or Postal Code, and Country.
- **ID:** this filter provides a simple input box where you can type the ID of a user, order, etc.
- **Other Categories:** this is a flexible filter type that will let you create either a dropdown or input box to filter on any category field in your cards.

**Note:** If you're trying to filter Native/SQL questions, you'll need to [add a bit of additional markup to your query](13-sql-parameters.md) in order to use a dashboard filter with that question.

For our example, we'll select a Time filter, and then select the Month and Year option.

![Choose filter type](images/dashboard-filters/02-filter-type.png)

Now we’ve entered a new mode where we’ll need to wire up each card on our dashboard to our new filter. If there’s a card on your dashboard that you don’t want to use with the filter, or that it doesn’t make sense to use with the filter, that’s okay — the filter will only be applied to the cards you’ve selected.

![Wiring up the cards](images/dashboard-filters/03-wiring-cards.png)

So here’s what we’re doing — when we pick a month and year with our new filter, the filter needs to know which field in the card to filter on. For example, if we have a `Total Orders` card, and each order has a `Date Ordered` as well as a `Date Delivered`, we have to pick which of those fields to filter — do we want to see all the orders _placed_ in January, or do we want to see all the orders _delivered_ in January? So, for each card on our dashboard, we’ll pick a date field to connect to the filter. If one of your cards says there aren’t any valid fields, that just means that card doesn’t contain any fields that match the kind of filter you chose.

![Select fields](images/dashboard-filters/04-select-fields.png)

Before we click the `Done` button at the top of the screen, we can also customize the label of our new filter by clicking on the pencil icon next to it. We’ll type in a new label and hit enter. Now we’ll click `Done`, and then save the changes to our dashboard with the `Save` button.

![Edit the filter label](images/dashboard-filters/05-edit-label.png)

### Editing a filter

To edit a filter, enter dashboard editing mode, then click the `Edit` button on the filter you want to change. You an also click `Remove` to get rid of a filter. If you do this by accident, just click `Cancel` in the top-right to exit dashboard editing mode without saving your changes. To reorder your filters, just click on the grabber handle on the left side of a filter and drag it to a different position.

![Edit or remove a filter](images/dashboard-filters/06-edit-and-remove.png)

### Setting a default value

If you want one of your filters to start with a default value when you load the dashboard it’s in, while in filter editing mode just click on the filter to select a value. Click the blue X if you want to remove the default value.

![Set a default value](images/dashboard-filters/07-default-value.png)

### Using filters

Once you’ve added a filter to your dashboard, just click on it to select a value and activate the filter. To stop filtering, just click the blue X. To change the filter, click anywhere else on it.

![Using a filter](images/dashboard-filters/08-use-filter.png)

### Choosing between a dropdown or autocomplete for your filter

Picking selections for a filter with lots of options is easier than ever before. If the field you're using for a filter has more than 100 unique values, you'll now automatically see a search box with autocomplete suggestions.

![Autocomplete](images/dashboard-filters/autocomplete.png)

Fields with fewer than 100 distinct values will have display a list of all the options.

![List](images/dashboard-filters/list.png)

In both cases, you can pick one or multiple selections for your filter.

![Multi-select](images/dashboard-filters/multi-select.png)

If Metabase somehow picked the wrong behavior for your field, admins can go to the [Data Model](../administration-guide/03-metadata-editing.md) section of the admin panel and click on the gear icon by the field in question to manually choose between a list, a search box, or just a plain input box.

![Search options](images/dashboard-filters/search-options.png)

### Best practices

Here are a few tips to get the most out of dashboard filters:

- Try to keep the number of filters you add to a dashboard to two or three. This will make it easier for your teammates to quickly and easily understand what options are available to them when viewing your dashboard.
- While you can add dashboard filters to a dashboard that already has a bunch of cards in it, it can be easier to start a new dashboard and think about what filters you intend to add to it, and then make sure that you only put cards in that dashboard that can be used with the filters.

---

## Next: Charts with multiple series

We'll learn how to [create charts with multiple lines, bars, and more](09-multi-series-charting.md) next.
