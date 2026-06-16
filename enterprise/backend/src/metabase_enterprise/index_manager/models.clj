(ns metabase-enterprise.index-manager.models
  "The `metabase_index_request` model: index/clustering hints declared on a transform target table.

  Each request binds to a transform (`:transform_id`), carries a structured index definition (see
  [[metabase-enterprise.index-manager.schema]]), and tracks a lifecycle `:status`. `:table_id` is backfilled once
  the target table first syncs."
  (:require
   [metabase-enterprise.index-manager.schema :as schema]
   [metabase.models.interface :as mi]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(methodical/defmethod t2/table-name :model/IndexRequest [_model] :metabase_index_request)

(doto :model/IndexRequest
  (derive :metabase/model)
  (derive :hook/timestamped?))

(def ^:private transform-structured
  "JSON in/out for `:structured`, re-keywordizing enum-valued fields on read. Validation lives in the hooks."
  {:in  mi/json-in
   :out (comp schema/keywordize-structured mi/json-out-with-keywordization)})

(t2/deftransforms :model/IndexRequest
  {:structured transform-structured
   :status     mi/transform-keyword})

(defn- validate-request!
  [{:keys [structured status]}]
  (when (seq structured) (schema/validate-structured! structured))
  (when (and status (not (contains? schema/statuses (keyword status))))
    (throw (ex-info "Invalid index request status"
                    {:status-code 400, :status status, :allowed schema/statuses}))))

(t2/define-before-insert :model/IndexRequest [req] (validate-request! req) req)
(t2/define-before-update :model/IndexRequest [req] (validate-request! (t2/changes req)) req)
