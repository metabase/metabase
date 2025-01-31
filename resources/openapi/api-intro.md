- **The API is subject to change.** We rarely change API endpoints, and almost never remove them, but if you write code that relies on the API, there's a chance you might have to update your code in the future.
- **The API isn't versioned.** So don’t expect to stay on a particular version of Metabase in order to use a “stable” API.

## API tutorial

Check out an introduction to the [Metabase API](https://www.metabase.com/learn/administration/metabase-api.html).

## API keys

Create keys to authenticate programmatic requests to your Metabase. See [API keys](./people-and-groups/api-keys).

## API changelog

For breaking changes, see the API [changelog](./developers-guide/api-changelog).

## View the API docs for your Metabase

You can view the API docs for your Metabase by visiting `https://[your-metabase-url]/api/docs`.

## Generating API docs

You can generate these docs by running:

```
clojure -M:ee:doc api-documentation
```
