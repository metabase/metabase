---
title: Basic exploration
redirect_from:
  - /docs/latest/users-guide/03-basic-exploration
---

# Basic exploration

## See what your teammates have made

As long as you're not the very first user in your team's Metabase, the easiest way to start exploring your data is by looking at dashboards, charts, and lists that your teammates have already created. The best place to start is by checking out any dashboards that might be pinned on your home page, or in [collections][collections] you have access to.

## Browse your data

Alternatively, you can dive right in to exploring the data in Metabase by clicking on one of the databases at the bottom of the home page or clicking the **Browse data** button in the top nav bar, and then selecting a database and clicking on one of its tables to see it. You can also click on the bolt icon on any table to see an automatic exploration of its data. Give it a try!

![Browse data](./images/browse-data.png)

To learn more, see [Exploring data with Metabase's data browser](https://www.metabase.com/learn/basics/questions/data-browser.html).

## Exploring collections

[Collections][collections] in Metabase are a lot like folders. They're where all your team's dashboards and charts are kept. To explore a collection, just click on one in the **Our analytics** section of the home page, or click on `Browse all items` to see everything.

![A collection](./images/collection-detail.png)

If your teammates are cool, they'll have pinned some important dashboards or questions within your collections; if so, those important or useful items will show up in a different color at the top of a collection. Any dashboards that are pinned in the top-level, **Our Analytics** collection will also show up on the Metabase homepage.

Collections have a list of any other items that are saved within them, and you can see what other collections are saved inside of the current one by checking out the navigation sidebar.

## Models

You can use Models to create derived tables on the fly. See [Models][models].

## Exploring dashboards

[Dashboards][dashboards] are a set of questions and text cards that you want to be able to refer to regularly.

If you click on a part of a chart, such as a bar in a bar chart, or a dot on a line chart, you'll see a the **Action menu**, with actions you can take to dive deeper into that result, branch off from it in a different direction, or create an [X-ray](x-rays.md) to see an automatic exploration of the data.

![Drill through](images/drill-through.png)

In this example of orders by product category over time, clicking on a dot on this line chart gives us the ability to:

- **Zoom in**: See orders for a particular category over a shorter time range.
- **View these Orders**: See a list of the orders for a particular month
- **Break out by a category**: See things like the Gizmo orders in June 2017 broken out by the status of the customer (e.g., `new` or `VIP`). Different charts will have different breakout options, such as **Location** and **Time**.

> Note that while charts created with SQL don't currently have the drill-through menu, you can add SQL questions to a dashboard and customize their click behavior. You can send people to a [custom destination](https://www.metabase.com/learn/building-analytics/dashboards/custom-destinations.html) (like another dashboard or an external URL), or have the clicked value [update a dashboard filter](https://www.metabase.com/learn/building-analytics/dashboards/cross-filtering.html).

Clicking on a table cell will often allow you to filter the results using a comparison operator, like =, >, or <. For example, you can click on a table cell, and select the less than operator `<` to filter for values that are less than the selected value.

![Comparison operator filters](images/comparison-operator-filters.png)

Lastly, clicking on the ID of an item in a table gives you the option to go to a detail view for that single record. For example, you can click on a customer's ID to see the profile view for that customer.

![Detail view](images/detail-view.png)

When you add questions to a dashboard, you can have even more control over what happens when people click on your chart. In addition to the default drill-through menu, you can add a [custom destination](https://www.metabase.com/learn/building-analytics/dashboards/custom-destinations.html) or [update a filter](https://www.metabase.com/learn/building-analytics/dashboards/cross-filtering). Check out [interactive dashboards](../dashboards/interactive.md). to learn more.

## Exploring saved questions

In Metabase parlance, every chart on a dashboard is called a "question." Clicking on the title of a question on a dashboard will take you to a detail view of that question. You'll also end up at this detail view if you use one of the actions mentioned above.

When you're looking at the detail view of a question, you can use all the same actions mentioned above. You can also click on the headings of tables to see more options, like summing the values of a column, or filtering based on that column.

![Heading actions](images/heading-actions.png)

One of our personal favorite ways to explore is with the **Distribution** option. This will show you how many rows there are in a given table, grouped by the column you clicked on. So if you have a Users table, if you click on an Age column and select Distribution, you'll see a bar chart with the count of users you have in each age bracket.

## Search

Use the search bar to find dashboards, questions, collections, and pulses. You can select from the typeahead's dropdown results, or hit enter to view a search results page. You can also activate the search bar from anywhere by pressing the `/` key.

Searches take into account items’ titles, descriptions, and other metadata — you can even search the contents of your SQL queries. For example, you can search for things like `SELECT escape_pod FROM mothership` and find that one question you worked on six months ago. The results will display which collection each item is saved in, what kind of object it is, and whether it’s pinned. Note that you'll only ever see items in collections you have permission to view.

![Search results](./images/search-results.png)

## Bookmarks

**Bookmarks** are a way to quickly get back to things you visit frequently (or have been working on recently). Bookmarked items show up in the main navigation sidebar above [collections][collections].

To bookmark an item, look for the **ribbon** icon. If you don't immediately see the ribbon, open up the settings for that item. You can bookmark:

- Questions (ribbon's in the editing sidebar)
- Models (ribbon's in the editing sidebar)
- Dashboards (ribbon's in the **...** menu)
- Collections (ribbon's in the upper right of the collection's page)

When viewing a collection, you can also click on the **...** next to an item to add or remove a bookmark from the item.

Some things to remember with bookmarks:

- Bookmarks are personal; other people can't see your bookmarks. If you want to highlight something for everyone, you'll want to put it in an official collection and/or pin the item in the collection (see [collections][collections]).
- If you end up bookmarking a lot of items, you can collapse the bookmarks section in the sidebar (or remove the bookmarks that are just getting in your way).
- Items that you bookmark will get a boost in your search results (but not the search results of other people).
- To reorder bookmarks, simply drag and drop them in the sidebar.

## Verified items

{% include plans-blockquote.html feature="Verification" %}

Verified questions and models are marked with a blue checkmark icon:

![Verified icon](./images/verified-icon.png)

Administrators can **Verify** a question or model from the three dot menu (`...`) to signal that they've reviewed the item and deemed it to be trustworthy. That is: the question or model is filtering the right columns, summarizing the right metrics, and querying records from the right tables. Verified items are more likely to show up higher in search suggestions and search results.

If someone modifies a verified question, the question will lose its verified status, and an administrator will need to review and verify the question again to restore its verified status.

[collections]: ./collections.md
[dashboards]: ../dashboards/start.md
[models]: ../data-modeling/models.md
