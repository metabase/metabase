---
title: Session expiration
redirect_from:
  - /docs/latest/operations-guide/changing-session-expiration
---

# Session expiration

By default, Metabase sessions are valid for two weeks after a user last authenticated (e.g. by entering their email address/password or via an SSO provider). For example, even if you visit your Metabase instance every day, you'll still have to log in again every two weeks.

## Session age

The session age is the maximum time that a person stays logged into Metabase (even if the person closes the browser).

You can set the environment variable [`MAX_SESSION_AGE`](../configuring-metabase/environment-variables.md#max_session_age):

```
# Change session expiration to 24 hours
MAX_SESSION_AGE=1440 java -jar metabase.jar
```

or set the Java system property:

```
java -DMAX_SESSION_AGE=1440 -jar metabase.jar
```

`MAX_SESSION_AGE` is in minutes.

## Session timeout

{% include plans-blockquote.html feature="Session timeout" %}

The session timeout is the maximum time that a person can be inactive (for example, if someone leaves Metabase open in a long-forgotten browser tab).

You can toggle this setting from **Admin** > **Authentication**, or set the environment variable [`MB_SESSION_TIMEOUT`](../configuring-metabase/environment-variables.md#mb_session_timeout).

Session timeout is null by default. You can use a session timeout to log people out earlier than the max [session age](#session-age).

## Session cookies

Metabase also supports using [session cookies](https://developer.mozilla.org/en-US/docs/Web/HTTP/Cookies#Session_cookies), which mean users will only stay authenticated until they close their browser. This can be enabled on a per-user basis by unchecking the "Remember me" box when logging in. Once the user closes their browser, the next time they visit Metabase they'll have to log in again. Session expiration still applies, so even if you leave your browser open forever, you'll still be required to re-authenticate after two weeks or whatever session expiration you've configured.

You can tell Metabase to always use session cookies with the environment variable or Java system property `MB_SESSION_COOKIES`:

```
MB_SESSION_COOKIES=true java -jar metabase.jar
```

Setting this environment variable will override the behavior of the "Remember me" checkbox and enforce the use of session cookies for all users.

Note that browsers may use "session restoring", which means they automatically restore their previous session when reopened. In this case, the browser effectively acts as if it was never closed; session cookies will act the same as permanent cookies. For browsers that support this feature, this behavior is usually configurable.
