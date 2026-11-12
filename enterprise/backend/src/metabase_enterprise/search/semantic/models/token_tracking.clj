(ns metabase-enterprise.search.semantic.models.token-tracking
  (:require
   [metabase-enterprise.search.semantic.db :as semantic-search.db]
   [metabase.models.interface :as mi]
   [metabase.util.log :as log]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(derive :model/SemanticSearchTokenTracking :metabase/model)

(methodical/defmethod t2/table-name :model/SemanticSearchTokenTracking [_model] :semantic_search_token_tracking)

(t2/deftransforms :model/SemanticSearchTokenTracking
  {:request_type mi/transform-keyword})

(defn record-tokens
  "Records `total-tokens` used by `model` for `request-type`.
  Logs a failed insert instead of throwing."
  [model request-type total-tokens]
  (try
    (semantic-search.db/insert-token-tracking! {:model_name   model
                                                :request_type request-type
                                                :total_tokens total-tokens})
    ;; The row only accounts for an embedding call that already succeeded, so a failed insert must not fail the
    ;; search or indexing batch that made the call.
    (catch Exception e
      (log/warnf e "Failed to record %s tokens for embedding model %s" total-tokens model))))
