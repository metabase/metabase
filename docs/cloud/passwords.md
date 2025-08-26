---
title: "Password settings on Metabase Cloud"
version: latest
has_magic_breadcrumbs: true
show_category_breadcrumb: true
show_title_breadcrumb: true
category: "Cloud"
layout: new-docs
---

# Password settings on Metabase Cloud

Password strength is goverened by environment variables. On Metabase Cloud, these two variables are set like this:

- [MB_PASSWORD_COMPLEXITY](https://www.metabase.com/docs/latest/configuring-metabase/environment-variables#mb_password_complexity) is set to `strong`
- [MB_PASSWORD_LENGTH](https://www.metabase.com/docs/latest/configuring-metabase/environment-variables#mb_password_length) is set to 12

In other words, passwords need to be at least 12 characters long, with 2 lowercase, 2 uppercase, 1 digit, and 1 special character.

