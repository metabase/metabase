---
title: Public sharing
redirect_from:
  - /docs/latest/administration-guide/12-public-links
  - /docs/latest/embedding/12-public-links
  - /docs/latest/questions/sharing/public-links
---

# Public sharing

Sometimes you'll want to share a dashboard or question you've saved with someone that isn't a part of your organization or company, or someone who doesn't need access to your full Metabase instance. Metabase lets administrators create public links and [public embeds](#public-embed) to let you do just that.

## Enable public sharing on Metabase

![Enable public sharing](../images/enable-public-sharing.png)

An admin needs to enable public sharing from **Settings** > **Admin settings** > **Public sharing** before you'll see the [sharing icon](#enable-sharing-on-your-saved-question-or-dashboard) option on questions and dashboards.

Once toggled on, the **Public sharing** section will display Metabase dashboards and questions with active public links. To make a public link inactive, click **Revoke link**.

## Enable sharing on your saved question or dashboard

If [public sharing](#enable-sharing-on-your-saved-question-or-dashboard) is enabled for your Metabase, you'll find the `Sharing and Embedding` icon on saved questions and dashboards (it looks like an arrow pointing up and to the right). The sharing button is located on the bottom right corner of a question, or the top right corner of a dashboard.

Click on the sharing icon to bring up the sharing settings modal, then click the toggle to generate the sharing link for that question or dashboard.

![Enable sharing](../images/enable-links.png)

For more information about the option to **Embed this item in an application**, see the docs on [signed embedding](../../embedding/signed-embedding.md).

## Public links

Once you've [enabled sharing on your question or dashboard](#enable-sharing-on-your-saved-question-or-dashboard), you can copy and share the public link URL with whomever you please. The public link URL will display static results of your question or dashboard, so visitors won't be able to drill-down into the underlying data on their own.

However, public URLs preserve [custom click behavior](../../dashboards/interactive.md) to external URLs. If you want to create a custom drill-down pathway, you can link to the public links of other questions or dashboards.

If you want to restrict what people can see in a public link based on a filter value, see [Public link parameters](#public-link-parameters).

### Public link to export question results in CSV, XLSX, JSON

To create a public link that people can use to download the results of a question:

1. Click on the **Sharing and embedding** icon for the question,
2. [Enable sharing](#enable-sharing-on-your-saved-question-or-dashboard).
3. Click on the format you want (CSV, XLSX, or JSON) below the **Public link** option (the link gets updated based on your selection).
4. Copy the public link and test it out to confirm that the link downloads the expected format.

![Public export](../images/public-export.png)

This public link export option is only available for questions, not dashboards.

## Public embed

If you want to embed the link to your dashboard or question in a simple web page or blog post, copy and paste the iframe snippet to your destination of choice.

You can update the link in the `src` attribute with [public embed parameters](#public-link-parameters) to customize the appearance of your question or dashboard.

## Public embed parameters

You can add hash parameters at the end of the public link in your iframe's `src` attribute to toggle appearance settings or set filter values. 

Note that it's possible to find the a public link URL behind a public embed. If someone gets access to the public link URL, they can remove the hash parameters from the URL to view the original question or dashboard (without any appearance or filter settings).

If you'd like to create a secure embed that prevents people from changing filter names or values, check out [signed embedding](../../embedding/signed-embedding.md).

### Appearance

| Parameter name         | Possible values                                  |
| ---------------------- | ------------------------------------------------ |
| bordered               | true, false                                      |
| titled                 | true, false                                      |
| theme                  | null, transparent, night                         |
| font                   | [font name](../../configuring-metabase/fonts.md) |
| hide_download_button   | true, false                                      |

### Filters

You can display a filtered view of your question or dashboard in a public embed. Make sure you've set up a [question filter](../query-builder/introduction.md#filtering) or [dashboard filter](../../dashboards/filters.md) first.

To display the filtered results in a public embed, add a query parameter at the end of the public link in your `src` attribute:

```
?filter_name=value
```

For example, say that we have a dashboard with an "ID" filter. We can give this filter a value of 7 and simultaneously prevent the filter widget from showing up on the embedded dashboard:

```
/dashboard/42?id=7#hide_parameters=id
```

You don't _have_ to assign a filter a value, though — if you only want to hide the filter, you can do this:

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
