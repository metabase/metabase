---
title: Remote sync
description: Version control your dashboards, questions, and models with Git. Sync content between development and production instances automatically.
---

# Remote sync

{% include plans-blockquote.html feature="Remote sync" %}

Git-based version control for your Metabase collections. Sync dashboards, questions, and documents between Metabase and Git repositories with automatic change tracking. With Remote Sync, you'll set up one (or more) development Metabases and one Production Metabase.

Here's a basic remote-sync workflow:

1. Create a dashboard in your **development Metabase**.
2. Push it to a Git branch.
3. Open a pull request for review.
4. Merge the PR to production.
5. Your **production Metabase** automatically pulls in the changes.

We'll cover [setting up remote sync](#setting-up-remote-sync), an [example dev-to-production workflow](#an-example-dev-to-production-workflow), and [branch management](#branch-management) and some other odds and ends.

Prefer the command line? Check out [serialization](./serialization.md) for command-line export and import workflows.

## Setting up Remote Sync

You'll need to be an admin to set up Remote Sync.

1. [Set up a repository to store your content](#set-up-a-repository-to-store-your-content)
2. [Create a personal access token for development](#create-a-personal-access-token-for-development)
3. [Set up your development Metabase](#set-up-your-development-metabase)
4. [Connect your development Metabase to your repository](#connect-your-development-metabase-to-your-repository)
5. [Add an item to the Library collection](#add-an-item-to-the-library-collection)
6. [Push your changes to your repository](#push-your-changes-to-your-repository)
7. [Create a personal access token for production](#create-a-personal-access-token-for-production)
8. [Connect your production Metabase to your repository](#connect-your-production-metabase-to-your-repository)

## Set up a repository to store your content

Before you connect Metabase to your Git repository, create a [new GitHub repository](https://docs.github.com/en/repositories/creating-and-managing-repositories/creating-a-new-repository). Initialize the repo with a README.md

## Create a personal access token for development

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

## Set up your development Metabase

Development Metabases are where you create and edit content. You can have multiple development instances for different teams, projects, or workflows. Each connects to the same repository but can work on different branches. Development mode has:

- **Bidirectional sync:** Push changes to Git and pull changes from others.
- **Full editing:** Create and modify dashboards, questions, and documents in the UI in your synced collection.
- **Branch management:** Create, switch between, and work on different branches.

You can use any Metabase as a development instance. Metabase also offers [Development instances](./development-instance.md) for testing and development, which allows you to test with a bunch of users without having to pay per user account.

## Connect your development Metabase to your repository

1. Open the Remote sync settings:

   - Click the gear icon in the top right (or navigate to "Admin settings").
   - In the Settings navigation, click "Remote sync" in the left sidebar.

2. Enter your repository URL:

   - For example, `https://github.com/your-org/your-repo.git`. The repository must already exist and be initialized with at least one commit.

3. Select Development mode.

4. Add your access token:

   - Paste the personal access token you created earlier. Make sure the token has [read and write permissions](#create-a-personal-access-token-for-development). Metabase encrypts your token before storing it.

5. Save and test the connection:

   - Click "Save changes". Metabase will check whether it can reach your repository. If the connection fails, make sure your token has the appropriate permissions and hasn't expired. You may also have incorrectly copied and pasted the PAT, in which case you'll need to generate a new token.

## Add an item to the Library collection

Once your development Metabase is connected to your Git repository, you can start adding content to your synced collection. When you first connect in Development mode, Metabase will automatically create a default synced collection called "Library".

1. Navigate to the "Library" collection in your synced collections section (look for it in the left sidebar).

2. Create or move content into the Library collection:
   - **Create new content:** Click "New" and choose a dashboard, question, or document. Save it to the Library collection.
   - **Move existing content:** Drag and drop items from other collections into the Library collection, or use the move option in the item's menu.

Items in synced collections can't depend on items outside of synced collections. For example, if you try to add a question that references a model, make sure the model is also in a synced collection. "Library" is just the default name Metabase gives the collection, but you can rename this collection.

## Push your changes to your repository

Once you've added content, you'll see a yellow dot on your Library collection indicating uncommitted changes.

1. Click the up arrow (push) icon next to the Library collection in the left sidebar.

2. Enter a commit message describing your changes (e.g., "Added dashboard on mammoth populations").

3. Click "Continue" to commit and push your changes to your repository.

Check your repo, you should see the collection with your content in it.

## Create a personal access token for production

Now that you have content in your repository, you can set up your production Metabase to pull that content.

[Create a personal access token](#create-a-personal-access-token-for-development) following the same steps as before, but add Contents permissions to the token that are **Read-only** (NOT write), as you only want your production Metabase reading from the repo. (Contents permissions requires Metadata permissions, which GitHub will add automatically).

## Connect your production Metabase to your repository

1. Open the Remote sync settings:

   - Click the gear icon in the top right (or navigate to "Admin settings").
   - In the Settings navigation, click "Remote sync" in the left sidebar.

2. Enter your repository URL:

   - Use the same repository as your development Metabase, for example, `https://github.com/your-org/your-repo.git`.

3. Select Production mode.

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

In your development Metabase, click the branch dropdown in the synced collections section and [create a new branch](#branch-management) for your work, like `feature/megafaune-dashboard`.

### Step 2: Create content in your development Metabase

Create a dashboard and add some questions. The questions should be saved to the dashboard or to the synced collection. Save the dashboard to the synced collection.

### Step 3: Push to your development branch

1. You should see a yellow dot on your synced collection (indicating local changes).
2. Click the up arrow (push) icon next to your synced collection.
3. Enter a commit message: "Add Megafaune Analytics dashboard".
4. Metabase commits your changes to the branch you're working on and pushes them to your repo.

### Step 4: Create a pull request

In your Git repository:

1. Create a pull request from your branch, `feature/megafaune-dashboard`, to the main branch `main`.
2. Review the changes to the YAML files representing your dashboards and questions.
3. Someone who knows what they're doing approves and merges the PR.

### Step 5: Production automatically updates

On your production Metabase instance:

1. Within five minutes, the auto-sync process detects the new commits on `main` (you can also manually import the changes).
2. The "Megafauna Analytics" collection appears in production with all its dashboards and questions.
3. The content is read-only for users (they can view and use it, but can't edit it).

## How your synced collection works in Development mode

- [Synced collections options](#synced-collections-options)
- [Moving content out of synced collections](#moving-content-out-of-synced-collections)
- [Items in synced collections can't depend on items outside of the synced collection](#items-in-synced-collections-cant-depend-on-items-outside-of-the-synced-collection)

### Synced collections options

When you first connect a Metabase to an initialized repository in Development mode, Metabase will automatically create a default synced collection called "Library". You can add items to that synced collection, including existing collections.

In your development Metabase, your synced collection will show its current state:

- **Yellow dot:** You have unsynced local changes that need to be committed.
- **Up/down arrows:** Sync controls for pulling and pushing changes.

In Production mode, you won't see a dedicated "Synced Collections" section in the sidebar. Instead, synced collections appear in the regular collections list with a special icon to indicate that they're versioned and read-only.

### Moving content out of synced collections

When you move content out of a synced collection, the UI may not immediately show the unpushed state. Refresh your browser to see the push indicator.

Content in other instances that depended on this item may break since the dependency will no longer be in a synced collection.

### Items in synced collections can't depend on items outside of the synced collection

Metabase enforces dependency constraints for synced collections to ensure all content can be properly versioned. In other words: you can't save an item to a synced collection if it depends on items outside of synced collections.

For example:

- If a question references a model, both the question and the model must be in synced collections.
- If a dashboard includes questions, those questions must be saved to either the dashboard itself or to the synced collection.
- If a question uses a snippet (any snipppet), that question can't be added to the synced collection, as snippets are not stored in collections.
- If a document contains @ mentions of other items (questions, dashboards, models, etc.), those mentioned items must be in synced collections.

Items can reference other items in sub-collections that are also synced.

When you try to save an item with external dependencies to a synced collection, Metabase will show an error.

To resolve this:

1. Identify which items your content depends on.
2. Move those dependencies into synced collections first.
3. Then save your item to the synced collection.

Alternatively, you can modify your content to use a different source data that's already in synced collections.

## What Metabase syncs

- Dashboards and their cards
- Questions (saved queries and models)
- Documents
- Native query snippets
- Timelines and events
- Collection structure and metadata

### What doesn't sync

- Users, groups, and permissions
- Alerts and subscriptions
- Database connections
- Personal collections

## Branch management

Branching is only available in Development mode.

### Creating a branch

We recommend pushing an initial commit to your main branch before creating branches. Creating a branch from an empty main branch can cause unexpected behavior.

To create a new branch:

1. Click the branch dropdown in the navigation.
2. Type a name for the new branch in the search box.

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

If you see "Remote is ahead of local", that means someone else pushed to the branch from another Development Metabase. Pull the latest changes before pushing again.

## Pulling changes from Git

You can pull changes when in Development or Production mode.

In development mode, you can get the latest changes from your Git repository:

1. Click the down arrow (pull) icon next to your synced collection in the left sidebar.
2. Review any summary of incoming changes if shown.
3. Confirm the import.
4. Metabase updates your collections with the latest content from Git.

If changes don't appear after pulling:

- Verify you're on the correct branch.
- Hard refresh your browser (Cmd/Ctrl + Shift + R).
- If you encounter sync errors, review error messages in the sync dialog, manually resolve conflicts in your Git repository, then pull again.

In production mode, you can go to **Admin settings** > **Settings** > **Remote sync** and click **Pull changes**.

### Handling unsynced changes

If you have local uncommitted changes when trying to pull or switch branches, Metabase will prompt you with options:

- **Push changes to the current branch:** Commit your changes first, then proceed.
- **Create a new branch and push changes there:** Preserve your work on a new branch.
- **Discard these changes:** Throw away your uncommitted changes to accept what's in Git.

When in doubt, create a new branch and push changes to that branch. That way you won't lose any work.

### Pulling changes automatically

In Production mode, you can set Metabase to auto-sync changes from your main branch.

1. Navigate to "Admin settings" > "Remote sync".
2. Enable Auto-sync with Git.

By default, Metabase will pull any changes (if any) from the branch you specify every five minutes. You can also manually sync as needed.

## If you already have a repo with serialized Metabase data

You can just keep doing what you're doing.

If you want to switch to this remote-sync setup, we still recommend you start with a new repo. In that case:

1. Check out a new branch in your Development Metabase.
2. Import your data to your Development Metabase with the serialization command as you normally would.
3. Move the content you want to sync into the synced collection.
4. Push up your changes to the new repo.
