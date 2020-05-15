# Changing session expiration

By default, Metabase sessions are valid for two weeks after a user last authenticated (e.g. by entering their email
address/password or via an SSO provider). For example, even if you visit your Metabase instance every day, you'll
still have to log in again every two weeks.

This "session expiration" is configurable via the environment variable `MAX_SESSION_AGE` or as a Java system property:

```
# Change session expiration to 24 hours
MAX_SESSION_AGE=1440 java -jar metabase.jar
```

or

```
java -DMAX_SESSION_AGE=1440 -jar metabase.jar
```

`MAX_SESSION_AGE` is in minutes.


### Using Session cookies

Metabase also supports using [session
cookies](https://developer.mozilla.org/en-US/docs/Web/HTTP/Cookies#Session_cookies), which mean users will stay
authenticated until they close their browser window. Once they close their browser window, next time they visit
Metabase they'll have to log in again. Session expiration still applies, so even if you leave your browser window open
forever, you'll still be required to re-authenticate after two weeks or whatever session expiration you've configured.

You can tell Metabase to use session cookies with the environment variable or Java system property
`MB_SESSION_COOKIES`:

```
MB_SESSION_COOKIES=true java -jar metabase.jar
```

Note that browsers may use "session restoring", which means they automatically restore their previous session when
reopened. In this case, the browser effectively acts as if it was never closed; session cookies will act
the same as permanent cookies. For browsers that support this feature, this behavior is usually configurable.
