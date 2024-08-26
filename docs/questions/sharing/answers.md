---
title: Sharing answers
redirect_from:
  - /docs/latest/users-guide/06-sharing-answers
---

# Sharing answers

## How to save a question

Whenever you’ve arrived at an answer that you want to save for later, click the **Save** button in the top right of the screen. This will also save the visualization option you’ve chosen for your answer.

![Save button](../images/save-button.png)

A modal will appear, prompting you to give your question a name and description, and to pick which [collection](../../exploration-and-organization/collections.md) to save the question in. Note that your administrator might have set things up so that you're only allowed to [save questions in certain collection](../../permissions/collections.md), but you can always save items in your Personal Collection. After saving your question, you'll be asked if you want to add the question to a new or existing dashboard.

Now, whenever you want to refer to your question again you can find it by searching for it in the search bar at the top of Metabase, or by navigating to the collection where you saved it.

## Downloading your question's results

You can export the results of a question by clicking on the **download arrow** (a down arrow in a cloud) in the lower right of the screen, or from a chart on a dashboard by clicking on the **three dot** (...) menu in the upper right or a dashboard card.

Results can be downloaded as:

- .csv
- .xlsx
- .json

The maximum download size is 1 million rows. Exported .xlsx files preserve the formatting defined in the question: date and currency formats are kept throughout, as well as column ordering and visibility. Files names for the exported question will include a slug of the question title, so you can easily distinguish files when exporting multiple questions.

## Exporting charts as images

You can download most charts (excluding table and number charts) as images in .png format.

- From a question: click on the **download arrow** (a down arrow in a cloud in the bottom right) and select .png.
- From a dashboard card: click on the **three dot** (...) menu in the upper right of the card and select .png.

You can't download the image of a dashboard, but you can set up a [dashboard subscription](../../dashboards/subscriptions.md).

## Editing your question

Click into the question's title to edit the name of your question.

Open the **three dot** (...) menu to:

- [Verify](../../exploration-and-organization/exploration.md#verified-items) this question
- Add to [dashboard](../../dashboards/start.md)
- Move to another [collection](../../exploration-and-organization/collections.md)
- Turn into a [model](../../data-modeling/models.md)
- Duplicate
- [Archive](../../exploration-and-organization/history.md)

Click the **info** icon to:

- Add a description
- Edit the [cache duration](../../configuring-metabase/caching.md#question-caching-policy)\*
- View [revision history](../../exploration-and-organization/history.md)

\* Available on [Pro and Enterprise plans](https://www.metabase.com/pricing/).

## Bookmark a question

Click the **bookmark** icon to pin a question to your Metabase sidebar. See [Bookmarks](../../exploration-and-organization/exploration.md#bookmarks).

## Building on saved questions

To use a saved question as the basis for another question, you can:

- Open the **three dot** (...) menu > **Turn into a [model](../../data-modeling/models.md)**.
- [Create a new question](../query-builder/introduction.md#creating-a-new-question-with-the-query-builder) and search for your saved question under **Pick your starting data**.
- [Refer to the question in a SQL query](../native-editor/referencing-saved-questions-in-queries.md).

## Caching question results

{% include plans-blockquote.html feature="Caching question results" %}

See [Caching per question](../../configuring-metabase/caching.md#question-caching-policy).

## Sharing questions with public links

If your Metabase administrator has enabled [public sharing](../../questions/sharing/public-links.md) on a saved question or dashboard, you can go to that question or dashboard and click on the sharing icon to find its public links. Public links can be viewed by anyone, even if they don't have access to Metabase. You can also use the public embedding code to embed your question or dashboard in a simple web page or blog post.

![Share icon](../images/share-icon.png)

To share a question, click on the arrow pointing up and to the right in the bottom right of the question.

## Setting up alerts

You can set up questions to run periodically and notify you if the results are interesting. Check out [Alerts](./alerts.md).
