(ns metabase-enterprise.git-source-of-truth.api
  (:require
   [metabase-enterprise.git-source-of-truth.core :as core]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.util.log :as log]))

(api.macros/defendpoint :post "/reload"
  "Reload Metabase content from Git repository source of truth.
  
  This endpoint will:
  1. Fetch the latest changes from the configured git repository
  2. Load the updated content using the serialization/deserialization system
  3. Ensure read-only mode remains enabled
  
  Requires superuser permissions."
  []
  (api/check-superuser)
  (log/info "API request to reload from git repository")

  (let [result (core/reload-from-git!)]
    (case (:status result)
      :success
      {:status 200
       :body {:status "success"
              :message (:message result)}}

      :error
      {:status 400
       :body {:status "error"
              :message (:message result)}}

      ;; Fallback for unexpected result format
      {:status 500
       :body {:status "error"
              :message "Unexpected error occurred during reload"}})))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/git-source-of-truth` routes."
  (api.macros/ns-handler *ns* +auth))
