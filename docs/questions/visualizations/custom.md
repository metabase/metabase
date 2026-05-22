---
title: Custom visualizations
summary: Add your own chart types to Metabase by uploading visualization plugins built with the Custom Visualizations SDK.
---

# Custom visualizations

{% include plans-blockquote.html feature="Custom visualizations" %}

You can build new chart types and add them to Metabase.

1. Write a visualization plugin with the Custom Visualizations SDK.
2. Package it as a bundle (a `.tgz` file).
3. Upload it to your Metabase.

This page covers how to enable the feature, upload and manage plugins, and use the new chart type in questions and dashboards. To build a plugin, see [Building custom visualizations](../../developers-guide/custom-visualizations.md).

## Enabling custom visualizations

To turn on custom visualizations, go to **Admin** > **Settings** > **Custom visualizations** and click **Enable custom visualizations**.

You can also enable custom visualizations with the [`MB_CUSTOM_VIZ_ENABLED`](../../configuring-metabase/environment-variables.md#mb_custom_viz_enabled) environment variable, or with the `custom-viz-enabled` key in a [configuration file](../../configuring-metabase/config-file.md).

## Only add plugins you trust

A custom visualization plugin runs JavaScript in your Metabase. Only upload plugins from sources you trust (like plugins you've built yourself, or have vetted).

Metabase runs custom visualizations in a sandbox to limit what a plugin can do:

- A plugin renders inside an isolated container and can't reach the rest of the Metabase app.
- A plugin can't call Metabase's APIs or make network requests.

While this sandboxing limits the damage a plugin can do, you still need to review the code.

## Adding a custom visualization

1. Build the bundle by running `npm run build` in your plugin project. This produces a `.tgz` file (see [Building custom visualizations](../../developers-guide/custom-visualizations.md)).
2. In Metabase, go to **Admin** > **Settings** > **Custom visualizations** > **Manage visualizations**.
3. Click **Add** and drag the `.tgz` file into the upload area (or click to browse for it).
4. Click **Add visualization**.

- Bundles must be smaller than 5 MB.
- Each plugin lists the Metabase versions it supports (for example, "Requires Metabase >=1.60"). If your Metabase is older than the plugin requires, the plugin won't load.
- The **Manage visualizations** page shows each plugin's icon, name, the first eight characters of its bundle hash, and its required Metabase version range, so you can tell which version is installed.

## Managing custom visualizations

From **Admin** > **Settings** > **Custom visualizations** > **Manage visualizations**, you can:

- **Disable a visualization.** Any question or dashboard card that used the visualization falls back to the default visualization for that query's results. If you re-enable the plugin, those cards will go back to using it.
- **Replace a bundle.** Upload a new `.tgz` to ship an updated version of a plugin. The new bundle's manifest `name` has to match the existing plugin's identifier, so questions that already use the visualization keep working.
- **Remove a visualization.** Cards that used the custom viz fall back to the default visualization.

### Turn off custom visualizations for the whole instance

If you want to make sure custom visualizations stay off, set the [`MB_CUSTOM_VIZ_ENABLED`](../../configuring-metabase/environment-variables.md#mb_custom_viz_enabled) environment variable to `false`. Settings configured by an environment variable can't be changed in the Admin settings, so this acts as a kill switch that disables the feature and hides the controls for it.

## Using a custom visualization

On a question or dashboard card, open the visualization sidebar (the **Visualization** button), and look for the **Custom visualizations** section. Pick your visualization the same way you'd pick a line chart or a table.

If a custom visualization can't render the current query results (for example, the query is missing a column the visualization needs), Metabase shows the error message from the plugin so you can adjust the query or pick a different chart.

Custom visualizations behave like built-in charts in most places:

- **Settings.** Click the **gear** icon in the visualization sidebar to change the visualization's settings. Plugins can put settings under the **Data** and **Display** tabs, just like built-in charts.
- **Dark mode.** Plugins that use Metabase's colors adapt to [dark mode](../../people-and-groups/account-settings.md#theme) automatically.
- **Icons.** A custom visualization shows its own icon in the visualization picker, and questions that use it show that icon in collections and bookmarks.

## Exports and limitations

- **PDF and PNG exports** of dashboards and questions include custom visualizations.
- **Static visualizations don't.** Dashboard subscriptions sent by [email](../../dashboards/subscriptions.md) and Slack render static images, and they fall back to a default visualization for cards that use a custom visualization.

## Developing custom visualizations

To build a plugin — scaffolding a project, writing the visualization, developing against a running Metabase with hot reload, and packaging a bundle for upload — see [Building custom visualizations](../../developers-guide/custom-visualizations.md).

## Further reading

- [Building custom visualizations](../../developers-guide/custom-visualizations.md)
- [Visualization overview](./visualizing-results.md)
- [Appearance](../../configuring-metabase/appearance.md)
