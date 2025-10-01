---
title: "Limitations of Metabase Cloud"
version: latest
has_magic_breadcrumbs: true
show_category_breadcrumb: true
show_title_breadcrumb: true
category: "Cloud"
layout: new-docs
redirect_from:
  - /cloud/docs/limitations
---

# Limitation of Metabase Cloud

There are some limitations that could impact your migration to Metabase Cloud. These limitations apply to all [Metabase Cloud plans](https://www.metabase.com/pricing/).

## Metabase Cloud only supports official databases

Metabase Cloud only works with:

- [Metabase's officially supported databases](../databases/connecting.md#connecting-to-supported-databases) (with the exception of SQLite and H2).

Metabase Cloud doesn't support [community database drivers](../developers-guide/community-drivers.md), or file-based databases (SQLite and H2), because there's currently no file storage available.

## Limited custom certificate support

Only some databases support custom certificates, which you can input/upload via the database connection setup user interface in your Metabase.

## No email sender customization

Metabase Cloud does not support customization of the "from address" for emailed reports, alerts, and other system notifications.

## No access to application database

You won't be able to access the application database; if you want insights into how people are using your Metabase, check out [Usage analytics](../usage-and-performance-tools/usage-analytics.md).

## Queries time out after ten minutes

If a query takes longer than ten minutes to run, it will time out.
