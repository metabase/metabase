---
title: Usage analytics
---

## Usage analytics

{% include plans-blockquote.html feature="Metabase analytics" %}

The **Metabase Analytics** collection is a special collection that contains view-only questions, dashboards, and models that help you understand how people are using your Metabase. These resources are useful for:

- **Understanding Usage**: Understand how people use your Metabase (e.g., new questions, most active people and groups, and so on).
- **Auditing activity**: Know who viewed or did what and when, including tracking dashboard and question views, queries, downloads, and other activity like changing settings or inviting people to your Metabase.
- **Improving operations**: Know the slowest dashboards and questions, how your database's are performing, who's consuming the most resources, and so on.

Some things to keep in mind with this special Metabase analytics collection:

- Metabase analytics is a view-only collection. Even admins can't curate it. It is eternal.
- By default, only admins can view the Metabase analytics collection (though they can grant other groups view access to it).
- You can duplicate any item in the Metabase analytics collection, modify the item to your liking, and save the item to another collection.

## Permissions

By default, only admins can see the Metabase analytics collection. You can manage permissions for the collection in **Admin settings** > **Permissions** > **Collections**.

There are only two access types for the Metabase analytics collection: **View** and **No access**.

Additionally, this Metabase analytics collection has a default sub-collection called "Custom reports" which you can use to save duplicated/modified questions, dashboards, and models. This sub-collection inherits the same permissions, but it's not view-only; admins have curate access by default, and can grant other groups view access.

## Creating custom reports

You can duplicate any of the questions, dashboards and models in the Metabase analytics collection and tweak them to your liking, but you'll need to save them to a different collection.

We recommend you save your custom reports in the conveniently named "Custom reports" collection, so these items inherit the same permissions, but you can save them wherever you like (except for the Metabase analytics collection).

## Dashboards

The Metabase Analytics collection includes a set of read-only dashboards.

### Metabase metrics

General information about people viewing and creating dashboards, questions, subscriptions, and alerts. Cards include:

- Active users last week
- Question views last week
- Questions created last week
- Dashboards created last week
- Alerts and subscriptions created last week
- Weekly active users
- Question views per week
- Most active users
- Most active creators
- Most viewed dashboards
- Most viewed cards

### Most viewed content

View the most relevant content in your Metabase. Cards include:

- Most viewed dashboards
- Most viewed questions
- Most viewed tables

### Person overview

See what someone's been up to in your Metabase. Cards include:

- Member of
- Active alerts
- Questions created per month
- Question views per month
- Most viewed dashboards
- Most viewed questions
- Last viewed dashboards
- Last viewed questions
- Last viewed tables
- Recent activity
- Last queries

### Dashboard overview

Information about dashboards, questions, models, and tables. Cards include:

- Dashboard metadata
- Dashboard views per month
- Question performance
- Most active people on this dashboard
- Questions in this dashboard
- Most active people on this dashboard
- Questions in this dashboard
- Recent activity on dashboard
- Subscriptions on this dashboard

### Question overview

Views, performance, activity, and other data for a particular question. Cards include:

- Question metadata
- Question views per month
- Question performance
- Most active people on this question
- Dashboards with this question
- Last activity on this question
- Alerts on this question

### Performance overview

Question, dashboard and database performance. Cards include:

- Slowest dashboards
- Dashboards consuming most resources
- Slowest questions
- Questions consuming the most resources
- Dashboards with more questions in the same tab
- Users consuming the most resources

### Content with cobwebs

Dashboards and questions that you could consider archiving. Cards include:

- Dashboards without recent reviews
- Questions without recent reviews
- Questions that don't belong to a dashboard

## Models

The Metabase analytics collection includes a bunch of useful models based on Metabase's application database.

### Activity log model

Each row of this model describes one event of a particular topic. Fields include:

- ID
- Topic
- Timestamp
- End Timestamp
- User ID
- Model
- Model ID
- Details

The topics include:

- alert-create
- alert-delete
- card-create
- card-delete
- card-update
- dashboard-add-cards
- dashboard-create
- dashboard-delete
- dashboard-remove-cards
- install
- metric-create
- metric-delete
- metric-update
- segment-create
- segment-delete
- segment-update
- setting-update
- subscription-create
- subscription-delete
- user-joined

### View Log model

Tracks views cards (which includes models), dashboards, and tables. Fields include:

- ID
- Timestamp
- User ID
- Entity Type (card, dashboard, or table)
- Entity ID
- Entity Qualified ID

### Query log model

Information about all queries Metabase ran across all dashboards. Fields include:

- Entity ID
- Started At
- Running Time Seconds
- Result Rows
- Is Native
- Query Source
- Error
- User ID
- Card ID
- Card Qualified ID
- Dashboard ID
- Dashboard Qualified ID
- Pulse ID
- Database ID
- Database Qualified ID
- Cache Hit
- Action ID

Query sources include:

- action
- ad-hoc
- collection
- csv-download
- dashboard
- embedded-dashboard
- embedded-question
- json-download
- map-tiles
- metabot
- public-dashboard
- public-question
- pulse
- question
- xlsx-download

### Content model

All Metabase content, including questions, models, dashboards, events, and collections. Entity types include:

- action
- collection
- dashboard
- event
- model
- question

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

### People model

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

### Dashboard subscriptions model

Which subscriptions are active, who created them, who's subscribed to them, when they're sent, and more.

- Entity ID
- Entity Qualified ID
- Created At
- Updated At
- Creator ID
- Archived
- Dashboard Qualified ID
- Schedule Type
- Schedule Day
- Schedule Hour
- Recipient Type
- Recipients
- Recipient External
- Parameters

### Dashboard cards model

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

## Databases model

Information about your connected data sources. Fields include:

- Entity ID
- Entity Qualified ID
- Created At
- Updated At
- Name
- Description
- Database Type
- Metadata Sync Schedule
- Cache Field Values Schedule
- Timezone
- Is On Demand
- Auto Run Queries
- Cache Ttl
- Creator ID
- Db Version

## Tables model

List of all tables across all connected data sources. Fields include:

- Entity ID
- Entity Qualified ID
- Created At
- Updated At
- Name
- Display Name
- Description
- Active
- Database ID
- Schema
- Is Upload

## Fields model

All fields from all connected data sources. Fields include:

- Entity ID
- Entity Qualified ID
- Created At
- Updated At
- Name
- Display Name
- Description
- Base Type
- Visibility Type
- Fk Target Field ID
- Has Field Values
- Active
- Table ID
