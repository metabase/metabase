# Running Metabase on Heroku

Heroku is a great place to evaluate Metabase and take it for a quick spin with just a click of a button and a couple minutes of waiting time.  If you decide to keep your Metabase running long term we recommend some upgrades as noted below to avoid limitations of the Heroku free tier.


### Launching Metabase

Before doing anything you should make sure you have a [Heroku](http://www.heroku.com) account that you can access.

If you've got a Heroku account then all there is to do is follow this one-click deployment button

[![Deploy to Heroku](https://www.herokucdn.com/deploy/button.svg)](http://downloads.metabase.com/launch-heroku.html)

This will launch a Heroku deployment using a GitHub repository that Metabase maintains.

It should only take a few minutes for Metabase to start. You can check on the progress by viewing the logs at [https://dashboard.heroku.com/apps/YOUR_APPLICATION_NAME/logs](https://dashboard.heroku.com/apps/YOUR_APPLICATION_NAME/logs) or using the Heroku command line tool with the `heroku logs -t -a YOUR_APPLICATION_NAME` command.


### Upgrading beyond the `Free` tier

Heroku is very kind and offers a free tier to be used for very small/non-critical workloads which is great if you just want to evaluate Metabase and see what it looks like.  If you like what you see and decide to use Metabase as an ongoing part of your analytics workflow we recommend these upgrades which are quite affordable and will allow you to fully utilize all of Metabase's capabilities without running into annoying limitations.

1. Upgrade your dyno to the `Hobby` tier or one of the professional `Standard` 1x/2x dynos.  The most important reason for this is that your dyno will never sleep and that allows Metabase to run all of its background work such as sending Pulses, syncing metadata, etc, in a reliable fashion.

2. Upgrade your Postgres database to the `Basic` package or for more peace of mind go for the `Standard 0` package.  The primary reason for this upgrade is to get more than the minimum number of database rows offered in the free tier (10k), which we've had some users exhaust within a week.  You'll also get better overall performance along with backups, which we think is worth it.


### Known Limitations

 * Heroku’s 30 second timeouts on all web requests can cause a few issues if you happen to have longer running database queries.  Most people don’t run into this but be aware that it’s possible.
 * When using the `free` tier, if you don’t access the application for a while Heroku will sleep your Metabase environment.  This prevents things like Pulses and Metabase background tasks from running when scheduled and at times makes the app appear to be slow when really it's just Heroku reloading your app.  You can resolve this by upgrading to the `hobby` tier or higher.
 * Sometimes Metabase may run out of memory and you will see messages like `Error R14 (Memory quota exceeded)` in the Heroku logs. If this happens regularly we recommend upgrading to the `standard-2x` tier dyno.

Now that you’ve installed Metabase, it’s time to [set it up and connect it to your database](../setting-up-metabase.md).


### Troubleshooting

* If your Metabase instance is getting stuck part way through the initialization process and only every shows roughly 30% completion on the loading progress.
    * The most likely culprit here is a stale database migrations lock that was not cleared.  This can happen if for some reason Heroku kills your Metabase dyno at the wrong time during startup.  __To fix it:__ you can either clear the lock using the built-in [release-locks](start.html#metabase-fails-to-startup) command line function, or if needed you can login to your Metabase application database directly and delete the row in the `DATABASECHANGELOGLOCK` table.  Then just restart Metabase.


# Deploying New Versions of Metabase

Upgrading to the next version of Metabase is a simple process where you will grab the latest version of [metabase-deploy](https://github.com/metabase/metabase-deploy) and push it to Heroku.

Here's each step:

* Clone the latest version to your local machine:

```bash
git clone https://github.com/metabase/metabase-deploy.git  
cd metabase-deploy
```

* Add a git remote with your metabase setup:

```bash
git remote add heroku https://git.heroku.com/your-metabase-app.git
```

* If you are upgrading from a version that is lower than 0.25, add the Metabase buildpack to your Heroku app:
```
heroku buildpacks:add https://github.com/metabase/metabase-buildpack
```

* Force push the new version to Heroku:

```bash
git push -f heroku master
```

* Wait for the deploy to finish

* If there have been no new changes to the metabase-deploy repository, you will need to add an empty commit. This triggers Heroku to re-deploy the code, fetching the newest version of Metabase in the process.

```bash
git commit --allow-empty -m "empty commit"
git push -f heroku master
```
