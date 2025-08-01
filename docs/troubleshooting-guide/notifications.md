---
title: Troubleshooting notifications
---

# Troubleshooting notifications

Metabase is failing to send notifications like alerts or dashboard subscriptions.

**Root cause:**

When long running queries get stuck in the queue, they can block all other queries from running.

**Steps to take:**

1. Increase the notification thread pool size with the [`MB_NOTIFICATION_THREAD_POOL_SIZE`](../configuring-metabase/environment-variables.md#mb_notification_thread_pool_size) environment variable and reboot the server.

For example, you can set the thread pool size to `10` by setting the environment variable:
`MB_NOTIFICATION_THREAD_POOL_SIZE=10`.

Note: remember that Metabase won't pick up old failed tasks so you will see the effect of this change in the next notification period.
