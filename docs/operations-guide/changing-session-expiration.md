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
cookies](https://developer.mozilla.org/en-US/docs/Web/HTTP/Cookies#Session_cookies), which mean users will only stay
authenticated until they close their browser. This can be enabled on a per-user basis by unchecking the "Remember me"
box when logging in. Once the user closes their browser, the next time they visit Metabase they'll have to log in
again. Session expiration still applies, so even if you leave your browser open forever, you'll still be
required to re-authenticate after two weeks or whatever session expiration you've configured.

You can tell Metabase to always use session cookies with the environment variable or Java system property
`MB_SESSION_COOKIES`:

```
MB_SESSION_COOKIES=true java -jar metabase.jar
```

Setting this environment variable will override the behavior of the "Remember me" checkbox and enforce the use of
session cookies for all users.

Note that browsers may use "session restoring", which means they automatically restore their previous session when
reopened. In this case, the browser effectively acts as if it was never closed; session cookies will act
the same as permanent cookies. For browsers that support this feature, this behavior is usually configurable.
