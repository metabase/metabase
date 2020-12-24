## Dashboard subscriptions

Dashboard subscriptions are a great way to keep you and your team up to date on the data that matters most. 

Dashboard subscriptions allow you to send all of the questions on a dashboard via email or Slack. If your Metabase has email or Slack set up, all you need to do is create a dashboard and then add subscribers to it. You can set up as many subscriptions to a dashboard as you like. If you make any changes to the dashboard, Metabase will update the subscription the next time they're delivered. 

### Enabling dashboard subscriptions

To enable dashboard subscriptions, your administrators will need to have set up email or Slack for your Metabase. See [Setting up email](https://www.metabase.com/docs/latest/administration-guide/02-setting-up-email.html) or [Setting up Slack](https://www.metabase.com/docs/latest/administration-guide/09-setting-up-slack.html).

### Setting up a dashboard subscription

To set up a subscription to a dashboard, click on the **sharing** icon (the one-way arrow) and select **Dashboard subscriptions**.

![Select dashboard subscriptions](images/dashboard-subscriptions/select-dashboard-subscription.png)

Metabase will slide out a sidebar on the right, with an option set up a subscription via email or Slack:

![Set up a dashboard subscription with email or slack](images/dashboard-subscriptions/email-or-slack.png)

Let's say we want to email a dashboard. We'll click on the **Email it** option in the sidebar, and Metabase will give us some options:

![Dashboard subscription email options](images/dashboard-subscriptions/email-options.png)

We can:

- **Add subscribers** to the dashboard, either by their email address or Slack username.
- Determine **how often** Metabase sends the dashboard (daily, weekly, or monthly) and what **time of day** Metabase sends the dashboard.
- Whether Metabase should also **attach results** to the email (which will include up 2000 rows of data).
- If there are **no results**, we can tell Metabase to skip sending the dashboard at all.
- Or send an email right now (which you can also use to send a test email to yourself).

![Example dashboard subscription email](images/dashboard-subscriptions/example-email.png)

You'll notice in the email that Metabase excludes any text cards on the dashboard, and that the charts look different - Metabase reformats the charts to make them more legible in email. Additionally, tables that exceed either 10 columns or 20 rows get the rest of their results, up to 2000 rows, included as an attachment. You'll also get a random data quotation, like this one from the mathematician Andrejs Dunkels: "It's easy to lie with statistics. It's hard to tell the truth without statistics."



