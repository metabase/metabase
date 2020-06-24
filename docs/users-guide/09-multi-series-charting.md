## Charts with multiple series

Data in isolation is rarely all that useful. One of the best ways to add context and clarity when communicating with data is to show data side-by-side with other data. Here are just a few examples of data that is better together than apart.

- Your company’s revenue vs. its costs over time.
- Average order price this month and user signups for that month.
- New users per day vs. returning users per day.
- Orders per day from a few different product lines.

### Two ways to display data side-by-side.

1. **Combining two existing saved questions** that share a common dimension (like time) on a dashboard. For example, let me see revenue over time and cost over time together.

2. **Use the notebook editor to ask a question that involves multiple dimensions** in the query builder (or in SQL, if you’re fancy). Example: the count of users by region over time.

### Combining two existing saved questions

If you already have two or more saved questions you’d like to compare, and they share a dimension, they can be combined on any dashboard. Here’s how:

1. Add a question with a dimension like time or a category to a dashboard. In practice, these will usually be line charts or bar charts.

2. While in edit mode on the dashboard, hovering over a card will display some editing options in the upper right of the question, including an option to **add a line**, as well as a **gear** icon. Click on the add a line option (the **+** with a line and the word "Add" next to it). 

![add multi-series](images/multi-series-charts/add_series.png)

3. In the Edit Data modal, you’ll see the original question on the left, with a list of compatible questions you can choose from on the right. Search question(s) to add, and check the box next to each question you’d like to see side-by-side with the original. Metabase will add the question(s) to the same chart.

![multi-series edit modal](images/multi-series-charts/edit_modal.png)

If necessary, the X and Y axes will automatically update. Metabase will create a legend using the existing card titles to help you understand which question maps to which series on the chart. Repeat this process as many times as you need.

![Edit modal with multi-series](images/multi-series-charts/edit_modal_multi-series.png)

To remove a series, simply uncheck its box.

Once you have your chart looking how you’d like, hit done and your changes will be shown on the card in the dashboard. Depending on how dense your data is, at this point you might want to consider enlarging your chart to make sure the data is legible.

#### A quick note about SQL based questions.

Metabase has less information about SQL-based questions, so we cannot guarantee if they can be added reliably. You'll see a little warning sign next to SQL questions to indicate this uncertainty, so be aware that adding these kinds of questions may not work.

### Combining Number charts

If you need to compare single numbers and get a sense of how they differ, Metabase also lets you turn multiple Number charts into a bar chart. To do this, follow the same process outlined above. While editing a dashboard, click “edit data” on the Number chart of your choice and then select the other saved question(s) you’d like to see represented on the bar chart. (At Metabase, we use this to create simple funnel visualizations.)

### Using the notebook editor to create a multi-series visualization.

If you’re creating a new question, you can also view the result as a multi-series visualization by summarizing your data and grouping it into two or more groups.

As an example, we might want to see which website or service is referring the most people to our website. (In the sample dataset that ships with Metabase this would involve using the `Source` and `Created At` columns of the `People` table.)

To do this we’d click the Summarize button, and then add `Source` and `Created At` as groupings (the `count of rows` metric that we want is already selected by default). [Learn more about asking questions](04-asking-questions.md).

Metabase will automatically display a multi-series line chart visualization of how each referrer has performed for us.

![multi-series in the query builder](images/multi-series-charts/multi-series_query_builder.png)

> You won’t be able to add another saved question to multi-series visualizations made in this fashion. Metabase can only visualize up to 20 values of a dimension at once, so if you're selecting a field that contains a lot of values, you may need to filter the values.

### Tips for displaying multiple series

- When displaying multiple series it’s important to keep legibility in mind. Combining many series can sometimes decrease the communication value of the data.



### To recap:

- Existing saved questions can be combined and displayed on dashboards when editing the dashboard.
- Scalars can be combined to create bar charts and simple funnels.
- You can produce a multi-series visualization in the query builder by adding two dimensions to your query.

Go forth and start letting your data get to know each other.

---

## Next: Getting reports with Pulses

Pulses let you send out a group of saved questions on a schedule via email or Slack. [Get started with Pulses](10-pulses.md).
