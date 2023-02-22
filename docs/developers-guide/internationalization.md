---
title: Internationalization
---

# Internationalization

We are an application with lots of users all over the world. To help them use Metabase in their own language, we mark all of our strings as i18n.

## Quick Guide

If you need to add new strings (try to be judicious about adding copy) do the following:

1. Tag strings in the frontend using `t` and `jt` ES6 template literals (see more details in https://ttag.js.org/):

```javascript
const someString = t`Hello ${name}!`;
const someJSX = <div>{jt`Hello ${name}`}</div>;
```

and in the backend using `trs` (to use the site language) or `tru` (to use the current User's language):

```clojure
(trs "Hello {0}!" name)
```

## Translation errors or missing strings

If you see incorrect or missing strings for your language, please visit our [POEditor project](https://poeditor.com/join/project/ynjQmwSsGh) and submit your fixes there.


# Backend Translation Guide

Metabase allows for translations into many languages. An authoritative list can be found in `resources/locales.clj`.

## The Metabase Side

Metabase is concerned about localization into two distinct locales: translating into the server's locale and translating into the user's locale. The distinction is largely: will this be logged on the server or sent over the wire back to the user.

To translate a string for the server, use `metabase.util.i18n/trs` and for the user's locale, use the similar `metabase.util.i18n/tru`. Think `tr-server` and `tr-user`.

### How it works

At a high level, the string to be translated is treated as a lookup key into a map of source-string -> localized-string. This translated string is used like so:

```clojure

;; from source of `translate` in `metabase.util.i18n`

(.format (MessageFormat. looked-up-string) (to-array args))

```

Everything else is largely bookkeeping. This uses the [java.text.MessageFormat](https://docs.oracle.com/javase/7/docs/api/java/text/MessageFormat.html) class for splicing in format args.

The functions `trs` and `tru` create instances of two records, `SiteLocalizedString` and `UserLocalizedString` respectively with overrides to the `toString` method. This method will do the lookup to the current locale (user or site as appropriate), lookup the string to be translated to the associated translated string, and then call the `.format` method on the `MessageFormat`.

### The maps from source to translated string

One step in our build process creates an edn file of source to translated string for each locale we support. These are located in `resources/i18n`. If you do not have these files, you can run `bin/build-translation-resources` to generate them.

We have lots of contributors who help us keep a corpus of translated strings into many different languages. We use [POEditor](https://poeditor.com/join/project/ynjQmwSsGh) to keep an authoritative list. We export `.po` files from this, which is essentially a dictionary from source to translated string. As part of our build process we format these files as edn files, maps from the source to translated string, for each locale.

### Format Args

Besides string literals, we also want to translate strings that have arguments spliced into the middle. We use the syntax from the [java.text.MessageFormat](https://docs.oracle.com/javase/7/docs/api/java/text/MessageFormat.html) class mentioned before. These are zero-indexed args of the form `{0}`, `{1}`.

eg,

```clojure
(trs "{0} accepted their {1} invite" (:common_name new-user) (app-name-trs))
(tru "{0}th percentile of {1}" p (aggregation-arg-display-name inner-query arg))
(tru "{0} driver does not support foreign keys." driver/*driver*)
```

#### Escaping

Every string language needs an escape character. Since `{0}` is an argument to be spliced in, how would you put a literal "{0}" in the string. The apostrophe serves this role and is described in the MessageFormat [javadocs](https://docs.oracle.com/javase/7/docs/api/java/text/MessageFormat.html).

These is an unfortunate side effect of this though. Since the apostrophe is such a commeon part of speech (especially in french), we often can end up with escape characters used as a regular part of a string rather than the escape character. Format strings need to use double apostrophes like `(deferred-tru "SAML attribute for the user''s email address")` to escape the apostrophe.

There are lots of translated strings in French that use a single apostrophe incorrectly. (eg "l'URL" instead of "l''URL"). We have a manual fix to this in `bin/i18n/src/i18n/create_artifacts/backend.clj` where we try to identify these apostrophes which are not escape characters and replace them with a double quote.