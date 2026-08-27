---
title: Background tasks
summary: See the status of the tasks and runs that Metabase performs in the background, like syncs, alerts, and notifications.
---

# Background tasks

The Background tasks page lists the work Metabase performs in the background, including database syncs, alerts, and notifications. Use this page to check the status of tasks and to troubleshoot failures.

To open Background tasks:

1. Open [Monitor](./start.md).
2. In the left sidebar, click **Background tasks**.

The Background tasks page has two tabs:

- **Tasks**: The individual steps Metabase performs to complete a run.
- **Runs**: Single operations, like database syncs or alert sends.

## Tasks

The Tasks tab lists the individual steps Metabase performs to complete a run. For each task, Metabase shows the:

- **Task**: The type of task.
- **DB Name**: The name of the database involved in the task.
- **DB Engine**: The database engine.
- **Started at**: The timestamp for when the task started.
- **Ended at**: The timestamp for when the task finished.
- **Duration (ms)**: The duration of the task in milliseconds.
- **Status**: The outcome of the task. See [Task statuses](#task-statuses).

Use the **Filter by task** dropdown to view a single task type, and the **Filter by status** dropdown to view tasks with a specific status.

### Task statuses

A task has one of four statuses:

- **Started**: The task is running. Metabase records this status when the task begins.
- **Success**: The task finished without raising an error.
- **Failed**: The task raised an error. The [task details](#task-details) record the exception class, its message, the stack trace, and any additional error data.
- **Unknown**: The task never reported an outcome. Metabase applies this status when the [run](#runs) the task belongs to is abandoned, so the task's real result is unrecoverable. See [Abandoned runs](#abandoned-runs).

### Task details

Click a task to view more information about it, including the task's ID and a link to the run it belongs to.

The Task details page displays the task's JSON details, which include the error message and stack trace for failed tasks. To save the JSON, click the **Download** button. To copy it, click the **Copy** icon.

The Task details page also displays any logs the task captured.

## Runs

The Runs tab lists each operation Metabase performs. For each run, Metabase shows the:

- **Run Type**: The type of run, like an alert or a sync.
- **Entity**: The item the run involves, like a question for an alert or a database for a sync.
- **Started at**: The timestamp for when the run started.
- **Ended at**: The timestamp for when the run finished.
- **Status**: The outcome of the run. See [Run statuses](#run-statuses).
- **Task Count**: The number of tasks in the run, including a breakdown of how many succeeded and failed.

Use the **Filter by run type**, **Filter by started at**, **Filter by entity**, and **Filter by status** dropdowns to narrow the list.

### Run statuses

A run has one of four statuses:

- **Started**: The run is in progress.
- **Success**: Every task in the run succeeded.
- **Failed**: At least one task in the run didn't succeed. A run is only marked successful when all of its tasks succeed, so a run containing a failed or unknown task is marked failed even if the rest of its tasks succeeded.
- **Abandoned**: Metabase stopped hearing from the run before it finished. See [Abandoned runs](#abandoned-runs).

### Abandoned runs

While a run is in progress, the Metabase process working on it reports that it's still alive. If those reports stop, the run would otherwise sit in the Started status forever, so Metabase periodically looks for runs that have gone quiet and marks them **Abandoned**.

Metabase abandons a run when either:

- It hasn't reported in for more than an hour, which usually means the process running it stopped or lost its connection to the application database.
- It has been running for more than 24 hours, whether or not it's still reporting in.

When Metabase abandons a run, any of that run's tasks still in the Started status are marked [Unknown](#task-statuses), because there's no way to tell whether they finished.

Abandoned runs and unknown tasks aren't errors that a task itself reported, so the [task details](#task-details) won't contain a stack trace. Check your [application logs](./application-logs.md) around the run's start time instead.

### Run details

Click a run to view more information about it, including the run's ID, its entity type, and a link to the entity it involves.

The Run details page also displays the run's tasks and their statuses. Click a task to view its [task details](#task-details).
