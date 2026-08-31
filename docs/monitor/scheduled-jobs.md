---
title: Scheduled jobs
summary: View the recurring jobs Metabase runs automatically, and the triggers that determine when each job fires.
---

# Scheduled jobs

The Scheduled jobs page lists the recurring work Metabase performs on a schedule, like cache refreshes, model persistence refreshes, and health checks. To manage these jobs, Metabase uses the [Quartz scheduler](https://www.quartz-scheduler.org/).

While [Background tasks](./background-tasks.md) shows the work Metabase performed, Scheduled jobs shows the schedules themselves, including which jobs exist and when they'll fire next.

To open Scheduled jobs:

1. Open [Monitor](./start.md).
2. In the left sidebar, click **Scheduled jobs**.

At the top of the page, Metabase displays information about the scheduler itself, including how long it's been running, the number of jobs executed, and its thread pool size.

For each job, Metabase shows the:

- **Key**: The job's unique identifier.
- **Class**: The code that the job runs.
- **Description**: What the job does. Not all jobs include a description.

## Triggers

Click a job to view its triggers. A trigger is a schedule that determines when the job fires.

For each trigger, Metabase shows the:

- **Key**: The trigger's unique identifier.
- **State**: The trigger's current state.
- **Priority**: The trigger's priority when multiple jobs fire at once.
- **Last Fired**: The timestamp for when the trigger last fired.
- **Next Fire Time**: The timestamp for when the trigger will fire next.
