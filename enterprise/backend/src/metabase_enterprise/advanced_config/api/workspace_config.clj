(ns metabase-enterprise.advanced-config.api.workspace-config
  "Machine-facing HTTP surface for applying a `config.yml` upload to a workspace
   instance. Same contract as `POST /api/ee/advanced-config`, but authenticated
   with the static `MB_API_KEY` (`X-METABASE-APIKEY` header) instead of a
   superuser session, and gated on the `:workspaces` token feature — both
   applied where the route is mounted, see
   [[metabase-enterprise.api-routes.routes]]."
  (:require
   [metabase-enterprise.advanced-config.api :as advanced-config.api]
   [metabase.api.macros :as api.macros]
   [metabase.util.malli.schema :as ms]))

(api.macros/defendpoint :post "/apply" :- :nil
  "Apply an uploaded `config.yml` to this instance, blocking until the config has
  been fully applied — a 2xx response means the config is live. Runs the same
  per-section initializers (`settings`, `databases`, `users`, `api-keys`,
  `workspace`, ...) the boot-time loader runs.

  Unlike the boot-time loader, `{{env VAR}}` templates are NOT expanded — the
  file's values are inserted verbatim, so an upload can't read server-side
  environment variables it didn't intend to.

  This endpoint is secured by an API key that needs to be passed as a
  `X-METABASE-APIKEY` header which needs to be defined in the `MB_API_KEY`
  [environment variable](https://www.metabase.com/docs/latest/configuring-metabase/environment-variables.html#mb_api_key)."
  {:multipart true}
  [_route-params
   _query-params
   _body
   {{config "config"} :multipart-params, :as _request}
   :- [:map
       [:multipart-params
        [:map
         ["config" [:map
                    [:filename :string]
                    [:tempfile (ms/InstanceOfClass java.io.File)]]]]]]]
  (advanced-config.api/apply-config-upload! (:tempfile config))
  nil)
