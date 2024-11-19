---
title: About the anonymous usage data we collect
redirect_from:
  - /docs/latest/information-collection
---

# About the anonymous usage data we collect

If you're self-hosting Metabase and you've opted in to provide us with anonymous usage data (thank you!), Metabase will phone home some data collected via Snowplow.

**[We only collect anonymous Metabase data; we don't collect any of your data](https://www.metabase.com/security).** We don't collect any usernames, emails, server IPs, database details of any kind, or any personally identifiable information (PII).

This anonymous data helps us understand how people are actually using Metabase, which in turn helps us prioritize what to work on next.

## Examples of the anonymous data we collect and how we use it

In a nutshell: we track some basic events to find opportunities for improving the product and evaluating project outcomes. We _don't_ use the data for sales or advertising (and the data's anonymous, so we couldn't use it for that anyway).

We collect things like:

- Events in the product (for example, when people create models)
- Some performance data
- The number and types of DBs you've connected to your Metabase
- The number of questions and dashboards and other items you've created

This anonymous data helps us figure out things like:

- Which features you're using
- Where people get stuck
- How performance for key workflows (like querying or loading) changes over time

## Opting out of anonymous usage data collection for self-hosted Metabases

If you're self-hosting Metabase, you can opt out of providing us with your anonymous usage data:

1. Click on the gear icon.
2. Select **Admin settings**.
3. Go to the **Settings** tab.
4. Click **General**
5. Toggle the **Anonymous tracking** option.

If you're in the process of setting up your Metabase, you can also toggle off tracking during the `Usage Data Preferences` onboarding step. We collect a few anonymous events before that point, but won't do so anymore if you choose to opt out.

## Further reading

Check out our page on [data privacy and security](https://www.metabase.com/security).
