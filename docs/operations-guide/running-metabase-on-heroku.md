# Running Metabase on Heroku

Metabase is currently offering beta support for Heroku deployments and planning to improve support for Heroku going forward.  Metabase will deploy and run fine on Heroku but there are a few limitations.


### Launching Metabase

Before doing anything you should make sure you have a [Heroku](http://www.heroku.com) account that you can access.

If you've got a Heroku account then all there is to do is follow this one-click deployment button

[![Deploy to Heroku](https://www.herokucdn.com/deploy/button.svg)](http://downloads.metabase.com/launch-heroku.html)

This will launch a Heroku deployment using a github repository that Metabase maintains.


### Known Issues

 * Sometimes the app boots slowly on Heroku instances and fails to fully start within 60 seconds which results in a failed launch.  Just watch out for this and retry if it happens.
 * Heroku’s 30 second timeouts on all web requests can cause a few issues if you happen to have longer running database queries.  Most people don’t run into this but be aware that it’s possible.
 * If you don’t access the application for a while Heroku will sleep your Metabase environment.  This won’t harm anything, but it can seem like the application is slow to respond when actually it’s just Heroku waking up the environment.

Now that you’ve installed Metabase, it’s time to [set it up and connect it to your database](../setting-up-metabase.md).
