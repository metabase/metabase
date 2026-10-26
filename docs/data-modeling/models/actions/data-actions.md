---
title: Data actions
summary: Write SQL actions that don't belong to a model, organize them in folders, and run them from Data Studio or a public form.
---

# Data actions

_Data Studio > Data actions_

Data actions are [custom actions](./custom.md) that don't belong to a [model](../models.md). You write them in [Data Studio](../../data-studio.md), keep them in folders (like SQL snippets), run them from Data Studio, and share them as [public forms](./custom.md#make-public). If you [sync the Library](../../semantic-layer/library.md#versioning-the-library) with [Remote sync](../../../installation-and-operation/remote-sync.md), your data actions sync with it.

You can't add data actions to [dashboard buttons](../../../dashboards/actions.md): the action picker lists actions by model.

<!-- TODO screenshot: Data Studio > Data actions, the tree with one folder and one action in it -->

## Create a data action

Only admins can create data actions. The **New** button only shows up if an admin has [turned on data actions](./introduction.md#enabling-actions-for-a-database) for at least one database. Actions only work on PostgreSQL and MySQL.

1. Go to [Data Studio](../../data-studio.md#get-to-data-studio) > **Data actions**.
2. Click **New** > **Action**.
3. Write your SQL. Each {% raw %}{{ variable }}{% endraw %} in the SQL becomes a field on the action's form. For examples, see [Example custom actions](./custom.md#example-custom-actions).
4. Click **Save**, enter a **Name**, pick a **Folder**, and click **Save** again. Anyone who can view the folder can run the action.

## Edit and run a data action

Go to **Data Studio** > **Data actions** and click an action. Each action has four tabs:

- **Definition**: The action's SQL. To change it, click **Edit definition**.
- **Fields**: One field for each {% raw %}{{ variable }}{% endraw %} in the SQL. The options are the same as for [custom actions](./custom.md#field-types-for-action-variables). If you turn off **Show field**, the action uses the field's default value.
- **Run**: Click **Run** and fill out the form.
- **Settings**: Turn on **Make public** to get a public link to the action's form, and set a **Success message**. Only admins can make an action public, and [public sharing](../../../embedding/public-links.md) must be on.

## Organize and archive data actions

Only admins can create folders, and move, archive, or unarchive data actions.

- **Create a folder**: Click **New** > **Collection**.
- **Move or archive an action**: Open the action, click the **three-dot** menu next to its name, and select **Move** or **Archive**. Public forms that use an archived action stop working.
- **Unarchive an action**: Click the **three-dot** menu next to **Data actions** at the top of the tree, select **View archived actions**, and click the action's **Unarchive action** icon.

## Data action permissions

Only admins can create, edit, move, archive, or delete data actions. You can't give other groups [Curate access](../../../permissions/collections.md#collection-permission-levels) to data actions folders.

## Further reading

- [Introduction to actions](./introduction.md)
- [Custom actions](./custom.md)
- [Data Studio](../../data-studio.md)
