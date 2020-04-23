## Embedding Metabase in other applications

Metabase includes a powerful application embedding feature that allows you to embed your saved questions or dashboards in your own web applications. You can even pass parameters to these embeds to customize them for different users.

### Key Concepts

#### Applications

An important distinction to keep in mind is the difference between Metabase and the embedding application. The charts and dashboards you will be embedding live in the Metabase application, and will be embedded in your application (i.e. the embedding application).

#### Parameters

Some dashboards and questions have the ability to accept parameters. In dashboards, these are synonymous with dashboard filters. For example, if you have a dashboard with a filter on Publisher ID, this can be specified as a parameter when embedding, so that you could insert the dashboard filtered down to a specific Publisher ID.

SQL based questions with template variables can also accept parameters for each variable. So for a query like

```
SELECT count(*)
FROM orders
WHERE product_id = {% raw %}{{productID}}{% endraw %}
```

you could specify a specific productID when embedding the question.

#### Signed parameters

In general, when embedding a chart or dashboard, the server of your embedding application will need to sign a request for that resource.

If you choose to sign a specific parameter value, that means the user can't modify that, nor is a filter widget displayed for that parameter. For example, if the "Publisher ID" is assigned a value and the request signed, that means the front-end client that renders that dashboard on behalf of a given logged-in user can only see information for that publisher ID.

### Enabling embedding

To enable embedding, go to the Admin Panel and under Settings, go to the "Embedding in other applications" tab. From there, click "Enable." Here you will see a secret signing key you can use later to sign requests. If you ever need to invalidate that key and generate a new one, just click on "Regenerate Key".
![Enabling Embedding](images/embedding/01-enabling.png)

You can also see all questions and dashboards that have been marked as "Embeddable" here, as well as revoke any questions or dashboards that should no longer be embeddable in other applications.

Once you've enabled the embedding feature on your Metabase instance, you should then go to the individual questions and dashboards you wish to embed to set them up for embedding.

### Embedding charts and dashboards

To make a question or dashboard embeddable, click the sharing icon on it:

![Share icon](images/embedding/02-share-icon.png)

Then select "Embed this question in an application"

![Enable sharing for a question](images/embedding/03-enable-question.png)

Here you will see a preview of the question or dashboard as it will appear in your application, as well as a panel that shows you the code you will need to insert in your application.

![Preview](images/embedding/04-preview.png)

Importantly, you will need to hit "Publish" when you first set up a chart or dashboard for embedding and each time you change your embedding settings. Also, any changes you make to the resource might require you to update the code in your own application to the latest code sample in the "Code Pane".

![Code samples for embedding](images/embedding/05-code.png)

We provide code samples for common front end template languages as well as some common back-end web frameworks and languages. You may also use these as starting points for writing your own versions in other platforms.

### Embedding charts and dashboards with locked parameters

If you wish to have a parameter locked down to prevent your embedding application's end users from seeing other users' data, you can mark parameters as "Locked." This will prevent that parameter from being displayed as a filter widget, so its value must instead be set by the embedding application's server code.

![Locked parameters](images/embedding/06-locked.png)

### Hiding parameters

If you have parameters that aren't required, but that you'd like to be hidden, instead of marking them as Locked you can use the `hide_parameters` URL option to hide one or more parameters (i.e., prevent it from showing up as a filter widget on screen). You'll want to add this option to the Metabase URL specified in your embedding iframe.

For example, if you have a parameter called "ID," in this example the ID filter widget would be hidden:

```
/dashboard/42#hide_parameters=id
```

If you want, you can also simultaneously assign a parameter a value and hide the widget like this:

```
/dashboard/42?id=7#hide_parameters=id
```

Note that the name of the parameter in the URL should be specified in lower case, and with underscores instead of spaces. So if your parameter was called "Filter for User ZIP Code," you'd write:

```
/dashboard/42#hide_parameters=filter_for_user_zip_code
```

You can specify multiple parameters to hide by separating them with commas, like this:

```
/dashboard/42#hide_parameters=id,customer_name
```

To specify multiple values for filters, though, you'll need to separate them with ampersands (&), like this:

```
/dashboard/42?id=7&customer_name=janet
```

### Resizing dashboards to fit their content

Dashboards are a fixed aspect ratio, so if you'd like to ensure they're automatically sized vertically to fit their contents you can use the [iFrame Resizer](https://github.com/davidjbradshaw/iframe-resizer) script. Metabase serves a copy for convenience:

```
<script src="http://metabase.example.com/app/iframeResizer.js"></script>
<iframe src="http://metabase.example.com/embed/dashboard/TOKEN" onload="iFrameResize({}, this)"></iframe>
```

### Reference applications

To see concrete examples of how to embed Metabase in applications under a number of common frameworks, check out our [reference implementations](https://github.com/metabase/embedding-reference-apps) on Github.

## Premium embedding

If you'd like to embed Metabase dashboards or charts in your application without the "Powered by Metabase" attribution, you can purchase premium embedding from the Metabase store. [Find out more here](https://store.metabase.com/product/embedding).
