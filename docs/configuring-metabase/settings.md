---
title: General settings
redirect_from:
  - /docs/latest/administration-guide/08-configuration-settings
---

# General settings

This section contains settings for your whole instance, like its URL, the reporting timezone, and toggles for disabling or enabling some of Metabase's optional features.

You can configure these settings in the **General** section of the **Settings** tab in the **Admin Panel**.

## Site Name

How you’d like to refer to this instance of Metabase.

## Site URL

The site URL is the web address that people use to access your Metabase instance. Make sure to include http:// or https:// to make sure it’s reachable.

## Redirect to HTTPS

By default, Metabase is served over HTTP.

To force all traffic to use HTTPS via redirect, click `http://` and select `https://` from the dropdown menu.

For example, say you enable HTTPS redirect for a Metabase instance at the site URL "example.com". When someone enters an address like "example.com/data" in their browser's address bar, they'll get automatically redirected to a secure connection at `https://example.com/data`.

> Note: if you haven't set up HTTPS on your server, Metabase will not let you enable HTTPS redirect. Instead, you'll get a warning saying "It looks like HTTPS is not properly configured."

## Email Address for Help Requests

This email address will be displayed in various messages throughout Metabase when users encounter a scenario where they need assistance from an admin, such as a password reset request.

## Approved Domains for Notifications

Allowed email address domain(s) for new Dashboard Subscriptions and Alerts. To specify multiple domains, separate each domain with a comma, with no space in between (e.g., "domain1,domain2"). To allow all domains, leave the field empty. This setting doesnt affect existing subscriptions.

## Anonymous Tracking

This option turns determines whether or not you allow [anonymous data about your usage of Metabase](../installation-and-operation/information-collection.md) to be sent back to us to help us improve the product. _Your database’s data is never tracked or sent_.

## Friendly Table and Field Names

By default, Metabase attempts to make field and table names more readable by changing things like `somehorriblename` to `Some Horrible Name`. This does not work well for languages other than English, or for fields that have lots of abbreviations or codes in them. If you'd like to turn this setting off, you can do so from the Admin Panel under Settings > General > Friendly Table and Field Names.

To manually fix field or table names if they still look wrong, you can go to the Metadata section of the Admin Panel, select the database that contains the table or field you want to edit, select the table, and then edit the name(s) in the input boxes that appear.

## Enabled Nested Queries

By default, Metabase allows your users to use a previously saved question as a source for queries. If you have a lot of slow running queries, you may want to switch this option off, as performance problem can occur.

## Enable X-rays

[X-rays](../exploration-and-organization/x-rays.md) are a great way to allow your users to quickly explore your data or interesting parts of charts, or to see a comparison of different things. But if you're dealing with data sources where allowing users to run x-rays on them would incur burdonsome performance or monetary costs, you can turn them off here.
