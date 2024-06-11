---
title: Admin tools
redirect_from:
  - /docs/latest/enterprise-guide/tools
---

# Admin tools

The Admin **Tools** tab contains features for troubleshooting. To get to the Admin tools sections, go to the top right of the screen and click on the **gear** icon > **Admin settings** > **Tools**.

## Question error logs

{% include plans-blockquote.html feature="Question error logs" %}

Metabase will list the questions that returned errors when last run, including the:

- Error message,
- Database that returned the error,
- Collection that houses the question that errored.

You can select and rerun multiple questions at a time while you troubleshoot to see whether you've resolved their errors.

## Model caching logs

Here you can view the:

- [Models](../data-modeling/models.md) being persisted
- The status of the last model query refresh
- When the model was last refreshed
- And who created the persisted model

You can also click the refresh icon to rerun the model's query to update its results.
