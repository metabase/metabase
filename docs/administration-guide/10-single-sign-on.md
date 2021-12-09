# Authenticating with Google Sign-In or LDAP

Enabling [Google Sign-In](#enabling-google-sign-in) or [LDAP](#enabling-ldap-authentication) lets your team log in with a click instead of using email and password, and can optionally let them sign up for Metabase accounts without an admin having to create them first. You can find these options in the **Settings** section of the **Admin Panel**, under **Authentication**.

If you'd like to have your users authenticate with SAML or JWT, Metabase's [paid plans](https://www.metabase.com/pricing) let you do just that. Learn more about authenticating with [SAML](../enterprise-guide/authenticating-with-saml.md) or [JWT](../enterprise-guide/authenticating-with-jwt.md).

As time goes on we may add other auth providers. If you have a service you’d like to see work with Metabase please let us know by [filing an issue](http://github.com/metabase/metabase/issues/new).

## Enabling Google Sign-In

To let your team start signing in with Google you’ll first need to create an application through Google’s [developer console](https://console.developers.google.com/projectselector2/apis/library).

Next, you'll have to create authorization credentials for your application by following [the instructions from Google here](https://developers.google.com/identity/sign-in/web/sign-in#create_authorization_credentials). Specify the URI of your Metabase instance in the “Authorized JavaScript origins” section. You should leave the “Authorized Redirect URIs” section blank.

Once you have your `client_id` (ending in `.apps.googleusercontent.com`), click `Configure` on the "Sign in with Google" section of the Authentication page in the Metabase Admin Panel. Paste your `client_id` into the first box.

Now existing Metabase users signed into a Google account that matches their Metabase account email can sign in with just a click.

###  Enabling account creation with Google Sign-In

If you’ve added your Google client ID to your Metabase settings, you can also let users sign up on their own without creating accounts for them.

To enable this, go to the Google Sign-In configuration page, and specify the email domain you want to allow. For example, if you work at WidgetCo you could enter `widgetco.com` in the field to let anyone with a company email sign up on their own.

Note that Metabase accounts created with Google Sign-In do not have passwords and must use Google to sign in to Metabase.

## Enabling LDAP authentication

In the **Admin** > **Authentication** tab, go the the LDAP section and click **Configure**. Fill out the form with the information about your LDAP server:

- hostname
- port
- security settings
- LDAP admin username
- LDAP admin password

Then save your changes.

Metabase will pull out three main attributes from your LDAP directory:

- email (defaulting to the `mail` attribute)
- first name (defaulting to the `givenName` attribute)
- last name (defaulting to the `sn` attribute). 
  
If your LDAP setup uses other attributes for these, you can edit this under the "Attributes" portion of the form.

![Attributes](./images/ldap-attributes.png)

Your LDAP directory must have the email field populated for each entry that will become a Metabase user, otherwise Metabase won't be able to create the account, nor will that person be able to log in. If either name field is missing, Metabase will use a default of "Unknown," and the person can change their name in their [account settings](../users-guide/account-settings.md).

### LDAP user schema

The **User Schema** section on this same page is where you can adjust settings related to where and how Metabase connects to your LDAP server to authenticate users.

The **User search base** field should be completed with the *distinguished name* (DN) of the entry in your LDAP server that is the starting point when searching for users.

For example, let's say you're configuring LDAP for your company, WidgetCo, where your base DN is `dc=widgetco,dc=com`. If entries for employees are all stored within an organizational unit in your LDAP server named `People`, you'll want to supply the user search base field with the DN `ou=People,dc=widgetco,dc=com`. This tells Metabase to begin searching for matching entries at that location within the LDAP server.

You'll see the following grayed-out default value in the **User filter** field:

`(&(objectClass=inetOrgPerson)(|uid={login})(mail={login})` 

When a person logs into Metabase, this command confirms that the login they supplied matches either a UID *or* email field in your LDAP server, *and* that the matching entry has an objectClass of `inetOrgPerson`.

This default command will work for most LDAP servers, since `inetOrgPerson` is a widely-adopted objectClass. But if your company for example uses a different objectClass to categorize employees, this field is where you can set a different command for how Metabase finds and authenticates an LDAP entry upon a person logging in.

### Syncing user attributes

{% include plans-blockquote.html %}

If you're running [Metabase Pro or Enterprise Edition](https://www.metabase.com/pricing) and using [data sandboxes](../enterprise-guide/data-sandboxes.md), you can utilize existing LDAP [user attributes](../enterprise-guide/data-sandboxes.html#getting-user-attributes) when granting sandboxed access.

### Group mapping

Manually assigning people to [groups](05-setting-permissions.html#groups) in Metabase after they've logged in via SSO can get tedious. Instead, you can take advantage of the groups that already exist in your LDAP directory by enabling [group mappings](/learn/permissions/ldap-auth-access-control.html#group-management). 

Scroll to **Group Schema** on the same LDAP settings page, and click the toggle to enable group mapping. Selecting **Edit Mapping** will bring up a modal where you can create and edit mappings, specifying which LDAP group corresponds to which Metabase group.

As you can see below, if you have an **Accounting** group in both your LDAP server and Metabase instance, you'll just need to supply the Distinguished Name from your LDAP server (in the example, it's `cn=Accounting,ou=Groups,dc=widgetco,dc=com`) and select its match from the dropdown of your existing Metabase groups.

![Group Mapping](images/ldap-group-mapping.png)

Note that updates to a person's group membership based on LDAP mappings will only take effect once they have logged into Metabase again after the update.

For a tutorial on setting up LDAP in Metabase, check out this [Learn lesson](/learn/permissions/ldap-auth-access-control.html). If you run into an issue, our [LDAP troubleshooting guide](../troubleshooting-guide/ldap.md) can help.

---

## Next: setting data permissions
Find out how to create user groups and define what data they can access with [permissions](05-setting-permissions.md).
