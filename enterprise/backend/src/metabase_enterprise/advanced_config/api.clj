(ns metabase-enterprise.advanced-config.api
  "HTTP surface for the EE advanced-config module — runtime apply of a
   `config.yml` upload. Mirrors the boot-time `config.yml` loader but driven by
   an admin file upload instead of `MB_CONFIG_FILE_PATH`."
  (:require
   [clojure.java.io :as io]
   [metabase-enterprise.advanced-config.file :as advanced-config.file]
   [metabase-enterprise.advanced-config.file.api-keys]
   [metabase-enterprise.advanced-config.file.databases]
   [metabase-enterprise.advanced-config.file.settings]
   [metabase-enterprise.advanced-config.file.users]
   [metabase-enterprise.advanced-config.file.workspace]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.util.malli.schema :as ms]
   [metabase.util.yaml :as yaml]
   [toucan2.core :as t2]))

(comment
  metabase-enterprise.advanced-config.file.api-keys/keep-me
  metabase-enterprise.advanced-config.file.databases/keep-me
  metabase-enterprise.advanced-config.file.settings/keep-me
  metabase-enterprise.advanced-config.file.users/keep-me
  metabase-enterprise.advanced-config.file.workspace/keep-me)

(api.macros/defendpoint :post "/" :- :nil
  "Apply an uploaded `config.yml` to this instance. Runs the same per-section
  initializers (`settings`, `databases`, `users`, `api-keys`, `workspace`, ...)
  the boot-time loader runs, wrapped in a single application-database transaction
  so a failure rolls back any rows already inserted by earlier sections.

  Superuser-only. The same premium-token gating the boot-time loader applies
  still applies here: non-`settings` sections require the `:config-text-file`
  feature unless the file declares a structurally-valid `:workspace` section
  (workspace bring-up)."
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
  (api/check-superuser)
  (let [tempfile (:tempfile config)]
    (try
      (binding [advanced-config.file/*config* (yaml/from-file tempfile)]
        (t2/with-transaction [_conn]
          (advanced-config.file/initialize!)))
      (finally
        (io/delete-file tempfile :silently))))
  nil)
