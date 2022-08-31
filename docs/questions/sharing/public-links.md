---
title: Sharing questions using public links
redirect_from:
  - /docs/latest/administration-guide/12-public-links
  - /docs/latest/embedding/12-public-links
---

# Sharing questions using public links

Sometimes you'll want to share a dashboard or question you've saved with someone that isn't a part of your organization or company, or someone who doesn't need access to your full Metabase instance. Metabase lets administrators create public links and [public embeds](#public-embed) to let you do just that.

## Turning public links on

![Enable public sharing](../images/enable-public-sharing.png)
First things first, you'll need to go to the Admin Panel and enable public sharing. In the future, you'll see dashboards and questions you've shared listed here, and you'll be able to revoke any public links that you no longer want to be used.

## Enable sharing on your saved question or dashboard

![Enable sharing](../images/enable-links.png)

Next, exit the Admin Panel and go to question that you want to share, then click on the `Sharing and Embedding` icon in the bottom-right of the screen (it looks like an arrow pointing up and to the right). Then click on the toggle to enable public sharing for this question.

In the case of a dashboard, the button is located on the top right of the page.

## Copy, paste, and share!

Copy and share the public link URL with whomever you please. The public link URL will display static results of your question or dashboard, so visitors won't be able to drill-down into the underlying data on their own.

However, public URLs preserve [custom click behavior](../../dashboards/interactive.md). If you like, you can share specific drill-down views by linking to other questions or dashboards.

## Public exports for question results in CSV, XLSX, JSON

To create a public link to download the results of a question:

- Click on the **Sharing and embedding** icon for the question,
- Enable sharing,
- Then, below the **Public link** option, click on the format you want (CSV, XLSX, or JSON). Metabase will update the link based on your selection.
- Copy the link and test it out to confirm that the link downloads the expected format.

![Public export](../images/public-export.png)

This public link export option is only available for questions, not dashboards.

## Public embed

If you want to embed the link to your dashboard or question in a simple web page or blog post, copy and paste the iframe snippet to your destination of choice.

## Assigning values to filters or hiding them via the URL

This is a bit more advanced, but if you're embedding a dashboard or question in an iframe and it has one or more filter widgets on it, you can give those filters values and even hide one or more filters by adding some options to the end of the URL. (You could also do this when just sharing a link, but note that if you do that, the person you're sharing the link with could of course directly edit the URL to change the filters' values, or to change which filters are hidden or not.)

Here's an example where we have a dashboard that has a couple filters on it, one of which is called "ID." We can give this filter a value of 7 and simultaneously prevent the filter widget from showing up by constructing our URL like this:

```
/dashboard/42?id=7#hide_parameters=id
```

You don't _have_ to assign a filter a value, though — if you only want to hide it, so that it isn't usable in this context, you can do this:

```
/dashboard/42#hide_parameters=id
```

Note that the name of the filter in the URL should be specified in lower case, and with underscores instead of spaces. So if your filter was called "Filter for User ZIP Code," you'd write:

```
/dashboard/42#hide_parameters=filter_for_user_zip_code
```

You can specify multiple filters to hide by separating them with commas, like this:

```
/dashboard/42#hide_parameters=id,customer_name
```

To specify multiple values for filters, though, you'll need to separate them with ampersands (&), like this:

```
/dashboard/42?id=7&customer_name=janet
```

## Further reading

- [Publishing data visualizations to the web](https://www.metabase.com/learn/embedding/embedding-charts-and-dashboards).
- [Customizing Metabase's appearance](../../configuring-metabase/appearance.md).
- [Embedding introduction](../../embedding/start.md).
