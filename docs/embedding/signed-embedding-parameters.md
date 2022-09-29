---
title: Parameters for signed embeds
---

# Parameters for signed embeds

Also known as: parameters for standalone embeds.

Parameters are pieces of information that are passed between Metabase and your website via the [embedding URL](./signed-embedding.md#adding-the-embedding-url-to-your-website). You can use parameters to specify how Metabase items should look and behave inside the iframe on your website.

Parameters are added to the end of your embedding URL, like this:

```
your_embedding_url?parameter_name=value
```

## Adding a filter widget to a signed embed

You can add [filter widgets](https://www.metabase.com/glossary/filter_widget) to embedded dashboards or SQL questions.

1. Go to your dashboard or SQL question. Make sure you've set up a [dashboard filter](../dashboards/filters.md) or [SQL variable](../questions/native-editor/sql-parameters.md).
2. Click on the **sharing icon** > **Embed this item in an application**.
3. Under **Parameters**, you'll find the names of your dashboard filters or SQL variables.
4. Select **Editable** for each parameter that should get a filter widget on your embed.
5. Click **Publish** to save your changes.

**Editable** parameters are responsible for passing filter values from the embedded filter widget (displayed on the iframe) through to the filters on your original dashboard or SQL question (in your Metabase).

Note that [locked parameters](#pre-filtering-data-in-a-signed-embed) may limit the values that show up in an embedded filter widget.

## Populating an embedded filter widget with a default value

If you want to set a default value for your [embedded filter widget](#adding-a-filter-widget-to-a-signed-embed), you can pass that default value to the corresponding parameter name in the embedding URL. Note that:

- Parameter _names_ are lowercase.
- Parameter _values_ are case-sensitive (they must match your data).
- Spaces should be replaced by underscores.

For example, if your embedded dashboard has a filter called "Breakfast", and you want to set the default value to "Scrambled eggs":

```
your_embedding_url?breakfast=Scrambled_eggs
```

To specify default values for more than one filter, separate them with ampersands (&):

```
your_embedding_url?breakfast=Scrambled_eggs&lunch=Grilled_cheese
```

If the original dashboard's filter widget accepts multiple values (i.e., it's a [dropdown filter](../dashboards/filters.md#choosing-between-a-dropdown-or-autocomplete-for-your-filter), not a text box filter), you can set multiple default values:

```
your_embedding_url?breakfast=Scrambled_eggs&breakfast=Bacon
```

## Pre-filtering data in a signed embed

If you want to display filtered data in an embedded dashboard or SQL question, and _prevent_ people from viewing or changing that filter:

1. Go to your dashboard or SQL question. Make sure you've set up a [dashboard filter](../dashboards/filters.md) or [SQL variable](../questions/native-editor/sql-parameters.md).
2. Click on the **sharing icon** > **Embed this item in an application**.
3. Under **Parameters**, you'll find the names of your dashboard filters or SQL variables.
4. Select **Locked** for each parameter that should pre-filter your data.
5. Add values for the filter under **Preview locked parameters**.
6. Click **Publish** to save your changes.

**Locked** parameters will apply the selected filter values to your original dashboard or SQL question, but they won't be displayed as filter widgets on your embed. Locked parameters may also limit the values that are shown in your [embedded filter widgets](#adding-a-filter-widget-to-a-signed-embed).

You can use locked parameters to display filtered data based on attributes captured by your web server (such as a user's login). For more examples, see the [reference apps repo](https://github.com/metabase/embedding-reference-apps)

Note that you can only add filter values that match the filter type on the _original_ dashboard or SQL question. For example, if you have a text box filter on your original dashboard or SQL question, you'll only be able to add a single filter value to your locked parameter. If you want to provide multiple filter values to the parameter, you'll need to change the original filter to a [dropdown filter](../dashboards/filters.md#choosing-between-a-dropdown-or-autocomplete-for-your-filter) first.

## Hiding filter widgets from a signed embed

If you have a lot of **Editable** parameters (resulting in a lot of filter widgets), you can hide them from your signed embed by adding `hide_parameters` to your embedding URL. 

For example, if you want to hide a filter called "Breakfast" from your embedded dashboard:

```
your_embedding_url#hide_parameters=breakfast
```

You can hide multiple filter widgets by separating the parameter names with commas:

```
your_embedding_url#hide_parameters=breakfast,lunch
```

You can also simultaneously assign a parameter a default value _and_ hide its filter widget:

```
your_embedding_url?breakfast=Scrambled_eggs#hide_parameters=breakfast
```

## Customizing the appearance of a signed embed

You can change the appearance of an embedded item by adding parameters with the following values:

| Parameter name         | Possible values                               |
| ---------------------- | --------------------------------------------- |
| bordered               | true, false                                   |
| titled                 | true, false                                   |
| theme                  | null, transparent, night                      |
| font\*                 | [font name](../configuring-metabase/fonts.md) |
| hide_download_button\* | true, false                                   |

\* Available on paid plans.

You can preview the changes from your question or dashboard's [embedded appearance settings](./signed-embedding.md#customizing-the-appearance-of-signed-embeds).

For example, the following embedding URL will display an embedded item in dark mode, with its original title, and without a border:

```
your_embedding_url#theme=night&titled=true&bordered=false
```

## Further reading

- [Signed embedding documentation](./signed-embedding.md).
- [Strategies for delivering customer-facing analytics](https://www.metabase.com/learn/embedding/embedding-overview).
- [Publishing data visualizations to the web](https://www.metabase.com/learn/embedding/embedding-charts-and-dashboards).
