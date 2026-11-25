# Confirm product facts in the code

Writers check the facts before they draft. Reviewers check the facts that nobody linked to code.

## List the facts to check

Write down each product fact the change states. [The skill](./SKILL.md) lists the kinds under "State only facts that someone confirmed in the code." Add each question the issue leaves open, like "What are the limits?", and answer it with one row for each fact you find. Skip advice, opinions, and prose that states no fact.

In a diff, check only the facts on changed lines.

## Search where each kind of fact lives

Search for exact strings first. Read about 20 lines around each hit, not whole files.

- **UI labels** are `t` and `jt` template strings in the frontend, like `` t`Save` ``, and `msgid` for plurals:

  ```sh
  grep -rn 't`Exact label' frontend/src enterprise/frontend/src
  ```

  Labels that the backend sends are `tru` and `deferred-tru` strings. Labels on a database connection form are also `display-name` entries in `modules/drivers/*/resources/metabase/*/metabase-plugin.yaml`.

- **Settings** are `defsetting` forms. Read `:default`, `:visibility`, `:type`, and `:feature`:

  ```sh
  grep -rnE "def(setting|ine-multi-setting) setting-name" src enterprise/backend/src
  ```

- **Environment variables** come from the setting name: `MB_`, then the name in uppercase, with underscores for hyphens and no `?`. `enable-public-sharing` is `MB_ENABLE_PUBLIC_SHARING`. See `env-var-name` in `src/metabase/settings/models/setting.clj`. Find the setting, then derive the name. Some variables, like `MB_JETTY_PORT` and `MB_DB_TYPE`, have no setting. Search for the keyword instead. Many of the defaults are in `src/metabase/config/core.clj`:

  ```sh
  grep -rn ":mb-jetty-port" src enterprise/backend/src
  ```

- **Paid features** need a token feature. The backend writes it as a keyword, like `:feature :database-routing` on a `defsetting` or a `defenterprise`, or as the last argument of a `define-premium-feature`. The frontend writes it in snake case, like `hasPremiumFeature("database_routing")`.
- **API endpoints** are `api.macros/defendpoint` forms. The path in the form leaves out the prefix, like `/api/card`, which is in `src/metabase/api_routes/routes.clj`. Check that the full path exists, then cite the `defendpoint` form:

  ```sh
  jq '.paths["/api/card/{id}/query_metadata"]' resources/openapi/openapi.json
  grep -rn 'defendpoint :get "/:id/query_metadata"' src enterprise/backend/src
  ```

- **Permissions** are the checks in the endpoint body, or in a function that it calls: `api/check-superuser`, `api/read-check`, `api/write-check`, `api/create-check`, and `api/check-403`.
- **Limits and defaults** are usually a `def` near the code that uses them. Tests often assert them, so search `test/` and `enterprise/backend/test/` too.

To find a setting name fast, search `docs/configuring-metabase/environment-variables.md`. Scripts generate that page from the code, so it's a good index, but it can lag. Confirm each fact in the code, and never cite a page in `docs/` as evidence. The docs are what you're checking.

## Report plans and most versions as "Not in code"

A token feature shows that a feature is paid. The code doesn't show whether the feature comes with the Pro plan, the Enterprise plan, both, or an add-on. Split each plan claim into two facts:

- **The feature is paid**: A token feature confirms it.
- **Which plan has the feature**: "Not in code."

Versions are mostly not in the code either. Many `define-premium-feature` forms carry `^{:added "0.54.0"}`, which the docs write as "Metabase 54." Report any other version claim as "Not in code."

## Stop when a search comes up empty

"Not found" is a real result. If three searches for a fact find nothing, report the fact as not found, list the places you searched, and move on. If the feature's code isn't in this checkout at all, report each of its facts as not found, and say so in the Notes column.

## Link to a commit that's on GitHub

A link to a commit that nobody pushed is a 404. Pick the commit first:

```sh
git branch -r --contains HEAD
```

- **If the output lists a branch**, use the commit from `git rev-parse HEAD`.
- **If the output is empty**, use the commit from `git merge-base HEAD origin/master`.

Open the lines before you cite them, and never estimate a line number. If you picked HEAD, and the file has no uncommitted changes, the line numbers in this checkout are right. Otherwise, read the file with `git show COMMIT:PATH`. If the lines exist only in this checkout, give the path and the line numbers without a link, and write "Not pushed" in the Notes column.

Link each fact to the lines that show it. Write every URL in full, with the full commit hash, however long the table gets. People paste single rows into a PR, so a base URL or a `...` breaks the link:

```text
https://github.com/metabase/metabase/blob/COMMIT/PATH#LFIRST-LLAST
```

## Keep one row per fact

Use only these four statuses: Confirmed, Contradicted, Not found, and Not in code. The Status column holds one status and no other words. Everything else you have to say about a fact goes in the Notes column, like what the code says when it contradicts the fact.

| Fact                                          | Status       | Evidence                                                                                              | Notes                                                       |
| --------------------------------------------- | ------------ | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `MB_ENABLE_PUBLIC_SHARING` defaults to `true` | Confirmed    | https://github.com/metabase/metabase/blob/COMMIT/src/metabase/public_sharing/settings.clj#L6-L11      |                                                             |
| The button says **Save changes**              | Contradicted | https://github.com/metabase/metabase/blob/COMMIT/PATH#L40                                             | The label is **Save**.                                      |
| Database routing is paid                      | Confirmed    | https://github.com/metabase/metabase/blob/COMMIT/src/metabase/premium_features/settings.clj#L259-L261 | Token feature `:database-routing`.                          |
| Database routing is on Enterprise plans only  | Not in code  |                                                                                                       | The code has only the token feature.                        |
| Retries a failed sync three times             | Not found    |                                                                                                       | Searched `src/metabase/sync` for `retry` and `max-retries`. |
