(ns metabase-enterprise.semantic-search.api
  "/api/ee/semantic-search endpoints"
  (:require
   [clojure.core.memoize :as memoize]
   [metabase-enterprise.semantic-search.env :as semantic.env]
   [metabase-enterprise.semantic-search.index :as semantic.index]
   [metabase-enterprise.semantic-search.index-metadata :as semantic.index-metadata]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.permissions.core :as perms]
   [metabase.search.ingestion :as search.ingestion]))

(def ^:private indexible-items-count
  (memoize/ttl search.ingestion/search-items-count
               :ttl/threshold (* 5 60 1000))) ; 5 minutes

(defn- active-index-document-count
  [pgvector index-metadata]
  (when-let [table-name (-> index-metadata :index :table-name)]
    (semantic.index/index-size pgvector table-name)))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/status"
  "Fetch the indexing status of the currently active semantic search index table.

  Returns a map with keys:
   :indexed_count <number of indexed items>
   :total_est     <estimated total number of items to index>

  If no index is active, returns an empty map."
  []
  (perms/check-has-application-permission :setting)
  (let [pgvector       (semantic.env/get-pgvector-datasource!)
        index-metadata (semantic.env/get-index-metadata)
        active-index   (when (and pgvector index-metadata)
                         (semantic.index-metadata/get-active-index-state pgvector index-metadata))]
    (try
      (if active-index
        {:indexed_count (active-index-document-count pgvector active-index)
         :total_est     (indexible-items-count)}
        {})
      (catch Exception e
        (throw (ex-info "Error fetching semantic search index status" {} e))))))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/semantic-search` routes."
  (api.macros/ns-handler *ns* +auth))
