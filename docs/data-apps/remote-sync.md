---
title: Ship data apps with Remote Sync
summary: Push data apps from your development Metabase to Git, and pull them into production with Remote Sync.
---

# Ship data apps with Remote Sync

{% include plans-blockquote.html feature="Data apps" is_plural=true %}

When [Remote Sync](../installation-and-operation/remote-sync.md) is on, it always syncs your data apps.

## Ship an app to production

1. On your development Metabase (in Read-write mode), [push your changes](../installation-and-operation/remote-sync.md#pushing-changes-to-git).
2. On your production Metabase (in Read-only mode), [pull the changes](../installation-and-operation/remote-sync.md#pulling-changes-from-git).
3. On your production Metabase, [add groups](./manage.md#choose-who-can-open-an-app) to the app.

Remote Sync doesn't sync an app's status (live or draft) or its group access, so each Metabase keeps its own. A new app starts live on your production Metabase, and only admins can open it until you add groups there.

### If a pull fails

- **A data app named "`<slug>`" already exists on this instance**: Another app on that Metabase already uses the slug. Give the app in the repository another slug, or switch that Metabase to Read-write mode and [delete the other app](./manage.md#delete-a-data-app).
- **Bundle file "`<path>`" not found**: The app's bundle isn't in the repository at the path that the app's manifest names.

## What you can change in Read-only mode

On a Metabase in Read-only mode, pulls are the only way to change an app. You can't create, edit, or delete apps, upload bundles, or edit an app's collection. A pull deletes an app when the app's files are gone from the repository. You can still make an app live or a draft, and choose its groups.

## What syncs with a data app

Remote Sync syncs the app's manifest, its bundle, and its collection with its questions and actions. You can't sync an app's collection on its own: the collection syncs with its app. In your repository:

- `data_apps/<slug>/data_app.yaml` is the app's manifest.
- `data_apps/<slug>/` also holds the app's bundle.
- `collections/data_apps/` holds the app's collection.

## Keep an app's source code in your repository

When you start your agent in a local clone of your Remote Sync repository, the agent puts the app's source code in `data_apps/<slug>/`, next to the manifest and the bundle. Pushes from Metabase don't change your source code. Don't edit the manifest or the bundle by hand. The template's `.gitignore` keeps `node_modules/`, `build/`, and `.env.local` out of your repository.

To commit the source code, ask your agent. The agent pushes your changes from Metabase, pulls the branch that Metabase pushed to, and commits and pushes the source code. Then it pulls the changes into Metabase, so that Metabase's next push doesn't conflict with the commit.
