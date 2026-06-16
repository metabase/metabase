---
title: Session expiration
redirect_from:
  - /docs/latest/operations-guide/changing-session-expiration
---

# Session expiration

When someone logs in — whether by email and password or through an SSO provider — Metabase creates a session that keeps them logged in across tabs and pages. A session can end in three ways: closing the browser, hitting the absolute session age limit, or going idle long enough to trigger an inactivity timeout. Here's how each is configured, how they interact, and when you'd want to use them.

Clearing browser cookies or cache manually ends a session immediately, regardless of any of these settings.

## Set the absolute session limit with `MAX_SESSION_AGE`

MAX_SESSION_AGE controls the maximum number of minutes a session can live from the time of login. A person with hundreds of tabs open who hasn't rebooted in months will get logged out once MAX_SESSION_AGE is reached (even if they had checked the **Remember me** box on the login page).



The default value is 14 days. To set a custom value, use the environment variable (in minutes):

```sh
# sessions expire after 24 hours
MAX_SESSION_AGE=1440 java --add-opens java.base/java.nio=ALL-UNNAMED -jar metabase.jar
```

This setting applies equally to everyone regardless of their browser behavior or activity patterns. Use it when your security policy requires people to log in again on a predictable schedule.

## Log people out after inactivity

{% include plans-blockquote.html feature="Session timeout" %}

`MB_SESSION_TIMEOUT` controls how long a session can be inactive before it ends. Someone who opens Metabase in the morning, uses it for an hour, and then spends the rest of the day in other tools will be logged out once the inactivity window closes.

> **Note:** A dashboard left open with auto-refresh enabled counts as activity and keeps the session alive, even in a background tab. Scheduled alerts and dashboard subscriptions are server-side operations and do not reset the inactivity timer.

To configure session time out, go to **Admin** > **Authentication** > **Overview**, or set an environment variable:

```sh
# log out after 2 hours of inactivity
MB_SESSION_TIMEOUT='{"amount":120,"unit":"minutes"}' java --add-opens java.base/java.nio=ALL-UNNAMED -jar metabase.jar
```

Note that if you're configuring session timeout in Metabase Admin settings, you need to specify the timeout only in minutes or hours, but the `MB_SESSION_TIMEOUT` variable also accepts `"unit":"seconds"`.

When both `MAX_SESSION_AGE` and `MB_SESSION_TIMEOUT` are configured, a session ends at whichever limit hits first. Use it for shared workstations, forgotten open tabs, or any situation where a long-inactive session is a security concern.

## Force everyone to use session cookies

By default, the login page has **Remember me** checked, so sessions survive browser closes and restarts. Without **Remember me**, closing the browser ends the session.

`MB_SESSION_COOKIES` controls whether sessions end when the browser closes. Setting it to `true` removes the **Remember me** checkbox and enforces browser-close logout for everyone.

```sh
MB_SESSION_COOKIES=true java --add-opens java.base/java.nio=ALL-UNNAMED -jar metabase.jar
```

`MAX_SESSION_AGE` and `MB_SESSION_TIMEOUT` still apply — even someone who never closes their browser can be logged out by the age limit or an inactivity window.

Many browsers support session restore, which automatically reopens tabs from the previous session on launch. When session restore is active, the browser behaves as if it was never closed, so session cookies persist across browser restarts. This is usually configurable in the browser's settings.
