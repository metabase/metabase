---
title: LDAP
---

# LDAP

Metabase supports authentication with Lightweight Directory Access Protocol (LDAP).

You can find SSO options under **Admin settings** > **Settings** > **Authentication**.

## Required LDAP attributes

You need to set up your LDAP directory with these attributes:

- email (defaulting to the `mail` attribute)
- first name (defaulting to the `givenName` attribute)
- last name (defaulting to the `sn` attribute).

If your LDAP setup uses other attributes for these, you can edit this under the "Attributes" portion of the form.

![Attributes](./images/ldap-attributes.png)

Your LDAP directory must have the email field populated for each entry that will become a Metabase user, otherwise Metabase won't be able to create the account, nor will that person be able to log in. If either name field is missing, Metabase will use a default of "Unknown," and the person can change their name in their [account settings](./account-settings.md).

## Enabling LDAP authentication

In the **Admin settings** > **Settings** > **Authentication** tab, go to the LDAP section and click **Set up**. Click the toggle at the top of the form to enable LDAP, then fill out the form with the relevant details.

## User provisioning

When a person logs in via LDAP, Metabase can create a Metabase account for them automatically (if they don't already have a Metabase account).

## Server settings

- LDAP Host. Your server name. E.g., ldap.yourdomain.org
- LDAP Port. The Server port, usually 389 or 636 if SSL is used.
- LDAP Security settings. Options are None, SSL, or StarTLS.
- LDAP admin username. The distinguished name to bind as (if any). This user will be used to look up information about other users.
- LDAP admin password.

Then save your changes. Metabase will automatically pull the [required attributes](#required-ldap-attributes) from your LDAP directory.

## User schema

The **User Schema** section on this same page is where you can adjust settings related to where and how Metabase connects to your LDAP server to authenticate users.

### User search base

The **User search base** field should be completed with the _distinguished name_ (DN) of the entry in your LDAP server that is the starting point when searching for users.

For example, let's say you're configuring LDAP for your company, WidgetCo, where your base DN is `dc=widgetco,dc=com`. If entries for employees are all stored within an organizational unit in your LDAP server named `People`, you'll want to supply the user search base field with the DN `ou=People,dc=widgetco,dc=com`. This tells Metabase to begin searching for matching entries at that location within the LDAP server.

### User filter

You'll see the following grayed-out default value in the **User filter** field:

```
(&(objectClass=inetOrgPerson)(|(uid={login})(mail={login})))
```

When a person logs into Metabase, this command confirms that the login they supplied matches either a UID _or_ email field in your LDAP server, _and_ that the matching entry has an objectClass of `inetOrgPerson`.

This default command will work for most LDAP servers, since `inetOrgPerson` is a widely-adopted objectClass. But if your company for example uses a different objectClass to categorize employees, this field is where you can set a different command for how Metabase finds and authenticates an LDAP entry upon a person logging in.

## LDAP group mapping

Manually assigning people to [groups](./managing.md#groups) in Metabase after they've logged in via SSO can get tedious. Instead, you can take advantage of the groups that already exist in your LDAP directory by enabling [group mappings](https://www.metabase.com/learn/metabase-basics/administration/permissions/ldap-auth-access-control#group-management).

Scroll to **Group Schema** on the same LDAP settings page, and click the toggle to enable group mapping. Selecting **Edit Mapping** will bring up a modal where you can create and edit mappings, specifying which LDAP group corresponds to which Metabase group.

As you can see below, if you have an **Accounting** group in both your LDAP server and Metabase instance, you'll just need to supply the Distinguished Name from your LDAP server (in the example, it's `cn=Accounting,ou=Groups,dc=widgetco,dc=com`) and select its match from the dropdown of your existing Metabase groups.

![Group Mapping](images/ldap-group-mapping.png)

Some things to keep in mind regarding group mapping:

- The Administrator group works like any other group.
- Updates to a person's group membership based on LDAP mappings are not instantaneous; the changes will take effect only _after_ people log back in.
- People are only ever added to or removed from mapped groups; the sync has no effect on groups in your Metabase that don't have an LDAP mapping.

## LDAP group membership filter

{% include plans-blockquote.html feature="LDAP advanced features" %}

Group membership lookup filter. The placeholders {dn} and {uid} will be replaced by the user's Distinguished Name and UID, respectively.

## Syncing user attributes with LDAP

{% include plans-blockquote.html feature="LDAP advanced features" %}

You can manage [user attributes][user-attributes-def] such as names, emails, and roles from your LDAP directory. When you set up [data sandboxing][data-sandboxing-docs], your LDAP directory will be able to [pass these attributes][user-attributes-docs] to Metabase.

## Troubleshooting login issues

- [Can't log in](../troubleshooting-guide/cant-log-in.md).
- [Troubleshooting LDAP](../troubleshooting-guide/ldap.md)

## Further reading

- [Using LDAP for authentication and access control](https://www.metabase.com/learn/metabase-basics/administration/permissions/ldap-auth-access-control).
- [Permissions overview](../permissions/start.md).

[data-sandboxing-docs]: ../permissions/data-sandboxes.md
[google-saml-docs]: ./saml-google.md
[jwt-docs]: ./authenticating-with-jwt.md
[saml-docs]: ./authenticating-with-saml.md
[user-attributes-docs]: ../permissions/data-sandboxes.md#choosing-user-attributes-for-data-sandboxes
[user-attributes-def]: https://www.metabase.com/glossary/attribute#user-attributes-in-metabase
