---
title: Sharing answers
redirect_from:
  - /docs/latest/users-guide/06-sharing-answers
---

# Sharing answers

## How to save a question

Whenever you’ve arrived at an answer that you want to save for later, click the **Save** button in the top right of the screen. This will also save the visualization option you’ve chosen for your answer.

![Save button](../images/save-button.png)

A modal will appear, prompting you to give your question a name and description, and to pick which [collection][collections] to save it in. Note that your administrator might have set things up so that you're only allowed to [save questions in certain collection][collection-permissions], but you can always save things in your Personal Collection. After saving your question, you'll be asked if you want to add it to a new or existing dashboard.

Now, whenever you want to refer to your question again you can find it by searching for it in the search bar at the top of Metabase, or by navigating to the collection where you saved it.

You can also convert a question to a [model][model].

## Downloading your question's results

You can export the results of a question by clicking on the **Download arrow** (a down arrow in a cloud) in the lower right of the screen, or from a chart on a dashboard by clicking on the **...** in the upper right or a dashboard card.

Results can be downloaded as:

- .csv
- .xlsx
- .json

The maximum download size is 1 million rows. Exported .xlsx files preserve the formatting defined in the question: date and currency formats are kept throughout, as well as column ordering and visibility. Files names for the exported question will include a slug of the question title, so you can easily distinguish files when exporting multiple questions.

## Exporting charts as images

You can download most charts (excluding table and number charts) as images in .png format.

- From a question: click on the **download arrow** (a down arrow in a cloud in the bottom right) and select .png.
- From a dashboard card: click on the **...** in the upper right of the card and select .png.

You can't download the image of a dashboard, but you can set up a [dashboard subscription](../../dashboards/subscriptions.md).

## Editing your question

Once you save your question, a down arrow will appear to the right of the question's title. Clicking on the down arrow will bring up the **Question detail sidebar**, which gives you some options:

![Question detail sidebar](../images/question-details-sidebar.png)

- **Edit details** (Pencil icon). Change the title of the question, and add some description for context. Adding a description will also make the question easier to find using the search bar. You can also select more options to [cache the results of the question](#caching-results).
- **Add to dashbboard** (Dashboard icon with plus symbol). See [dashboards][dashboards].
- **Move** (Document icon with right arrow). Relocate the question to a different [collection][collections].
- **Turn this into a model**. See [Models][model].
- **Duplicate** (Square with little square). Create a copy of the question. Keep in mind that whenever you start editing a saved question, Metabase will create a copy of the question. You can either save your edits as a new question, or overwrite the original saved question.
- **Archive** (Folder with down arrow). See [Archiving items][archiving-items].
- **Bookmark** Save the question as a favorite, which will show up in the bookmarks section of your navigation sidebar. See [Bookmarks](../../exploration-and-organization/exploration.md#bookmarks).

## Caching question results

{% include plans-blockquote.html feature="Caching question results" %}

See [Caching per question](../../configuring-metabase/caching.md#ttl-per-question).

## Sharing questions with public links

If your Metabase administrator has enabled [public sharing](../../questions/sharing/public-links.md) on a saved question or dashboard, you can go to that question or dashboard and click on the sharing icon to find its public links. Public links can be viewed by anyone, even if they don't have access to Metabase. You can also use the public embedding code to embed your question or dashboard in a simple web page or blog post.

![Share icon](../images/share-icon.png)

To share a question, click on the arrow pointing up and to the right in the bottom right of the question.

## Setting up alerts

You can set up questions to run periodically and notify you if the results are interesting. Check out [Alerts][alerts].

[alerts]: ./alerts.md
[archiving-items]: ../../exploration-and-organization/history.md#archiving-items
[caching]: ../../configuring-metabase/caching.md
[collections]: ../../exploration-and-organization/collections.md
[collection-permissions]: ../../permissions/collections.md
[dashboards]: ../../dashboards/start.md
[model]: ../../data-modeling/models.md
