## Single Sign-On with Google

Enabling single sign-on lets your team log in with a click instead of using email and password and can optionally let them sign up for Metabase accounts without an admin having to create them first.

Currently Metabase works with Google accounts for single sign-on. As time goes on we may add other auth providers. If you have a service you’d like to see work with Metabase please let us know by [filing an issue](http://github.com/metabase/metabase/issues/new).

### Enabling Sign in

To let your team start signing in with Google you’ll first need to create an application through Google’s [developer console](https://console.developers.google.com/projectselector/apis/library).

To create a new application follow [the instructions from Google here](https://developers.google.com/identity/sign-in/web/devconsole-project).

Note that when creating the app you only need to specify the url of your Metabase install in the “Javascript Origins” field. You should leave the “redirect-url” blank.

Once you have your client_id, copy and paste it into the box on the Single Sign-On sections of your Metabase Admin settings page. ```XXXXXXXXXXXXXXXXXXXXX.apps.googleusercontent.com```

Now existing Metabase users signed into a Google account that matches their Metabase account email can sign in with just a click.

###  Enabling Sign up

If you’ve added your Google client id to your Metabase settings you can also let users sign up on their own without creating accounts for them.

To enable this, check the box on the Single Sign-On Admin Settings page and specify the email domain you want to allow. For example if you work at WidgetCo you could enter widgetco.com in the field to let anyone with a company email sign up on their own.

Note: Metabase accounts created with Single Sign-On do not have passwords and must use Google to sign in to Metabase.


---

## Next: Creating a Getting Started Guide
Learn how to easily [make a Getting Started Guide](11-getting-started-guide.md) for your team.
