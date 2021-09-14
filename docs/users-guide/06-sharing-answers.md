# Sharing and organizing your questions and answers

## How to save a question

Whenever you’ve arrived at an answer that you want to save for later, click the **SAVE** button in the top right of the screen. This will also save the visualization option you’ve chosen for your answer.

![Save button](images/sharing-answers/save-button.png)

A pop-up box will appear, prompting you to give your question a name and description, and to pick which collection to save it in. Note that your administrator might have set things up so that you're only allowed to save questions in certain collections, but you can always save things in your Personal Collection. After saving your question, you'll be asked if you want to add it to a new or existing dashboard.

Now, whenever you want to refer to your question again you can find it by searching for it in the search bar at the top of Metabase, or by navigating to the collection where you saved it.

## Editing your question

Once you save your question, a down arrow will appear to the right of the question's title. Clicking on it will bring up the __Question detail sidebar__, which gives you some options:

![Question detail sidebar](images/sharing-answers/question-details-sidebar.png)

- __Edit details__ (Pencil icon). Change the title of the question, and add some description for context. Adding a description will also make the question easier to find using the search bar.
- __Add to dashbboard__ (Dashboard icon with plus symbol). See [dashboards][dashboards].
- __Move__ (Document icon with right arrow). Relocate the question to a different [collection](#collections).
- __Duplicate__ (Square with little square). Create a copy of the question. Keep in mind that whenever you start editing a saved question, Metabase will create a copy of the question. You can either save your edits as a new question, or overwrite the original saved question.
- __Archive__ (Folder with down arrow). See [Archiving items](#archiving-items).

## Moderation

Administrators can __Verify__ a question by clicking on the __Verify checkmark__ in the __Moderation__ section of the __Question detail sidebar__. Verifying a question is a simple way for an administrator to signal that they've reviewed the question and deemed it to be trustworthy. That is: the question is filtering the right columns, or summarizing the right metrics, and querying records from the right tables. Once verified, the question will have a verified question next to the question's title.

![Verified question](images/sharing-answers/verified-icon.png)

## History

You can see the history of a question, including edits and verification, in the __History__ section of the __Question detail sidebar__.

## Sharing questions with public links

If your Metabase administrator has enabled [public sharing](../administration-guide/12-public-links.md) on a saved question or dashboard, you can go to that question or dashboard and click on the sharing icon to find its public links. Public links can be viewed by anyone, even if they don't have access to Metabase. You can also use the public embedding code to embed your question or dashboard in a simple web page or blog post.

![Share icon](images/sharing-answers/share-icon.png)

To share a question, click on the arrow pointing up and to the right in the bottom right of the question.

## Organizing and finding your saved questions

After your team has been using Metabase for a while, you’ll probably end up with lots of saved questions. Metabase has several ways to help you organize things and find what you’re looking for.

![Our analytics](images/sharing-answers/our-analytics-page.png)

### Collections

Collections are the main way to organize questions, as well as dashboards and pulses. [Administrators can give you different kinds of access](../administration-guide/06-collections.md) to each collection:

- **View access:** you can see the collection and its contents, but you can't modify anything or put anything new into the collection.
- **Curate access:** you can edit, move, or archive the collection and its contents. You can also move or save new things in it and create new collections inside of it, and can also pin items in the collection to the top of the screen. Only administrators can edit permissions for collections, however.
- **No access:** you can't see the collection or its contents. If you have access to a dashboard, but it contains questions that are saved in a collection you don't have access to, those questions will show a permissions notification instead of the chart or table.

### Your personal collection

In addition to the collections you and your teammates have made, you'll also always have your own personal collection that only you and administrators can see. To find it, click on the "browse all items" button on the homepage and click on "my personal collection" in the list of collections.

You can use your personal collection as a scratch space to put experiments and explorations that you don't think would be particularly interesting to the rest of your team, or as a work-in-progress space where you can work on things and then move them to a shared place once they're ready.

### Pinned items

![Pins](images/sharing-answers/pinned-items.png)

In each collection, you can pin important or useful dashboards or questions to make them stick to the top of the screen. Pinned items will also be displayed as large cards to make them stand out well. If you have Curate permissions for a collection, you can pin and un-pin things, and drag and drop pins to change their order.

Any dashboards that are pinned in the main "Our analytics" collection will also show up on the homepage.

### Search

![Search results](./images/sharing-answers/search-results.gif)

Use the search bar to find dashboards, questions, collections, and pulses. You can select from the typeahead's dropdown results, or hit enter to view a search results page. You can also activate the search bar from anywhere by pressing the `/` key.

Searches take into account items’ titles, descriptions, and other metadata — you can even search the contents of your SQL queries. For example, you can search for things like `SELECT escape_pod FROM mothership` and find that one question you worked on six months ago. The results will display an item’s description, which collection it’s saved in, what kind of object it is, and whether it’s pinned. Note that you'll only ever see items in collections you have permission to view.

![Search results](./images/sharing-answers/search-results.png)

### Moving items from collection to collection

To move a question, dashboard, or pulse into a collection, or from one collection to another, just click and drag it onto the collection where you want it to go. You can also click on the `…` menu to the right of the question and pick the Move action. If you're trying to move several things at once, click on the items' icons to select them, then click the Move action that pops up at the bottom of the screen.

![Selecting questions](images/sharing-answers/question-checkbox.png)

Note that you have to have Curate permission for the collection that you're moving a question into _and_ the collection you're moving the question out of.

### Archiving items

Sometimes questions outlive their usefulness and need to be sent to Question Heaven. To archive a question or dashboard, just click on the `…` menu that appears on the far right when you hover over a question and pick the Archive action. You'll only see that option if you have "curate" permission for the current collection. You can also archive multiple items at once, the same way as you move multiple items. Note that archiving a question removes it from all dashboards or Pulses where it appears, so be careful!

You can also archive _collections_ if you have curate permissions for the collection you're trying to archive, the collection _it's_ inside of, as well as any and all collections inside of _it_. Archiving a collection archives all of its contents as well.

If you have second thoughts and want to bring an archived item back, you can see all your archived questions from the archive; click the menu icon in the top-right of any collection page to get to the archive. To unarchive a question, hover over it and click the unarchive icon that appears on the far right.

---

## Next: creating dashboards

Next, we'll learn about [creating dashboards and adding questions to them](07-dashboards.md).


[dashboards]: 07-dashboards.md