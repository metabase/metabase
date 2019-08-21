## Audit Logs

Administrators on the Enterprise Edition have access to an audit log, which can be accessed by clicking the gear icon in the upper right and then clicking Audit in the top navigation. 

The Audit page covers three main sections: people, data and items, and will begin showing data as soon as you start interacting with your Metabase instance. 

### People

Use the People section to gain a better understanding of how your end-users are interacting with Metabase. The People section covers:

* A chart showing your active and newly invited team members over time.
* A chart showing which of your team members are viewing the most things.
* A chart showing which of your team members are creating the most things.
* A list of all of your team members
* A full audit log of actions your team members have performed

![Team Members](/images/audit-team.png)

Throughout the People section, names can be clicked to access the profile of a specific user’s activity. This profile includes:

* Dashboard views
* Query views
* Downloads

![Team Members](/images/audit-teammember.png)

### Data

The Data section focuses on your databases, schemas and tables. Look here if you're trying to uncover queries and schemas that need optimization. This page will show you information such as:

* How many queries are being run and their average speed
* How many queries are being run against each database per day
* The most queried schemas
* The slowest schemas
* The most queried tables
* The slowest tables

![Data](/images/audit-data.png)

### Items
The Items section focuses on Questions, Dashboards and Downloads. Use these pages to better understand what information your users are interacting with.

#### Questions

The Questions section covers:

* The most popular queries
* The slowest queries
* Number of query views and average speed per day

![Items](/images/audit-questions.png)

You can also click on any question to drill into a more detailed profile showing:

* View activity
* Revision History
* A full audit log of who viewed the question, and when

#### Dashboards

The Dashboards section covers:

* Dashboard view and saves per day
* Most popular dashboards and their average loading times
* Which questions are included in the most dashboards

![Items](/images/audit-dashboards.png)

You can also view a list of all of your dashboards, and a variety of information about each such as total number of views and the average execution time.

#### Downloads

Use the Downloads section to understand which of your users are downloading (or exporting data) and the size of the downloads their performing. The Downloads section contains:

* Average rows per query download
* Total downloads per user
* All downloads
