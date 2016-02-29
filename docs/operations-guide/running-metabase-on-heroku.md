# Running Metabase on Heroku

Metabase is currently offering beta support for Heroku deployments and planning to improve support for Heroku going forward.  Metabase will deploy and run fine on Heroku but there are a few limitations.


### Launching Metabase

Before doing anything you should make sure you have a [Heroku](http://www.heroku.com) account that you can access.

If you've got a Heroku account then all there is to do is follow this one-click deployment button

[![Deploy to Heroku](https://www.herokucdn.com/deploy/button.svg)](http://downloads.metabase.com/launch-heroku.html)

This will launch a Heroku deployment using a github repository that Metabase maintains.


### Known Issues

 * Heroku’s 30 second timeouts on all web requests can cause a few issues if you happen to have longer running database queries.  Most people don’t run into this but be aware that it’s possible.
 * If you don’t access the application for a while Heroku will sleep your Metabase environment.  This prevents things like Pulses and Metabase background tasks from running when scheduled and at times makes the app appear to be slow when really it's just Heroku reloading your app.

Now that you’ve installed Metabase, it’s time to [set it up and connect it to your database](../setting-up-metabase.md).


### Troubleshooting

* If your Metabase instance is getting stuck part way through the initialization process and only every shows roughly 30% completion on the loading progress.
    * The most likely culprit here is a stale database migrations lock that was not cleared.  This can happen if for some reason Heroku kills your Metabase dyno at the wrong time during startup.  __To fix it:__ you can either clear the lock using the built-in [release-locks](start.md#metabase-fails-to-startup) command line function, or if needed you can login to your Metabase application database directly and delete the row in the `DATABASECHANGELOGLOCK` table.  Then just restart Metabase.


# Deploying New Versions of Metabase

Upgrading to the next version of Metabase is a simple process where you will grab the latest version of [metabase-deploy](https://github.com/metabase/metabase-deploy) and push it to Heroku.

Here's each step:

* Clone the latest version to your local machine:
```
git clone https://github.com/metabase/metabase-deploy.git
cd metabase-deploy
```
* Add a git remote with your metabase setup:
```
git remote add heroku https://git.heroku.com/your-metabase-app.git
```
* Force push the new version to Heroku:
```
git push -f heroku master
```
* Wait for the deploy to finish
