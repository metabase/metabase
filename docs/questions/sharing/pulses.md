---
title: "Moving from pulses to dashboard subscriptions and alerts"
---

# Moving from pulses to dashboard subscriptions and alerts

We deprecated pulses way back in Metabase 38, and will remove active pulses completely from your Metabase starting in Metabase 49.

If you're upgrading to Metabase 49 from Metabase version 48 or older, Metabase will delete any remaining active pulses. 

If you want to keep getting those charts and tables sent to you via email or Slack, you'll need to create new dashboard subscriptions or alerts to replace those deleted pulses.

- [Dashboard subscriptions](../../dashboards/subscriptions.md), to send the results of a dashboard.
- [Alerts](./alerts.md), to send results of a question, either on a schedule, or when the results meet a certain criteria.

## Differences between dashboard subscriptions and alerts

The main difference between dashboard subscriptions, alerts, and pulses, is that pulses were their own entities, which made pulses more cumbersome to manage than they needed to be. You'd have to manually add one or more questions to the pulse to include them in the email or Slack message. And if you wanted to send a slightly different pulse, you'd have to create a new pulse, and add those questions again.

With (the obviously superior) [dashboard subscriptions](../../dashboards/subscriptions.md), you can just send the results of a dashboard. And you can have as many subscriptions on a dashboard that you like, sent to different people, with different filters applied.

With [Alerts](./alerts.md), you have more control over when Metabase emails or messages you based on the results a single question returns.