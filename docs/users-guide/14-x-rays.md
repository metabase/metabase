## X-rays and Comparisons
---
X-rays and comparisons are two powerful new features in Metabase that allow you to get deeper statistical reports about your segments, fields, and time series.

### Time series x-rays

To view an x-ray report for a time series, open up a saved time series question (any kind of chart or table with a metric broken out by time), click on the Action Menu in the bottom-right of the screen, and select "X-ray this question:"

![Time series x-ray action](images/x-ray-action-time-series.png)

You'll get an in-depth analysis of your time series question, including growth rates, the distribution of values, and seasonality:

![Time series x-ray](images/x-ray-time-series.png)

### Segment, table, and field x-rays
To view an x-ray for a segment, table, or field, first go to the Data Reference, then navigate to the thing you want to x-ray, then select the x-ray option in the lefthand menu:

![X-rays in data reference](images/x-ray-data-reference.png)

If you have a saved Raw Data question that uses one or more segments as filters, you can also x-ray one of those segments from the Action Menu in the bottom-right of the screen when viewing that question:

![X-ray action](images/x-ray-action.png)

An x-ray report for a segment called "Californians" looks like this, displaying a summary of the distribution of values for each field in the segment, and the maximal and minimal values if applicable:

![X-ray](images/x-ray.png)

Clicking on the summary for any field will take you to the detailed x-ray report for that single field.

### Changing the fidelity of an x-ray

X-rays can be a somewhat costly or slow operation for your database to run, so by default Metabase only does a quick sampling of the segment or field you're x-raying. You can increase the fidelity in the top-right of the x-ray page:

![X-ray fidelity](images/x-ray-fidelity.png)

### Comparing a segment

Segments are a subset of a larger table or list, so one thing you can do when viewing an x-ray of a segment is compare it to its "parent" table. For example, if I have a segment called "Californians," which is a subset of the "People" table, I can click on the button that says "Compare to all People" to see a comparison report:

![Compare](images/x-ray-compare-button.png)

The comparison report shows how many rows there are in the segment versus the parent table, and also gives you a breakdown of how the fields in the segment differ from that of the parent table:

![Comparison report](images/x-ray-comparison.png)

An example for where this can be especially useful is a scenario where you've defined many different segments for your users or customers, like "Repeat Customers," "Users between 18 and 35," or "Female customers in Kalamazoo who dislike cheese." You can open up the x-ray for any of these segments, and then compare them to the larger Users or Customers table to see if there are any interesting patterns or differences.
