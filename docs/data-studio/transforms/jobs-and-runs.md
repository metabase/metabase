---
title: Transform jobs
summary: Run transforms on schedule.
---

# Transform jobs

_Data Studio > Jobs_

Jobs are scheduled runs of transforms based on the transform's tags.

## Transform tags

![Transform tags](../images/tags.png)

Add tags to transforms so that you can use jobs to run the transforms on a schedule. For example, you could add a "Nightly" tag to a transform, and have a job that runs all the transforms with the "Nightly" tag at midnight every day.

To add a tag to a transform:

1. Make sure you have [permissions to edit transforms](./transforms-overview.md#permissions-for-transforms).
2. Visit the transform in **Data studio > Transforms**.
3. On the **Settings** page for a transform, add transform tags.

By default, Metabase comes with hourly, daily, weekly, and monthly tags and jobs that are run on the corresponding schedules, but you can remove or rename those tags, or create new tags. To create a new tag, just type the new tag's name in **Tags** field (either when viewing a transform or when viewing a job) and select **Create a tag**.

Once you've tagged a transform, you can create a job that uses that tag to run the transform on the job's schedule.

## Jobs

_Data Studio > Jobs_

![Transform jobs](../images/jobs.png)

Jobs run one or more transforms on schedule based on transform tags.

Jobs have two components: schedule and tags.

- **Schedule** determines when the job will be executed: daily, hourly, etc. You can specify a custom cron schedule (e.g. "Every weekday at 9:05 AM"). The times are given in your Metabase's system timezone.
- **Tags** determine _which_ transforms a job runs, not when the job runs. For example, you can create a `Weekdays` tag, add that tag to a few transforms, then create a job that runs all the transforms with the `Weekdays` tag every weekday at 9:05AM.

Jobs will run all transforms tagged with any of the tags, plus any transforms that the tagged transforms depend on that aren't already up to date, see [Jobs include all dependent transforms](#jobs-include-all-dependent-transforms).

You can see which transforms a job will run and in which order on the job's page.

### See all jobs

To see all jobs, go to **Data Studio** and click the **Jobs** at the bottom of the left sidebar.

### Create a job

To create a new job:

1. Go to **Data Studio > Jobs**
2. Click the **+ New** button in the top right.
3. Specify the schedule: select one of the built-in schedules or use cron syntax to specify a custom schedule,

   ![Jobs schedule](../images/jobs-schedule.png)

   Job can use multiple tags, and will run all transforms that have _any_ of those tags. For example, you can have a job "Weekend job" that is scheduled run at noon on Saturdays and Sundays that picks up all transforms tagged either "Saturday", "Sunday", or "Weekend".

### Disable jobs

You can disable jobs without deleting them. Unlike deletion (which is permanent), disabling a job just means it won't run until you re-enable it. This is useful when you want to temporarily stop transforms from running - for example, for debugging purposes. This way you don't your lose configuration settings like tags and schedules.

To disable a specific job:

1. Go to **Data studio > Jobs**.
2. Find the job you want to disable and click the **three dots** icon to the right of the job's name.
3. Select **Disable**

To disable all jobs:

1. Go to **Data studio > Jobs**.
2. Click the **three dots** icon above the table with all the jobs, and select **Disable all**.

   ![Disable all jobs](../images/disable-all-jobs.png)

Even if you disable all jobs, new jobs will still be created enabled by default.

### Re-enable jobs

If you [disabled any jobs](#disable-jobs), you can later re-enable them:

To re-enable a specific job:

1. Go to **Data studio > Jobs**.
2. Find the job you want to re-enable and click the **three dots** icon to the right of the job's name.
3. Select **Re-enable**

To re-enable all jobs:

1. Go to **Data studio > Jobs**.
2. Click the **three dots** icon above the table with all the jobs, and select **Re-enable all**.

### Delete a job

Deleting a job will not delete any transforms.

Deleted jobs can't be restored. If you want to temporarily stop a job from running, consider disabling the job instead.

To delete a job:

1. Go to **Data Studio > Jobs**.
2. Find the job you want to delete and click the **three dots** icon to the right of the job's name.
3. Select **Delete**.

## Jobs include all dependent transforms

If one transform depends on another, Metabase adds the dependency to the job and runs it first, even if that transform isn't tagged in the job. So if transform B depends on A, Metabase will deal with A before running B.

### Metabase skips dependencies that are already up to date

Metabase won't re-run a dependency that's still fresh. That way, a transform pulled into a frequent job doesn't get rebuilt more often than its own schedule calls for. So, for example, if you tag transform A `daily`, and transform B `hourly`, and hourly B depends on daily A, then A runs on its own daily schedule. The hourly job that runs B won't rerun A every hour.

Metabase skips a dependency when the dependency:

- Has its own tags and jobs, and none of those jobs' schedules have come due since the last time the dependency ran.
- Has no tags at all, and it's already run at least once.

### See which transforms a job will run

The job's page in **Data Studio > Jobs** lists every transform the job will run and in which order. The **Notes** column tells you when Metabase will skip a dependency, and flags dependencies that have no schedule of their own.

## Runs

![Transform runs](../images/runs.png)

You can see all past and current transform runs (both manual and scheduled) by going to **Data Studio** and clicking on **Runs** at the bottom of the left sidebar. The transform run times will be given in Greenwich Mean Time (GMT).

You can click on any transform run to see more details about the run, like the error logs. To go to the transform definition from the transform run page, click on the icon next the transform name in the right sidebar.

The "Tags" column in the **Runs** table will only show the transform's specific tags. But the run might not have anything to do with those tags. Another job with different tags could have run the transform because [jobs include all dependent transforms](#jobs-include-all-dependent-transforms).

## Emails about failed transforms

If your Metabase is [set up to send email](../../configuring-metabase/email.md), Metabase will let people know when transforms fail.

- **Individual transform failures**: when a transform fails during a job, Metabase emails the person who created or last edited that transform.
- **Daily digest of job failures**: each morning, Metabase emails all admins a summary of the scheduled job runs that failed or timed out the previous day. For each job, the digest lists how many runs failed, when the failures started, and the most recent error. Manual runs aren't included in the digest, and Metabase skips the email entirely if no scheduled runs failed.

To dig into a failure, click through to the job from the digest, or go to **Data Studio > Runs** and open the run to see its error logs.
