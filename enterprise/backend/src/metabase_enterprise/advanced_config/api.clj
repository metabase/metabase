(ns metabase-enterprise.advanced-config.api
  "HTTP surface for the EE advanced-config module — runtime apply of a
   `config.yml` upload."
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
   [metabase.util.yaml :as yaml]))

(comment
  metabase-enterprise.advanced-config.file.api-keys/keep-me
  metabase-enterprise.advanced-config.file.databases/keep-me
  metabase-enterprise.advanced-config.file.settings/keep-me
  metabase-enterprise.advanced-config.file.users/keep-me
  metabase-enterprise.advanced-config.file.workspace/keep-me)

(api.macros/defendpoint :post "/" :- :nil
  "Apply an uploaded `config.yml` to this instance. Runs the same per-section
  initializers (`settings`, `databases`, `users`, `api-keys`, `workspace`, ...)
  the boot-time loader runs. Superuser-only.

  Unlike the boot-time loader, `{{env VAR}}` templates are NOT expanded — the
  file's values are inserted verbatim, so an admin's upload can't read
  server-side environment variables it didn't intend to."
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
      (advanced-config.file/initialize! (yaml/from-file tempfile))
      (finally
        (io/delete-file tempfile :silently))))
  nil)
