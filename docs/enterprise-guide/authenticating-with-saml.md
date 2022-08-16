---
title: Authenticating with SAML
---

# Authenticating with SAML

{% include plans-blockquote.html feature="SAML authentication" %}

The open source edition of Metabase includes the option to set up [single sign-on (SSO)](../administration-guide/sso.html) with [Google Sign-in or LDAP](../administration-guide/10-single-sign-on.html), but the [some plans](https://www.metabase.com/pricing) let you connect your SAML- or [JWT](../enterprise-guide/authenticating-with-jwt.html)-based SSO. Integrating your SSO with Metabase allows you to:

- automatically pass user attributes from your SSO to Metabase in order to power data sandboxes
- let your users access Metabase without re-authenticating.

## Table of contents

<div class='doc-toc' markdown=1>
- [Turning on SAML-based SSO](#turning-on-saml-based-sso).
- [Setting up SAML with your IdP](#setting-up-saml-with-your-idp).
- [Generic SAML configuration](#generic-saml-configuration).
  - [URL the IdP should redirect back to](#url-the-idp-should-redirect-back-to).
  - [User attributes](#user-attributes).
  - [Settings for signing SSO requests (optional)](#settings-for-signing-sso-requests-optional).
- [Enabling SAML authentication in Metabase](#enabling-saml-authentication-in-metabase).
  - [SAML identity provider URL](#saml-identity-provider-url).
  - [SAML identity provider issuer](#saml-identity-provider-issuer).
  - [SAML identity provider certificate](#saml-identity-provider-certificate).
  - [Settings for signing SSO requests (optional)](#settings-for-signing-sso-requests-optional-1).
- [Synchronizing group membership with your IdP](#synchronizing-group-membership-with-your-idp).
- [Configuring the group schema in Metabase](#configuring-the-group-schema-in-metabase).
- [Disabling password log-in](#disabling-password-log-in).
- [New user notification emails](#new-user-notification-emails).
- [Example code using SAML](#example-code-using-saml).
- [Troubleshooting SAML issues](#troubleshooting-saml-issues).
</div>

## Turning on SAML-based SSO

Before beginning your SAML set-up, make sure you know the password for your Metabase admin account. If anything becomes misconfigured during the set-up process, an "Admin backup login" option on the sign-in screen is available.

To get started, head over to the Settings section of the Admin Panel, then click on the **Authentication** tab. Click the **Configure** button in the SAML section of the Authentication page, and you'll see this form:

![SAML form](images/saml-form.png)

At the top, **make sure to click the toggle to enable SAML authentication**, otherwise things won't work even if all of your settings are right.

The form itself is broken up into three parts:

1. [Metabase info that you'll have to input into your identity provider (IdP)](#setting-up-saml-with-your-idp).
2. [IdP info that you'll need to tell Metabase about](#enabling-saml-authentication-in-metabase).
3. [Signing SSO requests (optional)](#settings-for-signing-sso-requests-optional).

## Setting up SAML with your IdP

First you'll need to make sure things are configured correctly with your IdP. Each IdP handles SAML setup differently.

We've written up some guides for the most common providers:

- [Setting up SAML with Auth0](saml-auth0.html)
- [Setting up SAML with Azure AD](authenticating-with-saml-azure-ad.html)
- [Setting up SAML with Google](saml-google.html)
- [Setting up SAML with Keycloak](saml-keycloak.html)
- [Setting up SAML with Okta](saml-okta.html)

**If you don't see your IdP listed here:**

- Refer to your IdP's reference docs on configuring SAML. You'll be looking for something like this [OneLogin SAML guide](https://onelogin.service-now.com/support?id=kb_article&sys_id=83f71bc3db1e9f0024c780c74b961970).
- Fill out your IdP's SAML form using the information found on the [Metabase SAML form](#turning-on-saml-based-sso).
- For more information, see the next section on [Generic SAML configuration](#generic-saml-configuration).

## Generic SAML configuration

The top portion of the [SAML form in Metabase](#turning-on-saml-based-sso) has the information you'll need to fill out your IdP's SAML form, with buttons to make copying the information easy.

However, the names of the fields in the Metabase SAML form won't always match the names used by your IdP. We've provided a description of each field below to help you map information from one place to another.

### URL the IdP should redirect back to

The redirect URL is the web address that people will be sent to after signing in with your IdP. To redirect people to your Metabase, your redirect URL should be your Metabase [Site URL](../administration-guide/08-configuration-settings.html#site-url), with `/auth/sso` at the end.

For example, if your Metabase Site URL is `https://metabase.yourcompany.com`, you'll use `https://metabase.yourcompany.com/auth/sso` as the redirect URL in your IdP's SAML form.

Different IdPs use different names for the redirect URL. Here are some common examples:

| Provider                       | Name                     |
| ------------------------------ | ------------------------ |
| [Auth0](saml-auth0.html)       | Application Callback URL |
| [Okta](saml-okta.html)         | Single Sign On URL       |
| OneLogin                       | ACS (Consumer) URL       |

### User attributes

Metabase will automatically log in people who've been authenticated by your SAML identity provider. In order to do so, the first assertion returned in the identity provider's SAML response _must_ contain attributes for each person's first name, last name, and email.

Most IdPs already include these assertions by default, but some (such as [Okta](saml-okta.html)) must be configured to include them.

Generally you'll need to paste these user attributes (first name, last name, and email) into fields labelled "Name", "Attributes" or "Parameters".

**End-users should not be able to edit the email address attribute**. Your IdP will pass the email address attribute to Metabase in order to log people into their Metabase accounts (or to create an account on the first login). If a person can change the email address attribute, they'll potentially be able to access Metabase accounts other than their own.

### Settings for signing SSO requests (optional)

These are additional settings you can fill in to sign SSO requests to ensure they don’t get tampered with.

## Enabling SAML authentication in Metabase

Metabase will now need to know some things about your IdP. Here's a breakdown of each of the settings:

### SAML Identity Provider URL

Metabase will redirect login requests to the Identity Provider URL, where people will go to log in with SSO.

Different IdPs use different names for the Identity Provider URL. Here are some common examples:

| Provider                       | Name                                 |
| ------------------------------ | ------------------------------------ |
| [Auth0](saml-auth0.html)       | Identity Provider Login URL          |
| [Okta](saml-okta.html)         | Identity Provider Single-Sign On URL |
| OneLogin                       | SAML 2.0 Endpoint (HTTP)             |

### SAML Identity Provider Issuer

This is a unique identifier for the IdP. You might also see it referred to as "Entity ID" or "Issuer". Assertions from the IdP will contain this information, and Metabase will verify that it matches the value you set.

We recommend that you set this value to make your SAML configuration more secure.

| Provider                       | Name                        |
| ------------------------------ | --------------------------- |
| [Auth0](saml-auth0.html)       | Identity Provider Login URL |
| [Okta](saml-okta.html)         | Identity Provider Issuer    |
| OneLogin                       | Issuer URL                  |

### SAML Identity Provider Certificate

This is an encoded certificate that Metabase will use when connecting to the IdP URI. The certificate will look like a big blob of text that you'll want to copy and paste carefully — the spacing is important!

Your IdP might have you download this certificate as a file (usually `.cer` or `.pem`), which you'll then need to open up in a text editor in order to copy the contents to then paste into the box in Metabase.

Note that your certificate text may include header and footer comments that look like `-----BEGIN CERTIFICATE-----` and `-----END CERTIFICATE-----`. These comments should be included when pasting your certificate text into Metabase.

| Provider                       | Name                |
| ------------------------------ | ------------------- |
| [Auth0](saml-auth0.html)       | Signing Certificate |
| [Okta](saml-okta.html)         | X.509 Certificate   |
| OneLogin                       | X.509 Certificate   |

### Settings for signing SSO requests (optional)

These are additional settings you can fill in to sign SSO requests to ensure they don’t get tampered with. In addition, if your IdP encrypts SAML responses, you'll need to ensure this section is filled out.

_Important note:_ If you change any of these settings, either during initial setup or after editing an existing value, you will need to restart Metabase due to the way the keystore file is read.

**SAML keystore path:** the absolute path to the keystore file to use for signing SAML requests.

**SAML keystore password:** if it wasn't already self-evident, this is just the password for opening the keystore.

**SAML keystore alias:** the alias for the key that Metabase should use for signing SAML requests.

## Synchronizing group membership with your IdP

This setting allows you to assign users to Metabase groups based on an attribute of your users in your IdP. Please note that this may not correlate to group functionality provided by your IdP — you may need to create a separate attribute on your users to set their Metabase group, like `metabaseGroups`.

First, you will need to create a SAML user attribute that you will use to indicate which Metabase groups the user should be a part of. This created user attribute can be a XML string or a list of XML strings. Different IdPs have different ways of handling this, but you will likely need to edit your user profiles or find a way to map a user's groups to a list of Metabase group names.

## Configuring the group schema in Metabase

Once you've gotten everything set up in your SAML provider, there are just a few simple steps on the Metabase side.

To start, make sure the toggle to synchronize group memberships is set to "Enabled." Then, click Edit Mappings > Create a Mapping. Enter in the name of one of the groups you entered as your `metabaseGroups` attribute values, then click the Add button. Next click the dropdown that appears under the `Groups` heading to select the Metabase group(s) that users with this particular `metabaseGroups` value should be added to. Then click Save.

After that, type in the name of the user attribute you added in your SAML provider. In this case, we told Okta that the `metabaseGroups` attribute should be named `MetabaseGroupName`, so that's what we'll enter in the Group Attribute Name field in Metabase.

![Group schema](images/saml-group-schema.png)

## Disabling password log-in

Once you have configured SAML authentication, you can choose to disable the option for users to log in via email and password. To do this, return to the main Authentication settings page and scroll to the bottom. A toggle will now be visible allowing you to disable password authentication.

![Password disable](images/password-disable.png)

## New user notification emails

When users log in to Metabase for the first time via SSO, this will automatically create a Metabase account for them, which will trigger an email notification to Metabase administrators. If you don't want these notifications to be sent, you can turn this toggle off at the bottom of the Authentication page.

## Example code using SAML

You can find example code that uses SAML authentication in the [SSO examples repository](https://github.com/metabase/sso-examples).

## Troubleshooting SAML issues

For common issues, go to [Troubleshooting SAML](../troubleshooting-guide/saml.html).
