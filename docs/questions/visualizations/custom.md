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

This page covers how to enable the feature, upload and manage plugins, and use the new chart type in questions and dashboards.

To build a plugin, see [Building custom visualizations](../../developers-guide/custom-visualizations.md).

## Enabling custom visualizations

To turn on custom visualizations, go to **Admin** > **Settings** > **Custom visualizations** and click **Enable custom visualizations**.

You can also enable (or disable) custom visualizations with the [`MB_CUSTOM_VIZ_ENABLED`](../../configuring-metabase/environment-variables.md#mb_custom_viz_enabled) environment variable, or with the `custom-viz-enabled` key in a [configuration file](../../configuring-metabase/config-file.md).

## Only add plugins you trust

A custom visualization plugin runs JavaScript in your Metabase. Only upload plugins from sources you trust (like plugins you've built yourself, or have vetted).

Metabase runs custom visualizations in a sandbox to limit what a plugin can do:

- A plugin renders inside an isolated container and can't reach the rest of the Metabase app.
- A plugin can't call Metabase's APIs or make network requests.

While this sandboxing limits the damage a plugin can do, you still need to review the code.

## Adding a custom visualization

Once you've built the custom visualizations](../../developers-guide/custom-visualizations.md):

1. In Metabase, go to **Admin** > **Settings** > **Custom visualizations** > **Manage visualizations**.
2. Click **Add** and drag the `.tgz` file into the upload area (or click to browse for it).
3. Click **Add visualization**.

- Bundles must be smaller than 5 MB.
- Each plugin lists the Metabase versions it supports (for example, "Requires Metabase >=1.62"). If your Metabase is older than the plugin requires, Metabase rejects the upload.
- The **Manage visualizations** page shows each plugin's icon, name, the first eight characters of the bundle's hash, and its required Metabase version range, so you can tell which version is installed.

## Managing custom visualizations

_Admin > Settings > Custom visualizations > Manage visualizations_

- **Disable a visualization.** Any question or dashboard card that used the visualization falls back to the default visualization for that query's results. If you re-enable the plugin, those cards will go back to using the custom visualization.
- **Replace a bundle.** Upload a new `.tgz` to ship an updated version of a plugin. The new bundle's manifest `name` _must_ match the existing plugin's identifier, so questions that already use the visualization keep working.
- **Remove a visualization.** Cards that used the custom viz fall back to the default visualization.

## Using a custom visualization

On a question or dashboard card, open the visualization sidebar (the **Visualization** button), and look for the **Custom visualizations** section. Pick your visualization the same way you'd pick a line chart or a table.

If a custom visualization can't render the current query results (for example, the query is missing a column the visualization needs), Metabase shows the error message from the plugin so you can adjust the query or pick a different chart.

Custom visualizations behave like built-in charts in most places:

- **Settings.** Click the **gear** icon in the visualization sidebar to change the visualization's settings. Plugins can put settings under the **Data** and **Display** tabs, just like built-in charts.
- **Dark mode.** Plugins that use Metabase's colors adapt to [dark mode](../../people-and-groups/account-settings.md#theme) automatically.
- **Icons.** A custom visualization shows its own icon in the visualization picker, and questions that use it show that icon in collections and bookmarks.

## Exports and limitations

- **PDF exports** of dashboards and questions include custom visualizations.
- **PNG exports** include a custom visualization only if its developer turned on PNG export for that plugin. PNG export is off by default.
- **Static visualizations don't.** Dashboard subscriptions sent by [email](../../dashboards/subscriptions.md) and Slack render static images, and they fall back to a default visualization for cards that use a custom visualization.

## Further reading

- [Building custom visualizations](../../developers-guide/custom-visualizations.md)
- [Visualization overview](./visualizing-results.md)
- [Appearance](../../configuring-metabase/appearance.md)
