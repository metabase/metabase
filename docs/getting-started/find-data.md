---
title: "Find data"
summary: "How to find questions, dashboards, and data sources in Metabase"
---

# Find data

> Prefer to learn with an AI agent? Check out the [Learn Metabase Claude skill](https://www.metabase.com/learn/cheat-sheets/claude-skill-learn-metabase).

{% include youtube.html id='dVNB-xJW0CY' %}

The easiest way to explore your data in Metabase is by looking at dashboards and charts that your teammates have already created.

This hands-on tutorial will walk you through all the different ways of finding things in Metabase. You can fire up your own Metabase and follow along – we’ll use the sample data that comes with every new Metabase instance, and give you step-by-step instructions.

## Find questions and dashboards

### Collections

[Collections](../exploration-and-organization/collections.md) in Metabase are a lot like folders: they’re where Metabase keeps all your dashboards and charts. For example, your company might have a "Sales" collection and "Marketing" collection for reports from different teams.

![Collection](./images/collection.png)

Browsing collections is useful when you want to learn what’s out there in your Metabase and see what your teammates have already created. You can find collections in the left navigation sidebar.

Let's start by exploring the Examples collection.

1. **In the left navigation sidebar, find the Examples collection and click on it.** If you don’t have the sidebar open, click the ☰ icon in the top left.

   Inside the Examples collection, you’ll see a long list of items in the collection (think: files in a folder), a pinned dashboard “E-commerce Insights”, and a pinned model “Orders + People”.

   As you can imagine, collections with lots of items can get messy pretty quickly, so you can pin important items to find them quickly. You can also create subcollections to help organize things.

2. **Click on the pinned “E-commerce Insights” dashboard.**

You’ll see some cards with charts that are organized in tabs. You’ll explore the data behind the charts on the dashboard in the next article, but for now, let’s look at other ways to find data in Metabase.

## Search

Search will look through names, descriptions, and metadata of your questions and dashboards.

![Advanced search](./images/advanced-search.png)

It’s useful when you already have an idea of what you’re looking for, like “I want to see all orders per customer”. Let's find that information in our Metabase.

1. **Open the command palette** by pressing Cmd/Ctrl + K, or by clicking on “Search” at the top right of the screen.

   You’ll see the command palette pop up. It’s a powerful tool that can do a lot (check out the [command palette docs](../exploration-and-organization/exploration.md#command-palette)), but for now we’ll just use it to search for things about “orders”.

2. **Type “orders” into the search bar.**

   You should see a list of results, like the “Orders” table from the Sample Database and a bunch of questions like “Revenue and orders over time” from the Examples collection.

   If your Metabase has a lot of stuff in it, you could end up with dozens or even hundreds of search results, so it might be helpful to narrow those down.

3. **Open advanced search** by clicking on _View and filter all results_ next to the **Results** heading.

   This will open a new page with search filters. There are filters by the content type (so you could tell Metabase to search just for questions or just for dashboards), creator (for example, so you could only search your own questions), and others.

4. **Restrict the search results to Content type → Table**.

   You should see a table “Orders” from the Sample Database. Feel free to click on it and explore!

## Find data sources

If you want to kick off your own data exploration directly from the source tables, you can browse all the tables that you have access to.

![Browse data](./images/browse-data.png)

### Browse databases and tables

1. **In the left navigation sidebar, click on Browse → Databases.** If you don’t have the sidebar open, click the ☰ icon in the top left to open it.

   You’ll see a list of databases that you can query. You should see at least the Sample Database that’s included with every fresh Metabase instance, and any other databases that you have the permissions to query. Let’s take a look at what’s in the Sample Database.

2. **Find the Sample Database and click on it**.

   You’ll see a list of all tables in the Sample Database. There are 8 tables that have example data about a fictional e-commerce app. This data powers the example dashboard that you saw in the [Examples collection](#collections).

3. **Click on any table (for example, Accounts) to see the data in the table**.

   From there, you can start exploring the data in the table. Try clicking on a cell and filtering the table, or using the **Filter** and **Summarize** buttons in the top right.

   In the next articles, you'll learn more about exploring the tables you just found.

## Summary

There are a couple of ways to find data you’re looking for in Metabase:

- If you want to find some questions or dashboards that already exist, you can browse through collections to see what others have created, or search with the command palette (Cmd/Ctrl + K).
- If you want to see what raw data is available to you, you can browse databases and tables within them.

In the next tutorial, you'll learn how to explore the data that you just found.
