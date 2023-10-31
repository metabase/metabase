---
title: Metabase analytics
---

## Metabase analytics

{% include plans-blockquote.html feature="Metabase analytics" %}

The **Metabase Analytics** collection is a special collection that contains view-only questions, dashboards, and models that help you understand how people are using your Metabase.

## Permissions

By default, only admins can see the Metabase analytics collection. You can manage permissions for the collection in **Admin settings** > **Permissions** > **Collections**.

There are only two access types for the Metabase analytics collection: **View** and **No access**.

## Dashboards

The Metabase Analytics collection includes a set of read-only dashboards.

### Most viewed content

View the most relevant content in your Metabase.

Filter by group, person, or activated or deactivated accounts.

### Single content view

Information about dashboards, questions, models, and tables. Dashboard cards include:

- Content metadata
- Content view over time
- Most active users on this content
- Last activity on content
- ...

### Metabase usage metrics

### Single person view

## Models

### Activity

Each row of this model describes one event. Fields include:

- ID
- Topic
- Timestamp
- End Timestamp
- User ID
- Model
- Model ID
- Details

### Alerts and subscriptions
Data from alerts and subscriptions including recipients. Fields include:

- ID
- Entity Type
- Created At
- Updated At
- Creator ID
- Name
- Description
- Collection ID
- Made Public By User
- Archived
- Is Official
- Action Type
- Action Model ID
- Collection Is Personal
- Subscription Dashboard ID
- Alert Question ID
- Recipient Type
- Recipient External

### Content

Questions, dashboards, models, events, and collections.

- ID
- Entity Type
- Created At
- Updated At
- Creator ID
- Name
- Description
- Collection ID
- Made Public By User
- Is Embedding Enabled
- Archived
- Action Type
- Action Model ID
- Collection Is Official
- Collection Is Personal
- Question Viz Type
- Question Database ID
- Question Is Native
- Event Timestamp

### Group members

### People

Everyone in your Metabase, including deactivated accounts. Fields include:

- User ID
- Email
- First Name
- Last Name
- Full Name
- Date Joined
- Last Login
- Updated At
- Is Admin
- Is Active
- SSO Source
- Locale

### Dashboard cards

Each row is a dashboard card: either a question card or a text card. Fields include:

- ID
- Dashboard ID
- Dashboardtab ID
- Question ID
- Created At
- Updated At
- Size X
- Size Y
- Visualization Settings
- Parameter Mappings


## Custom reports

In the Custom reports section you can store custom questions, models, and dashboards based on data found in the parent Metabase analytics directory.
