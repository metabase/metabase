---
title: "Changing your domain name"
version: latest
has_magic_breadcrumbs: true
show_category_breadcrumb: true
show_title_breadcrumb: true
category: "Cloud"
layout: new-docs
redirect_from:
  - /cloud/docs/custom-domain
---

# Changing your domain name

By default, Metabase will automatically provision a domain name for your Metabase that ends in metabaseapp.com (e.g., yourcompany.metabaseapp.com).

[Pro and Enterprise](https://www.metabase.com/pricing/) plans allow you to add a custom domain. Setting a custom domain will update your instance's [Site URL](../configuring-metabase/settings.md#site-url). The Site URL is used for things like creating links in emails, auth redirects, and in some embedding scenarios.

## Add a custom domain to your Metabase

To add a custom domain to your Metabase:

1. Log in to your Metabase [Store account](https://store.metabase.com).
2. Navigate to **Instances**.
3. In the instance you want to add the custom domain to, click **Settings**.
4. Find the **Custom domain** section.
5. Enter your custom domain (e.g., `your.custom.domain`).
6. Click **Update**.
7. Ask the manager of your Domain Name System (DNS) records to add a CNAME pointing to:

   ```
   us-1.cd.metabaseapp.com
   ```

   So your CNAME record would look something like:

   ```
   CNAME    your.custom.domain    us-1.cd.metabaseapp.com
   ```

   > Enter this record where you manage your DNS records, not in the Metabase Store

8. If you've already set up SSO (like SAML or LDAP) for your Metabase, update the return URL in your identity provider configuration to include the new custom domain.

You may need to wait for the CNAME to update (this delay is specific to how DNS works, not something Metabase has control over). Metabase takes care of the rest, making sure that:

- The URL directs users to your Metabase.
- Your domain has SSL certificates set up to serve your instance over HTTPS to the new domain.
- Your [metabase.com/cloud/login](https://www.metabase.com/cloud/login) works as expected.

You'll still be able to access your original, automatically provisioned domain (e.g., `yourcompany.metabaseapp.com`), so existing embedded links should continue to work.

## Why you'd want to use a custom domain

- **White-labeling polish**: If you're white labeling Metabase, a custom domain adds another bit of polish that abstracts Metabase away from the experience you deliver to your customers.
- **Consistency**: you may have several internal tools that follow a pattern, e.g., crm.yourcompany.com, ops.yourcompany.com, etc., and you want something like stats.yourcompany.com for your Metabase.

## Change the name of your Metabase (your DNS alias)

To change your DNS alias:

1. Log in to your Metabase [Store account](https://store.metabase.com).
2. Navigate to **Instances**.
3. Find the **DNS Alias** section.
4. Enter your new alias.
5. Click **Update**.

## Custom SMTP server

By default, Metabase Cloud manages an SMTP server for you. But if you want to change the address Metabase uses to send email, you can bring your own [custom SMTP server](../configuring-metabase/email.md#custom-smtp-server-on-metabase-cloud).
