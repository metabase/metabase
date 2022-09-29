---
title: SAML with Google
redirect_from:
  - /docs/latest/enterprise-guide/saml-google
---

# SAML with Google

{% include plans-blockquote.html feature="Google SAML authentication" %}

1. Set up a [custom SAML app](https://support.google.com/a/answer/6087519) in your [Google admin console](https://admin.google.com).
2. As you follow Google's instructions, you'll need to:
  - [Save information about Google for Metabase](#saving-google-idp-info-for-metabase).
  - [Provide Google info to Metabase](#filling-out-the-metabase-saml-form).
  - [Provide Metabase info to Google ](#filling-out-service-provider-details).
  - [Set up attribute mappings in Google](#setting-up-attribute-mappings).

See [authenticating with SAML](./authenticating-with-saml.md) for general SAML info.

## Saving Google IdP info for Metabase

On the **Google Identity Provider details** page:

1. Download the **IdP metadata**.
2. Copy the **SSO URL**.
3. Download the **certificate**.

## Filling out the Metabase SAML form

1. From your Google **IdP metadata**, locate the **issuer**.
   - The **issuer** looks like this: `https://accounts.google.com/o/saml2/`.
2. Go to your Metabase SAML form (**Admin settings** > **Authentication** > **SAML**).
2. Put the **issuer** in the Metabase **SAML Identity Provider Issuer** field.
3. Put the **SSO URL** in the Metabase **SAML Identity Provider URL** field.
4. Paste the **certificate** in the Metabase **SAML Identity Provider Certificate** field.
  - Make sure to include any header and footer comments (like `---BEGIN CERTIFICATE---`).

## Filling out service provider details

On the **Service provider details** page:

1. Put the Metabase **URL the IdP should redirect to** in the Google **ACS URL** field.
2. Put the Metabase **SAML Application Name** in the Google **Entity ID** field.
   - The **SAML Application Name** can be anything you like (e.g., "yourcompany-metabase").
3. **Start URL** and **Signed response** are optional fields.

## Setting up attribute mappings

On the **Attribute mappings** page, you'll need to add "First name", "Last name", and "Email" as attributes, so that Google can pass them to Metabase during authentication.

For example, to add the attribute "First name":

1. Click **Add another mapping**.
2. Under **Google Directory attributes**, choose **Basic information** > **First name** as the attribute field name.
3. Go to your Metabase SAML form, and look for **SAML attributes** > **User's first name attribute**.
   - The attribute looks like this: `http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname`.
4. Paste the **User's first name attribute** under your Google **App attributes**.
5. Repeat steps 1-3 for the attributes "Last name" and "Email".

## Troubleshooting SAML issues

- [Troubleshooting SAML](../troubleshooting-guide/saml.md).
