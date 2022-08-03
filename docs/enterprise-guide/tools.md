---
title: Admin tools
---

# Admin tools

{% include plans-blockquote.html features="Admin tools" %}

The Admin **Tools** tab contains features for troubleshooting. To get to the Admin tools sections, go to the top right of the screen and click on the **gear** icon > **Admin settings** > **Tools**.

## Questions that errored when last run

Metabase will list the questions that returned errors, including the:

- Error message,
- Database that returned the error,
- Collection that houses the question that errored.

You can select and rerun multiple questions at a time while you troubleshoot to see whether you've resolved their errors.

## Model caching logs

Here you can view the:

- [Models](../users-guide/models.md) being cached,
- The status of the last caching query,
- When the model was last cached,
- And who created the cache.

You can also click the refresh icon to rerun the model's query to update its cache.
