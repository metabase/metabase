---
title: "Metabase API documentation"
---

# Metabase API documentation

_These reference files were generated from source comments by running:_

```
clojure -M:ee:run api-documentation
```

## About the Metabase API

- **The API is subject to change.** We rarely change API endpoints, and almost never remove them, but if you write code that relies on the API, there's a chance you might have to update your code in the future.
- **The API isn't versioned.** So don’t expect to stay on a particular version of Metabase in order to use a “stable” API.

## API live docs

You can view live OpenAPI docs, served via [RapiDoc](https://rapidocweb.com/), from your running Metabase at `/api/docs`. So if your Metabase is at `https://www.your-metabase.com` you could access them at `https://www.your-metabase.com/api/docs`.

## API tutorial

Check out an introduction to the [Metabase API](https://www.metabase.com/learn/administration/metabase-api.html).

## API keys

Create keys to authenticate programmatic requests to your Metabase. See [API keys](./people-and-groups/api-keys.md).

## API changelog

See the [API changelog](./developers-guide/api-changelog.md).

## API endpoints

_* indicates endpoints used for features available on [Pro and Enterprise plans](https://www.metabase.com/pricing)._
