(ns metabase-enterprise.advanced-config.api.external
  "Static-API-key variant of the `config.yml` upload, served under
   `/api/ee/advanced-config/external`. The route is wrapped in
   `+static-apikey`, so requests authenticate with the static `MB_API_KEY`
   (`x-metabase-apikey` header) instead of a user session — for out-of-band
   automation, e.g. a workspace manager configuring a freshly provisioned
   child instance."
  (:require
   [metabase-enterprise.advanced-config.api :as advanced-config.api]
   [metabase.api.macros :as api.macros]))

(api.macros/defendpoint :post "/" :- :nil
  "Apply an uploaded `config.yml` to this instance. Same behavior as
  `POST /api/ee/advanced-config`, authenticated with the static `MB_API_KEY`
  header instead of a superuser session."
  {:multipart true}
  [_route-params
   _query-params
   _body
   {{config "config"} :multipart-params, :as _request}
   :- advanced-config.api/ConfigUploadRequest]
  (advanced-config.api/apply-config-upload! config))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/advanced-config/external` routes."
  (api.macros/ns-handler *ns*))
