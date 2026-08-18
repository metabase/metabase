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
- **Status**: Whether the task succeeded, failed, or is still in progress.

Use the **Filter by task** dropdown to view a single task type, and the **Filter by status** dropdown to view tasks with a specific status.

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
- **Status**: Whether the run succeeded, failed, is still in progress, or was abandoned.
- **Task Count**: The number of tasks in the run, including a breakdown of how many succeeded and failed.

Use the **Filter by run type**, **Filter by started at**, **Filter by entity**, and **Filter by status** dropdowns to narrow the list.

### Run details

Click a run to view more information about it, including the run's ID, its entity type, and a link to the entity it involves.

The Run details page also displays the run's tasks and their statuses. Click a task to view its [task details](#task-details).
