### EE Code Structure Notes

EE namespaces follow the pattern work like this.

EE namespace = take the equivalent OSS namespace and replace `metabase.` with `metabase-enterprise.<feature>` where
`<feature>` is the premium token feature that one must have to use this feature.

For example, Sandboxing-related API endpoints for Tables go in `metabase-enterprise.sandboxes.api.table` and
Sandboxing-related models (e.g. GTAP) go in `metabase-enterprise.sandboxes.models`. Sandboxing-specific code for
existing models follow this same pattern, e.g. Sandboxing-specific code for Tables goes in
`metabase-enterprise.sandboxes.models.table`.

Groups of API routes should be defined in namespaces like we do in OSS, for example
`metabase-enterprise.content-verification.api.review` for ModerationReview-related endpoints. All endpoints for a
specific feature are combined into a single `routes` handler in a `metabase-enterprise.<feature>.api.routes` namespace
similar to how OSS routes are combined in `metabase.api.routes`. Finally, all EE routes are combined into a single
handler in `metabase-enterprise.api.routes`; this handler is included in `metabase.api.routes/routes` if EE code is
available.

Please keep these rules in mind when adding new EE namespaces. In general, new namespaces **SHOULD NOT** be added
directly under `metabase-enterprise` unless they apply to the Enterprise codebase as a whole; put them under the
appropriate `metabase-enterprise.<feature>` directory instead.

### Naming EE API routes

To make things consistent EE-only API routes should follow the same pattern and be given route names that correspond
to their namespaces (i.e., are prefixed with `ee/<feature>`). For example, an `:advanced-config`-only
route to delete User subscriptions should be named something like

```
DELETE /api/ee/advanced-config/user/:id/subscriptions
```

rather than

```
DELETE /api/user/:id/subscriptions
```

Not all EE endpoints follow this pattern yet, but they should; please feel free to fix stuff as you come across it if
I don't get to it first.

### Questions :interrobang:

Ping me (`@cam`) if you have any questions.
