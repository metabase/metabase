---
title: Data actions
summary: Create actions without a model, from a SQL query or a table, organize them in folders, and run them from Data Studio or a public form.
---

# Data actions

_Data Studio > Data actions_

Data actions are [actions](./introduction.md) that don't belong to a [model](../models.md). Admins create them in [Data Studio](../../data-studio.md) from a SQL query, like a [custom action](./custom.md), or from a table, like a [basic action](./basic.md). You keep data actions in folders (like SQL snippets), run them from Data Studio, and share them as [public forms](./custom.md#make-public). If you [sync the Library](../../semantic-layer/library.md#versioning-the-library) with [Remote sync](../../../installation-and-operation/remote-sync.md), your data actions sync with it.

You can't add data actions to [dashboard buttons](../../../dashboards/actions.md).

## Create a data action

Only admins can create data actions. The **New** button only shows up if an admin has [turned on data actions](./introduction.md#enabling-actions-for-a-database) for at least one database.

### Create a data action from a SQL query

1. Go to [Data Studio](../../data-studio.md#get-to-data-studio) > **Data actions**.
2. Click **New** > **SQL query**.
3. Write your SQL. Each {% raw %}{{ variable }}{% endraw %} in the SQL becomes a field on the action's form. For examples, see [Example custom actions](./custom.md#example-custom-actions).
4. Click **Save**, enter a **Name**, pick a **Folder**, and click **Save** again.

### Create a data action from a table

A table action inserts, updates, or deletes one row, without any SQL. The table must have exactly one primary key.

1. Go to [Data Studio](../../data-studio.md#get-to-data-studio) > **Data actions**.
2. Click **New** > **Table**, and pick a table. The picker only lists tables in databases with data actions turned on.
3. Under **Operation**, pick **Insert** to add a row, **Update** to change a row, or **Delete** to remove a row. Update and Delete find the row by its primary key, and Update keeps the current value of any field you leave empty.
4. Click **Save**, enter a **Name** (Metabase suggests one, like "Insert Orders"), pick a **Folder**, and click **Save** again.

## Edit and run a data action

Go to **Data Studio** > **Data actions** and click an action. Each action has these tabs:

- **Definition**: For a SQL action, the action's SQL. To change it, click **Edit definition**. For a table action, the table and the operation. To change them, click **Change table** or pick another **Operation**.
- **Fields**: The fields on the action's form. A SQL action has one field for each {% raw %}{{ variable }}{% endraw %} in the SQL. If you turn off **Show field**, the action uses the field's default value. A table action has one field for each column that it writes (for Delete, only the primary key). You can only show or hide these fields.
- **Run**: Click **Run** and fill out the form.
- **Settings**: Turn on **Make public** to get a public link to the action's form, and set a **Success message**. Only admins can make an action public, and [public sharing](../../../embedding/public-links.md) must be on.
- **Dependencies**\*: The action's [dependency graph](../../tools/graph.md).

\* Available on [Pro and Enterprise plans](https://www.metabase.com/pricing).

## Organize and archive data actions

- **Create a folder**: Click **New** > **Collection**.
- **Move or archive an action**: Open the action, click the **three-dot** menu next to its name, and select **Move** or **Archive**. Public forms that use an archived action stop working until you unarchive the action.
- **Archive a folder**: Click the **three-dot** menu next to the folder, and select **Archive**. Metabase archives the folder's actions with it.
- **Unarchive an action or folder**: Click the **three-dot** menu next to the **New** button, select **View archived actions**, and click the **Unarchive action** or **Unarchive folder** icon. Unarchiving a folder brings back the actions that Metabase archived with it, but not actions that someone archived on their own.

## Data action permissions

Anyone who can view a data action's folder can run the action. In Metabase, people run data actions from Data Studio, so they also need [access to Data Studio](../../data-studio.md#permissions-for-data-studio). To let other people run a data action, make it public (see **Settings** in [Edit and run a data action](#edit-and-run-a-data-action)).

Only admins can create, edit, move, archive, or unarchive data actions and their folders. You can't give other groups [Curate access](../../../permissions/collections.md#collection-permission-levels) to data actions folders.

## Further reading

- [Introduction to actions](./introduction.md)
- [Basic actions](./basic.md)
- [Custom actions](./custom.md)
- [Data Studio](../../data-studio.md)
