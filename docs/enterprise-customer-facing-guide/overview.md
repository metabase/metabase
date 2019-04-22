## An overview of setting up your instance for customers

Before we start, this guide assumes that you have some customers, clients, or partners that you're trying to provide analytics for. Specifically, you're trying to put analytics in your own web app, or you're wanting to allow customers to log into a Metabase instance in a sandboxed way.

To get this to happen you'll need to set up your SSO to let your customers access Metabase and to provide Metabase with customer attributes in order to automatically filter the data they access based on who they are with data sandboxes. Then you'll need to embed Metabase in your web app, or set up your instance to allow customers to log in. We'll also go over customizing chart colors to match your web app or branding.

### Enabling enterprise features

First off, make sure that you're running the Enterprise edition of Metabase (distinct from the open-source version). After going through the initial setup form, to activate all the enterprise features go to the Admin Panel by clicking the top-right menu, then the Enterprise tab. From there, enter the token that you received in your email after either signing up for the free trial or after purchasing your enterprise license.

---

## First: Setting up Single Sign-On

We'll show you [how to connect your SAML- or JWT-based SSO](setting-up-sso.md) to Metabase so that your customers can seamlessly authenticate.
