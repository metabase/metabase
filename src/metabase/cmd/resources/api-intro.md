# Metabase API documentation

_These reference files were generated from source comments by running `clojure -M:ee:run api-documentation`_.

## About the Metabase API

- **The API is subject to change.** The API is tightly coupled with the front end and is subject to change between releases. The endpoints likely won’t change that much (existing API endpoints are changed infrequently, and removed rarely), but if you write code to use the API, you might have to update it in the future.
- **The API isn't versioned.** Meaning: it can change version to version, so don’t expect to stay on a particular version of Metabase in order to use a “stable” API.

## API tutorial

Check out an introduction to the [Metabase API](https://www.metabase.com/learn/administration/metabase-api.html).

## API endpoints

_* indicates endpoints used for features available on [paid plans](https://www.metabase.com/pricing/)._
