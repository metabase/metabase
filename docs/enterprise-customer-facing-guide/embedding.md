## Embedding Metabase in your web app
Metabase allows you to [embed standalone charts or dashboards](../administration-guide/13-embedding.md) in your own web applications for simple situations, but what if you want to provide your users with a more interactive, browsable experience? Metabase Enterprise Edition allows you to embed the entire Metabase app within your own web app, allowing you to provide drill-through for your embedded charts and dashboards, or even embed the graphical query builder.

### What you'll be doing
To get this going, you're going to need: An Enterprise Edition instance of Metabase that contains the dashboards and charts that you'd like to embed.
A separate web application that you want to embed your dashboards and charts in.

### Enabling embedding
First, let's enable embedding in your Metabase instance. Go to the Admin Panel, and under Settings, go to the “Embedding in other applications” tab. From there, click “Enable.”

Once you do, you'll see a set of options:

[FIX ME](…)

* **Embedding secret key:** Here you will see a secret signing key you can use later to sign JSON web tokens for requests to Metabase's /api/embed endpoints. If you ever need to invalidate that key and generate a new one, just click on “Regenerate Key”.

* **Embedding the entire metabase app:** Here's where you'll enter the base URL of the web application that you want to allow to embed Metabase. Only include the protocol and the host. For example, `http://my-web-app.example.com/`. If you're a fancy person, you can specify this URL in the environment variable `MB_EMBEDDING_APP_ORIGIN`.

### Set things up in your web app
To give you a picture of what you'll need to do in your app, we've created this [reference app](https://github.com/metabase/sso-examples/tree/master/app-embed-example).

The main elements you'll need are:

FIX ME

### Choosing what to embed
The exact next steps will differ depending on your specific needs and goals, but the basic tool you have at hand now is that you can make any link in your web app render a particular page from your Metabase instance.

So if you have for example a "Stats" or "Analytics" page in your web app, you could have that page display one of your Metabase dashboards. What's powerful about this type of embedding though is that your users will be able to click on the individual charts in that dashboard to see them in more detail, and further explore them using drill-through or even Metabase's graphical query builder.

You can even display a specific Metabase collection in your embed to allow your users to browse through all the dashboards and questions that you've made available to them.

### A note on drill-through and permissions
One of the main differences between embedding the full Metabase app vs. standalone embeds is that charts and graphs will have drill-down enabled. This lets your users click on charts to zoom in, pivot, and generally explore more.

#### What does drill-through let my users do exactly?
When clicking on any part of a chart — like a dot, bar, slice, or country — your users will see the drill-through action menu. This will let them do things like:
* See the unaggregated rows for that point on the chart.
* Zoom in on the clicked point on a time series
* Pivot or break out the clicked point by an available dimension to see a new chart
* Use the X-ray or Comparison actions, if you haven't turned X-rays off in the Admin Panel, which will display an automatic analysis of the clicked point.

Drill-through also allows users to click on the title of a chart in a dashboard to see the detail view of that question. From the detail view, if they have data permissions, they can use Metabase's graphical query editor to explore further. If they've been given SQL editor permissions, they can also view the SQL for the question and edit it to explore more.

Depending on the collections permissions you set, your users can also save their explorations into collections. If you want to allow them to find these saved explorations, make sure your web application implements a link to view the collections directory.


### Using SSO to apply data or collection permissions
If you're using SSO to authenticate users in your web app and you've also connected your SSO to Metabase, users who authenticate into your web application will automatically have their Metabase group permissions applied when viewing the dashboards, charts, or collections you embed. This means that once you've set up sandboxes and data and collection permissions in Metabase, you don't need to think about what your web app users can see when exploring.

---

## Next: customizing drill-through
Tailor what happens when your customers click on charts or graphs by [customizing drill-through](customizing-drill-through.md).
