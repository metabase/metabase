---
title: Workspaces
summary: Workspaces create isolated schemas in your data warehouse for you to test out transforms.
---

# Workspaces

Workspaces let you test out new transforms in a safe way. When you put Metabase into a workspace, it will look like transforms write to their target tables, but under the hood the transforms write the tables to an isolated schema.

Why would you want to do this? Let's say you're a human, and you want to do some analysis that involves writing some new transforms. You can put a dev instance of Metabase into a workspace, write those transforms, build a dashboard on top of the tables those transforms created, all without touching production tables. Once you're happy, you can use remote sync to pull your new transforms and dashboard into production, the transforms will target your production schema.

## Agent-driven workflow with workspaces

How you're most likely to use workspaces: to set up an environment where agents can write to your data warehouse in a safe way. Paired with the Metabase CLI, you can put agents to work building your semantic layer.

Once you have your dev environment set up, here's a typical workflow:

1. You put the dev instance of Metabase into a workspace.
2. You use the Metabase CLI (paired with the `/metabase-cli` skill) to give an agent a wildly ambitious prompt. Something like:

```
/metabase-cli create a new metabase workspace from production for customer cohort retention analysis. The public schema contains raw ecom data (users, orders, addresses, payments). Create a nano semantic layer (2 transforms max) to power a cohort retention dashboard you need to build with signup-month cohorts, repeat purchase rate, cohort revenue curve. Put the dashboard in a new collection called Cohort analysis. Dashboard questions should be made with the query builder so we get drill-through out of the box.
```

3. Agent does its thing.
4. You check out the transforms and dashboards it builds. Iterate either with the agent, or via the Metabase UI (turns out Metabase is actually faster than AI

## High-level example workflow.

1. Create a workspace in your production Metabase.
2. Download the configuration file for that workspace.
3. In your development Metabase, check out a new branch.
4. Create an API key with Administrator privileges.
4. Create a workspace in your development Metabase, and upload your workspace config.
4. In you terminal, pull down your Metabase repo and check out the branch you created.
4. Run `mb auth login` and use the API key to authenticate.



 How workspaces work




We


You can also set up a workspace for an agent to use when developing transforms and other content for your Metabase.

A workspace is defined by a configuration file.

To use workspaces, you'll need at least two Metabases.

You'll also need to have set up [remote sync](../installation-and-operation/remote-sync.md).


## Create a workspace

To create a workspace, go to your production Metabase.

1. Click grid icon in the upper right.
2. Go to **Data Studio**.
3. Click **Workspaces** toward the bottom of the left sidebar.
4. Click **Create a workspace**.
5. In the **Databases to include** section, click **Add a database**. Select the database and the schemas to include. In the workspace, Metabase will remap all transforms that target these schemas to the isolated schema it creates.
6. Download the config file Metabase creates.

> Warning: keep this config file secret, as it contains credentials to your data warehouse!

To use the workspace, spin up a dev instance of Metabase, navigate to the **Data studio > Workspaces** and upload the config.

### Workspaces require an admin connection

For Metabase to be able to create workspaces, it needs a connection to your data warehouse that can create new users and schemas.

If you've (wisely) connected Metabase to your data warehouse using a user with limited, read-only permissions, and a separate writable connection for transforms, you'll need to set up an admin connection in order for Metabase to provision the users and schemas that make workspaces possible. Metabase will only route workspace creation requests through this connection.

## Full agent workspace walkthrough

The goal: a setup where you prompt an agent to create a semantic layer for you. You can iterate on the agent's output, either with the agent or in the UI itself. Once you're happy, you can create a Pull Requestion to bring your changes into production using Remote Sync.

### Prerequisites

You'll need to have the following set up:

- [Remote Sync](../installation-and-operation/remote-sync.md) set up on your production Metabase.
- Remote Sync set up on your Metabase pointing to the same repo.
- Metabase CLI installed and logged into your development Metabase.
- The `/metabase-cli` installed.
- [Metabase skills](https://github.com/metabase/agent-skills) (you'll need the `metabase-cli` skill in particular).

1. In your dev Metabase, [create a new branch](../installation-and-operation/remote-sync.md#creating-a-branch).

1. In your dev instance, [create an API key](../people-and-groups/api-keys.md#create-an-api-key). Assign the key to the Admin group.

2. Authenticate Metabase CLI ro your dev Metabase. In a terminal, run:

```
mb auth login
```

Follow the prompts. Call the profile "Dev" (or whatever you want, just something to remember that the profile is authenticated with your dev instance). Paste the API key when prompted. The CLI will use this key to authenticate its requests to your dev instance.

3. Summon your agent and enter your prompt, starting with the slash skill command `/metabase-cli` to invoke the CLI skill:

```txt
/metabase-cli Take the following normalized tables and magically create a semantic layer with...
```

4. The agent does its thing. Depending on your agent setup, it might follow up with some questions.

5. Log in to your Metabase and see what the agent created.

If the agent created any tables, you can view the tables in the workspace:

![Workspace mapped tables](./images/workspace-mapped-tables.png)

The `Table` column shows the table created by a transform. The `Mapped Table` column shows where Metabase actually wrote the table: in the isolated schema in your data warehouse.

If you look at any questions built on top of one of these tables, it'll look like they are targeting the `Table`, but under the hood Metabase queries the `Mapped Table`.

6. Iterate on the agent's output. You can either prompt the agent again, or make changes in Metabase's handy UI (it's actually faster for a lot of things, like arranging cards on a dashboard, and helps you get a feel for the data).

7. Once you're happy with your tables and any questions, documents, or dashboards, push your changes to you branch using remote sync.

8. Put up a PR for the changes, then merge the branch into your main branch.

9. Pull the changes to main into your production Metabase.

10. If you created any transforms, you'll need to run those transforms in production to create the tables. The transforms in production will write to the tables they target (not to an isolated schema, since prod isn't---and shouldn't be---in a workspace). See [transforms](./transforms/transforms-overview.md#run-a-transform).

## Cleaning up a workspace

When you leave a workspace, the database connection will remain, but Metabase will stop remapping tables.

To delete the worskspace, and the isolated schema the workspace was using in your data warehouse:

1. Go to your prod Metabase (where you created the workspace initially).
2. Click the grid icon.
3. Select **Data studio**.
4. Click **Workspaces** in the left sidebar.
5. Next to the workspace you want to delete, click the **Three-dot menu** next to the workspace's name.
6. Select **Delete**, and **Delete workspace** in the confirmation modal.

Metabase will delete both the db user it used to connect to your data warehouse, as well as the schema and tables (if any) it used for the workspace. You can't undo this.
