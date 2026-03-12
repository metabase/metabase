---
title: "Changing which region your Metabase is hosted in"
version: latest
has_magic_breadcrumbs: true
show_category_breadcrumb: true
show_title_breadcrumb: true
category: "Cloud"
layout: new-docs
---

# Changing which region your Metabase is hosted in

You may want to change which region your Metabase is hosted in to bring it closer to the people using it

- [Plan for some down time](#plan-for-some-down-time)
- [Select a region](#select-a-region)
- [Add the relevant IP addresses to your whitelist](#add-the-relevant-ip-addresses-to-your-whitelist)
- [If your Metabase uses a custom domain, update your CNAMES](#if-your-metabase-uses-a-custom-domain-update-your-cnames)

## Plan for some down time

Most region switches should take less than 30 minutes. Your Metabase will be offline and unavailable while it changes regions, so plan for some down time.

If you're using a [custom domain](./custom-domain.md), that region change could take longer, maybe up to 24 hours. That delay is due to DNS propagation (which is out of our hands).

## Select a region

To change regions, go to your [Metabase Store page](https://store.metabase.com/) and click on **Instances**. In the **Hosting regions** section, select the region you want to choose from:

- US East (North Virginia)
- Europe (Frankfurt)
- Asia Pacific (Singapore)
- Asia Pacific (Sydney)
- South America (São Paulo)

## Add the relevant IP addresses to your whitelist

If you're using a security group or firewall rules, you should add the relevant [IP addresses](./ip-addresses-to-whitelist.md) to your whitelist.

## If your Metabase uses a custom domain, update your CNAMES

If your Metabase uses a [custom domain](./custom-domain.md), you'll need to update your CNAMES. DNS switches are generally fast these days, but it'll take some time to sign a new certificate for that domain once it's updated (up to 24 hours).

We recommend switching regions during a time when people are less likely to use your Metabase.

## Need help?

No need to worry about backups (we have you covered), but if you run into any issues, contact support at [help@metabase.com](mailto:help@metabase.com).
