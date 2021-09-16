# Saving and editing your questions and answers

## How to save a question

Whenever you’ve arrived at an answer that you want to save for later, click the **Save** button in the top right of the screen. This will also save the visualization option you’ve chosen for your answer.

![Save button](images/sharing-answers/save-button.png)

A pop-up box will appear, prompting you to give your question a name and description, and to pick which [collection](#collection) to save it in. Note that your administrator might have set things up so that you're only allowed to [save questions in certain collection](#collection-permissions), but you can always save things in your Personal Collection. After saving your question, you'll be asked if you want to add it to a new or existing dashboard.

Now, whenever you want to refer to your question again you can find it by searching for it in the search bar at the top of Metabase, or by navigating to the collection where you saved it.

## Downloading Your Results

You can download or export the results of a question by clicking on the Download arrow in the lower right of the screen. Results can be downloaded into .csv, .xlsx, or .json files. The maximum download size is 1 million rows. The exports preserve the formatting you've defined in the question. Things like date and currency formats are kept throughout, as well as column ordering and visibility. You'll even get hyperlinks in XLSX. Files names for the exported question will include a slug of the question title.

## Editing your question

Once you save your question, a down arrow will appear to the right of the question's title. Clicking on the down arrow will bring up the **Question detail sidebar**, which gives you some options:

![Question detail sidebar](images/sharing-answers/question-details-sidebar.png)

- **Edit details** (Pencil icon). Change the title of the question, and add some description for context. Adding a description will also make the question easier to find using the search bar.
- **Add to dashbboard** (Dashboard icon with plus symbol). See [dashboards][dashboards].
- **Move** (Document icon with right arrow). Relocate the question to a different [collection](#collections).
- **Duplicate** (Square with little square). Create a copy of the question. Keep in mind that whenever you start editing a saved question, Metabase will create a copy of the question. You can either save your edits as a new question, or overwrite the original saved question.
- **Archive** (Folder with down arrow). See [Archiving items](#archiving-items).

### Question moderation

Administrators can **Verify** a question by clicking on the **Verify checkmark** in the **Moderation** section of the **Question detail sidebar**. Verifying a question is a simple way for an administrator to signal that they've reviewed the question and deemed it to be trustworthy. That is: the question is filtering the right columns, or summarizing the right metrics, and querying records from the right tables. Once verified, the question will have a verified icon next to the question's title.

![Verified icon](images/sharing-answers/verified-icon.png)

If someone modifies a verified question, the question will lose its verified status, and an administrator will need to review and verify the question again to restore its verified status.

### Question history

You can see the history of a question, including edits and verifications, in the **History** section of the **Question detail sidebar**.

Below each edit entry in the timeline, you can click on **Revert** to reinstate the question at the time of the edit.

## Sharing questions with public links

If your Metabase administrator has enabled [public sharing](../administration-guide/12-public-links.md) on a saved question or dashboard, you can go to that question or dashboard and click on the sharing icon to find its public links. Public links can be viewed by anyone, even if they don't have access to Metabase. You can also use the public embedding code to embed your question or dashboard in a simple web page or blog post.

![Share icon](images/sharing-answers/share-icon.png)

To share a question, click on the arrow pointing up and to the right in the bottom right of the question.

## Setting up alerts

You can set up questions to run periodically and notify you if the results are interesting. Check out [Alerts][alerts].

---

## Next: collections

Next, we'll learn about how to organize our questions in [collections][collections].

[alerts]: 15-alerts.md
[collections]: collections.md
[dashboards]: 07-dashboards.md
