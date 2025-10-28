---
title: Remote sync
description: Version control your dashboards, questions, and models with Git. Sync content between development and production instances automatically.
---

# Remote sync

{% include plans-blockquote.html feature="Remote sync" %}

## Overview

Remote Sync lets you develop analytics content in a development Metabase and automatically deploy it to a read-only production instance through Git.

You work with Remote Sync through special collections called "synced collections". Content in these collections is automatically versioned and can be pushed to or pulled from your Git repository directly from the Metabase UI.

### Key concepts

**Development and Production modes**: Remote Sync has two configuration modes that determine how a Metabase instance interacts with your Git repository:

- **Development mode**: For creating and editing content. You can push changes to Git, pull changes from others, create branches, and work on feature branches. Multiple Metabase instances can be in Development mode, each working on different branches.
- **Production mode**: For serving approved, read-only content to users. Production instances only pull changes from Git (typically from your main branch) and don't allow direct editing of synced content. You can set up auto-sync to automatically pull approved changes every five minutes.

**Synced collections**: Special collections that are tracked in Git. When you connect a Metabase instance in Development mode, it creates a "Library" collection by default. Everything inside a synced collection is versioned and synchronized with your Git repository.

**Serialized YAML files**: Remote Sync stores your Metabase content as YAML files in your Git repository. Each dashboard, question, model, and document is represented as a YAML file that can be reviewed in pull requests and versioned like code. For more details on the YAML format and command-line workflows, see [serialization](./serialization.md).

**Branch-based workflow**: In Development mode, you can create branches, switch between them, and commit changes—all from the Metabase UI. This enables feature-branch workflows where you develop on a branch, open a pull request for review, and merge to production.

### Why use Remote Sync?

Remote Sync is designed for teams that want to maintain a **read-only production environment** where analytics content is created by a centralized team and deployed through a controlled process.

- **Read-only production**: Users in production can view and use dashboards, but cannot create or edit content. All content creation happens in development.
- **Version control for new content**: Add new dashboards, questions, and models to production through Git, with full version history.
- **Peer review**: Use pull requests to review new content before it goes live in production.
- **Controlled deployment**: Choose when new content appears in production by controlling when you merge to your main branch.

### How Remote Sync works

Here's a basic remote-sync workflow:

1. Create a dashboard in a **Metabase configured in Development mode**.
2. Push it to a Git branch.
3. Open a pull request for review.
4. Merge the PR to production.
5. Your **Metabase configured in Production mode** automatically pulls in the changes.

We'll cover [setting up Remote Sync](#setting-up-remote-sync), an [example dev-to-production workflow](#an-example-dev-to-production-workflow), and [branch management](#branch-management) and some other odds and ends.

### Remote Sync vs. Serialization

Remote Sync uses the same underlying serialization format as the [Metabase CLI serialization feature](./serialization.md), but serves a different purpose:

- **Remote Sync**: Designed for adding new content to a read-only production environment through a Git-based workflow. Best when you want a centralized team creating content in development and deploying it to production automatically.
- **Serialization**: Command-line tool for exporting and importing Metabase content. Best for migrating existing content, complex multi-environment setups, and scenarios requiring full control over what gets exported and imported.

## Setting up Remote Sync

You'll need to be an admin to set up Remote Sync.

1. [Set up a repository to store your content](#1-set-up-a-repository-to-store-your-content)
2. [Create a personal access token for development](#2-create-a-personal-access-token-for-development)
3. [Understand Development and Production modes](#3-understand-development-and-production-modes)
4. [Connect your development Metabase to your repository](#4-connect-your-development-metabase-to-your-repository)
5. [Add an item to your synced collection](#5-add-an-item-to-your-synced-collection)
6. [Push your changes to your repository](#6-push-your-changes-to-your-repository)
7. [Create a personal access token for production](#7-create-a-personal-access-token-for-production)
8. [Connect your production Metabase to your repository](#8-connect-your-production-metabase-to-your-repository)

## 1. Set up a repository to store your content

Before you connect Metabase to your Git repository, create a [new GitHub repository](https://docs.github.com/en/repositories/creating-and-managing-repositories/creating-a-new-repository). Initialize the repo with a README.md.

## 2. Create a personal access token for development

GitHub offers two types of personal access tokens. We recommend the fine-grained token (not the classic) because you can limit their permissions to specific repositories.

1. Go to Settings > Developer settings > Personal access tokens > Fine-grained tokens.
2. Click "Generate new token".
3. Give it a descriptive name like "Metabase Remote Sync - Development".
4. Select the specific repository you want Metabase to access.
5. Add permissions:
   - **Contents:** Read and write (it defaults to Read-only, so make sure to change this to Read and write for your development Metabase).
   - **Metadata:** Read-only (required)
6. Click "Generate token" and copy it immediately (you won't see it again). Store it somewhere safe; you'll need to paste it into your Metabase.

For more, see GitHub's docs on [personal access tokens](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens).

## 3. Understand Development and Production modes

Remote Sync has two modes: Development and Production.

**Development mode** is where you create and edit content. You can have multiple development instances for different teams, projects, or workflows. Each connects to the same repository but can work on different branches. Development mode has:

- **Bidirectional sync:** Push changes to Git and pull changes from others.
- **Full editing:** Create and modify dashboards, questions, and documents in the UI in your synced collection.
- **Branch management:** Create, switch between, and work on different branches.

**Production mode** is read-only and designed for your live environment. Production Metabases:

- **Pull changes only:** Automatically or manually pull approved content from Git.
- **Read-only content:** Users can view and use synced content but can't edit it.
- **Auto-sync option:** Automatically pull changes from your main branch every five minutes.

You can use any Metabase instance in Development mode. Metabase also offers [Development instances](./development-instance.md) for testing, which allow you to test with multiple users without paying per user account. You can use these Development instances in Remote Sync's Development mode (but not in Production mode, as they're intended for testing, not live production use).

## 4. Connect your development Metabase to your repository

1. Go to **Admin settings** > **Settings** > **Remote sync**.

2. Enter your repository URL:

   - For example, `https://github.com/your-org/your-repo`. The repository must already exist and be initialized with at least one commit.

3. Select **Development mode**.

4. Add your access token:

   - Paste the personal access token you created earlier. Make sure the token has [read and write permissions](#2-create-a-personal-access-token-for-development). Metabase encrypts your token before storing it.

5. Save and test the connection:

   - Click "Save changes". Metabase will check whether it can reach your repository. If the connection fails, make sure your token has the appropriate permissions and hasn't expired. You may also have incorrectly copied and pasted the PAT, in which case you'll need to generate a new token.

## 5. Add an item to your synced collection

When you first connect in Development mode, Metabase automatically creates a special collection called "Library" that's synced with your Git repository. This is a **synced collection**—any content you add to it will be tracked in Git and can be pushed to your repository.

You can rename the Library collection if you want, and you can add sub-collections within it to organize your content.

1. (Optional) Create a new branch for your work:

   - Click the branch dropdown in the synced collections section.
   - Type a name for your new branch (e.g., `feature/my-dashboard`).
   - Press Enter to create the branch.

   This is useful if you want to work on changes without affecting the main branch. For more details, see [Branch management](#branch-management).

2. Navigate to the "Library" collection in your synced collections section (look for it in the left sidebar).

3. Create or move content into the Library collection:
   - **Create new content:** Click "New" and choose a dashboard, question, or document. Save it to the Library collection.
   - **Move existing content:** Drag and drop items from other collections into the Library collection, or use the move option in the item's menu.

[Items in synced collections can't depend on items outside of synced collections](#items-in-synced-collections-cant-depend-on-items-outside-of-the-synced-collection). For example, if you try to add a question that references a model, make sure the model is also in a synced collection.

## 6. Push your changes to your repository

Once you've added content, you'll see a yellow dot on your Library collection indicating uncommitted changes.

1. Click the up arrow (push) icon next to the Library collection in the left sidebar.

2. Enter a commit message describing your changes (e.g., "Added dashboard on mammoth populations").

3. Click "Continue" to commit and push your changes to your repository.

Check your repository—you should see the collection with your content in it.

## 7. Create a personal access token for production

Now that you have content in your repository, you can set up your production Metabase to pull that content.

[Create a personal access token](#2-create-a-personal-access-token-for-development) following the same steps as before, but add Contents permissions to the token that are **Read-only** (NOT write), as you only want your production Metabase reading from the repo. (Contents permissions require Metadata permissions, which GitHub will add automatically).

## 8. Connect your production Metabase to your repository

1. Go to **Admin settings** > **Settings** > **Remote sync**.

2. Enter your repository URL:

   - Use the same repository as your development Metabase, for example, `https://github.com/your-org/your-repo.git`.

3. Select **Production mode**.

4. Add your access token:

   - Paste the read-only personal access token you created for this production Metabase.

5. Save and test the connection:

   - Click "Save changes". Metabase will verify it can reach your repository. If the connection fails, verify your token has the appropriate permissions and hasn't expired.

6. Pull changes and/or enable auto-sync (optional):
   - Pull changes to sync from your repo.
   - Toggle on "Auto-sync with Git" to automatically pull changes from your main branch every five minutes.

In Production mode, synced collections appear in the regular collections list with a special icon to indicate that they're versioned and read-only.

At this point, you should be all set up. Exit Admin settings, then reload your browser. You should see your synced Library collection in your production Metabase.

## An example dev-to-production workflow

Let's say your team wants to build a new analytics dashboard. Here's a workflow that ensures that all production content goes through a review process.

### Step 1: Create a new branch

In your development Metabase, click the branch dropdown in the synced collections section and [create a new branch](#branch-management) for your work, like `feature/megafauna-dashboard`.

### Step 2: Create content in your development Metabase

Create a dashboard called "Megafauna Analytics" and add some questions. The questions should be saved to the dashboard or to the synced collection. Save the dashboard to the synced collection.

### Step 3: Push to your development branch

1. You should see a yellow dot on your synced collection (indicating local changes).
2. Click the up arrow (push) icon next to your synced collection.
3. Enter a commit message: "Add Megafauna Analytics dashboard".
4. Metabase commits your changes to the branch you're working on and pushes them to your repo.

### Step 4: Create a pull request

In your Git repository:

1. Create a pull request from your branch, `feature/megafauna-dashboard`, to the main branch `main`.
2. Review the changes to the YAML files representing your dashboards and questions.
3. Someone who knows what they're doing approves and merges the PR.

### Step 5: Production automatically updates

On your production Metabase instance:

1. Within five minutes, the auto-sync process detects the new commits on `main` (you can also manually import the changes).
2. The "Megafauna Analytics" dashboard appears in production with all its questions.
3. The content is read-only for users (they can view and use it, but can't edit it).

## How your synced collection works in Development mode

Synced collections are special collections that are tracked in Git. Content in synced collections is versioned and can be pushed to or pulled from your repository.

- [Synced collections in the UI](#synced-collections-in-the-ui)
- [Moving and deleting content in synced collections](#moving-and-deleting-content-in-synced-collections)
- [Items in synced collections can't depend on items outside of the synced collection](#items-in-synced-collections-cant-depend-on-items-outside-of-the-synced-collection)

### Synced collections in the UI

When you first connect a Metabase to an initialized repository in Development mode, Metabase automatically creates a default synced collection called "Library". You can add items to that synced collection, including sub-collections.

In Development mode, your synced collection shows its current state with visual indicators:

- **Yellow dot:** You have unsynced local changes that need to be committed.
- **Up/down arrows:** Sync controls for pulling and pushing changes.

In Production mode, synced collections appear in the regular collections list (not in a separate "Synced Collections" section) with a special icon to indicate they're versioned and read-only.

### Moving and deleting content in synced collections

When you move content out of a synced collection, the UI may not immediately show the unpushed state. Refresh your browser to see the push indicator.

**Deletions sync to production:** When you remove content from a synced collection in Development mode and push that change, the content will also be removed from your Production instance when it syncs. This applies to moving content out of the synced collection or deleting it entirely.

Content in other Metabases that depended on this item may break since the dependency will no longer be in a synced collection.

### Items in synced collections can't depend on items outside of the synced collection

**Synced collections are self-contained.** Everything a dashboard or question needs must be inside the synced collection for Remote Sync to work properly. Metabase enforces these dependency constraints to ensure all content can be properly versioned and synced between instances.

**If it's not in the collection, it won't sync**—and that includes metadata. The one critical exception: table metadata (column types, descriptions, etc.) doesn't sync at all, even when questions that depend on it do sync. See [table metadata limitations](#important-table-metadata-limitations) for details.

For example:

- If a question references a model, both the question and the model must be in synced collections.
- If a dashboard includes questions, those questions must be saved to either the dashboard itself or to the synced collection.
- If a dashboard has click behaviors that link to other dashboards or questions, those linked items must be in synced collections.
- If a document contains @ mentions of other items (questions, dashboards, models, etc.), those mentioned items must be in synced collections.

Questions that depend on snippets can't be added to synced collections, as snippets aren't stored in collections and therefore can't be synced.

Items can reference other items in sub-collections that are also synced.

When you try to save an item with external dependencies to a synced collection, Metabase will show an error.

To resolve this:

1. Identify which items your content depends on.
2. Move those dependencies into synced collections first.
3. Then save your item to the synced collection.

Alternatively, you can modify your content to use a different source data that's already in synced collections.

## What Metabase syncs

Remote Sync uses the same serialization format as the [Metabase CLI serialization feature](./serialization.md), storing your content as YAML files in your Git repository.

**What syncs:**

- Dashboards and their cards
- Questions (saved queries and models)
- Model metadata (column descriptions, display settings, etc.)
- Documents
- Timelines and events
- Collection structure and metadata

**What doesn't sync:**

- Users, groups, and permissions
- Alerts and subscriptions
- Snippets
- Database connections
- Personal collections
- **Table metadata** (column types, descriptions, visibility settings, etc.)

### Important: Table metadata limitations

**Table metadata is not synced by Remote Sync.** This means any customizations you make to table metadata in your development instance—such as changing a column's display type from "Unix timestamp" to "Date", adding column descriptions, or adjusting visibility—will not automatically sync to production.

If your questions or dashboards rely on customized table metadata, you must manually apply the same metadata changes in your production instance. Otherwise, content that works in development may not work correctly in production.

**Why this matters:** If you have a question that displays a unixtime column as a date (because you changed the column type in development's table metadata), that question will sync to production, but the column will still appear as a unixtime in production unless you manually update the table metadata there as well.

For more details on the serialization format and command-line workflows, see the [serialization documentation](./serialization.md).

## Branch management

Branching is only available in Development mode.

### Creating a branch

You can create branches in Metabase or directly in your Git repository. Branches created in Git will appear in the Metabase branch dropdown once Metabase syncs with your repository.

We recommend pushing an initial commit to your main branch before creating branches. Creating a branch from an empty main branch can cause unexpected behavior.

To create a new branch in Metabase:

1. Click the branch dropdown in the synced collections section.
2. Type a name for the new branch in the search box.
3. Press Enter to create the branch.

The new branch starts from the current commit (not the latest remote).

### Switching branches

In the left sidebar under "SYNCED COLLECTIONS", you'll see a branch dropdown next to each synced collection name:

1. Click the branch dropdown to see available branches.
2. Select a different branch to switch to it.

If the branch doesn't appear, ensure it exists in your Git repository and that the name matches exactly (branch names are case-sensitive).

If you have unsynced changes, Metabase will show a dialog asking what you want to do:

- **Push changes to the current branch:** Commits your changes to the current branch before switching.
- **Create a new branch and push changes there:** Saves your work to a new branch, keeping the original branch clean.
- **Discard these changes:** Throws away your uncommitted changes (can't be undone).

The dialog shows you exactly which items have changed, so you can make an informed decision.

If you switch modes (from Development to Production or vice versa) with unpushed changes, you'll be prompted to save or discard them. You cannot switch to Production mode with uncommitted changes.

If changes don't appear after switching modes: Hard refresh your browser (Cmd/Ctrl + Shift + R).

## Deleting branches

Currently, you can only delete branches in GitHub or from the command line. Metabase will pick up the branch deletions on its next pull (though you may need to refresh your browser).

## Pushing changes to Git

You can only push changes in a Metabase with Remote sync set to Development mode.

### Committing your changes

When you make changes to items in a synced collection, a yellow dot appears on your synced collection (indicating uncommitted changes). To commit your changes:

1. Click the up arrow (push) icon next to the synced collection name in the left sidebar.
2. Enter a descriptive commit message explaining your changes.
3. Click "Continue" to push your changes to Git.

If you see "Remote is ahead of local", that means someone else pushed to the branch from another Metabase in Development mode. Pull the latest changes before pushing again.

## Pulling changes from Git

You can pull changes when in Development or Production mode.

In Development mode, you can get the latest changes from your Git repository:

1. Click the down arrow (pull) icon next to your synced collection in the left sidebar.
2. Review any summary of incoming changes if shown.
3. Confirm the import.
4. Metabase updates your collections with the latest content from Git.

If changes don't appear after pulling:

- Verify you're on the correct branch.
- Hard refresh your browser (Cmd/Ctrl + Shift + R).
- If you encounter sync errors, review error messages in the sync dialog, manually resolve conflicts in your Git repository, then pull again.

In Production mode, go to **Admin settings** > **Settings** > **Remote sync** and click **Pull changes**.

### Handling unsynced changes

If you have local uncommitted changes when trying to pull or switch branches, Metabase will prompt you with options:

- **Push changes to the current branch:** Commit your changes first, then proceed.
- **Create a new branch and push changes there:** Preserve your work on a new branch.
- **Discard these changes:** Throw away your uncommitted changes to accept what's in Git.

When in doubt, create a new branch and push changes to that branch. That way you won't lose any work.

### Pulling changes automatically

In Production mode, you can set Metabase to auto-sync changes from your main branch.

1. Navigate to **Admin settings** > **Settings** > **Remote sync**.
2. Enable Auto-sync with Git.

By default, Metabase will pull any changes (if any) from the branch you specify every five minutes. You can also manually sync as needed.

## If you already have a repo with serialized Metabase data

You can just keep doing what you're doing.

If you want to switch to this remote-sync setup, we still recommend you start with a new repo. In that case:

1. Check out a new branch in your Metabase instance in Development mode.
2. Import your data to your Metabase instance with the serialization command as you normally would.
3. Move the content you want to sync into the synced collection.
4. Push up your changes to the new repo.
