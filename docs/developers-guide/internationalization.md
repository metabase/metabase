---
title: Internationalization
---

# Internationalization

We are an application with lots of users all over the world. To help them use Metabase in their own language, we mark all of our strings as i18n.

## Adding new strings:

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