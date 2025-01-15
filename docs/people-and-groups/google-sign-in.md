---
title: Google Sign-In
redirect_from:
  - /docs/latest/administration-guide/10-single-sign-on
  - /docs/latest/people-and-groups/google-and-ldap
---

# Google Sign-In

Enabling [Google Sign-In](https://developers.google.com/identity/sign-in/web/sign-in) for single sign-on (SSO) lets your team log in with a click instead of using email and password. SSO can also be used to let people create Metabase accounts without asking an admin to add each person manually. You can find SSO options under **Settings** > **Admin settings** > **Authentication**.

If you'd like to have people authenticate with [SAML][saml-docs] or [JWT][jwt-docs], Metabase's [Pro and Enterprise](https://www.metabase.com/pricing) let you do just that.

## Enabling Google Sign-In

Google Sign-In is a good option for SSO if:

- Your team is already using Google Workspace, or
- You'd like to use Google's 2-step or multi-factor authentication (2FA or MFA) to secure your Metabase.

## Get your Client ID from the Google developer console

To let your team start signing in with Google, you’ll first need to create an application through Google’s [developer console](https://console.developers.google.com/projectselector2/apis/library).

Next, you'll have to create authorization credentials and [get a Google API Client ID](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid):

- In the `Authorized JavaScript origins` section, specify the URI of your Metabase instance.
- Leave the `Authorized Redirect URIs` section blank.
- Copy your Client ID, which you'll paste into Metabase when setting up Google Sign-in.

## Setting up Google Sign-in in Metabase

Once you have your Google API `Client ID` (ending in `.apps.googleusercontent.com`), visit your Metabase and:

1. Click on the settings **Gear** icon in the upper right.
2. Select **Admin settings**.
3. In the **Settings** tab, click on **Authentication**.
4. On the **Sign in with Google** card, click **Set up**.
5. In the **Client ID** field, paste your Google API Client ID.

## Creating Metabase accounts with Google Sign-in

> On [paid plans](https://www.metabase.com/pricing), you're [charged for each active account](https://www.metabase.com/docs/latest/cloud/how-billing-works#what-counts-as-a-user-account).

If people's Google account email addresses are from a specific domain, and you want to allow them to sign up on their own, you can enter that domain in the **Domain** field.

Once set up, existing Metabase users signed in to a Google account that matches the email they used to set up their Metabase account will be able to sign in with just a click.

Note that Metabase accounts _created_ with Google Sign-In will not have passwords; they must use Google to sign in to Metabase.

## Multiple domains for Google Sign-in

{% include plans-blockquote.html feature="Multiple domains for Google Sign-in" %}

If you're on a [pro](https://www.metabase.com/product/pro) or [Enterprise](https://www.metabase.com/product/enterprise) plan, you can specify multiple domains in the **Domain** field, separated by a comma. For example, `mycompany.com,example.com.br,otherdomain.co.uk`.

## Syncing user attributes with Google

User attributes can't be synced with regular Google Sign-In. To synchronize user attributes, you'll need to set up [Google SAML][google-saml-docs] or [JWT][jwt-docs] instead.

[data-sandboxing-docs]: ../permissions/data-sandboxes.md
[google-saml-docs]: ./saml-google.md
[jwt-docs]: ./authenticating-with-jwt.md
[saml-docs]: ./authenticating-with-saml.md
[user-attributes-docs]: ../permissions/data-sandboxes.md#choosing-user-attributes-for-data-sandboxes
[user-attributes-def]: https://www.metabase.com/glossary/attribute#user-attributes-in-metabase
