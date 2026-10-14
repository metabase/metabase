---
title: Data actions
summary: Write SQL actions that don't belong to a model, organize them in folders, and run them from Data Studio or a public form.
---

# Data actions

_Data Studio > Data actions_

Data actions are SQL actions that don't belong to a [model](../models.md). You write them in [Data Studio](../../data-studio.md), keep them in folders (like SQL snippets), run them from Data Studio, and share them as [public forms](./custom.md#make-public).

<!-- TODO screenshot: Data Studio > Data actions, the tree with one folder and one action in it -->

## How data actions differ from model actions

Actions that belong to a model live on the model's **Actions** tab and in the model's collection. Data actions live on the **Data actions** tab in Data Studio, which lists only actions that have no model.

Only [custom (SQL) actions](./custom.md) can be data actions. [Basic actions](./basic.md) always need a model.

When you add an action to a [dashboard button](../../../dashboards/actions.md), the action picker lists actions by model, so you won't find data actions there.

## Before you start

- **Turn on data actions for the database.** Only an admin can turn on the **Data actions** toggle. See [Enabling actions for a database](./introduction.md#enabling-actions-for-a-database). Actions are only available for PostgreSQL and MySQL.
- **Get native query permission.** To create or edit a data action, you need [native query editing](../../../permissions/data.md#query-builder-and-native-create-queries-permission) permission on the database.
- **Get access to Data Studio.** Data Studio is open to admins and people in the [Data Analysts](../../../people-and-groups/managing.md#data-analysts) group.

## Create a data action

1. Click the **grid** icon in the upper right and select **Data Studio**.
2. In the left sidebar, under **Library**, click **Data actions**.
3. Click **New** > **Action**.
4. Write your SQL. Each {% raw %}{{ variable }}{% endraw %} in the SQL becomes a field on the action's form. For examples, see [Example custom actions](./custom.md#example-custom-actions).
5. Click **Save**.
6. In the **Save your action** modal, enter a **Name** and a **Description**, and pick a **Folder**. Anyone who can view the folder can run the action.
7. Click **Save**.

## Edit a data action

To open a data action, go to **Data Studio** > **Data actions** and click the action. Each data action has four tabs: **Definition**, **Fields**, **Run**, and **Settings**.

### Definition

The **Definition** tab shows the action's SQL. To change the SQL, click **Edit definition**. You need edit access to the action and native query permission on its database.

### Fields

The **Fields** tab has one field for each {% raw %}{{ variable }}{% endraw %} in the SQL. Drag the fields to reorder the form. Click a field to set its details, like its **Field type**, **Input type**, **Placeholder**, **Default value**, and whether it's **Required**. To hide a field, turn off **Show field**: hidden fields use their default value. For the field types, see [Field types for action variables](./custom.md#field-types-for-action-variables).

<!-- TODO screenshot: the Fields tab of a data action with two fields, with the Field details panel open for one field -->

### Run

On the **Run** tab, under **Run this action**, click **Run**, then fill out the action's form.

If actions are turned off for the action's database, the **Run** button is disabled.

### Settings

On the **Settings** tab, you can:

- **Make the action public.** Under **Public sharing**, turn on **Make public** to get a **Public link**. Anyone with the link can fill out the form and run the action, without signing in. Only admins can make an action public, and [public sharing](../../../embedding/public-links.md) must be on. See [Make public](./custom.md#make-public).
- **Set a success message.** Under **Success message**, enter the message that the public form shows after the action runs. See [Set a success message](./custom.md#set-a-success-message).

## Organize data actions in folders

To create a folder, go to **Data Studio** > **Data actions** and click **New** > **Collection**.

To edit a folder, click the **three-dot** menu next to the folder and select **Edit folder details**.

To move a data action to another folder, open the action, click the **three-dot** menu next to its name, and select **Move**.

## Archive and unarchive data actions

To archive a data action, open the action, click the **three-dot** menu next to its name, and select **Archive**. Public forms that use the action will stop working.

To find archived data actions:

1. Go to **Data Studio** > **Data actions**.
2. Click the **three-dot** menu next to **Data actions** at the top of the tree, and select **View archived actions**.
3. To restore an action, click its **Unarchive action** icon.

## Data action permissions

- **To create a data action**, you need native query permission on the database, and edit access to the folder.
- **To run a data action**, you need view access to the action's folder. A data action that isn't in a folder uses the permissions of the **Data actions** root. Running a data action also needs actions turned on for its database.

### Set permissions on data action folders

{% include plans-blockquote.html feature="Data action folder permissions" %}

Admins can set permissions on a folder: click the **three-dot** menu next to the folder and select **Change permissions**. To set permissions on the **Data actions** root, click the **three-dot** menu next to **Data actions** at the top of the tree and select **Change permissions**.

Data action folder permissions work like [snippet folder permissions](../../../permissions/snippets.md).

## Data actions sync with the Library

If you [sync the Library to Git](../../semantic-layer/library.md#versioning-the-library) with [Remote sync](../../../installation-and-operation/remote-sync.md), Metabase syncs your data actions along with the rest of the Library.

## Further reading

- [Introduction to actions](./introduction.md)
- [Custom actions](./custom.md)
- [Data Studio](../../data-studio.md)
