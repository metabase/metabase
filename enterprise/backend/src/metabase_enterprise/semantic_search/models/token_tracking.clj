(ns metabase-enterprise.semantic-search.models.token-tracking
  (:require
   [metabase.models.interface :as mi]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(derive :model/SemanticSearchTokenTracking :metabase/model)

(methodical/defmethod t2/table-name :model/SemanticSearchTokenTracking [_model] :semantic_search_token_tracking)

(t2/deftransforms :model/SemanticSearchTokenTracking
  {:request_type mi/transform-keyword})

(defn record-tokens
  "Record semantic search token usage."
  [model request-type total-tokens]
  (t2/insert! :model/SemanticSearchTokenTracking {:model_name model
                                                  :request_type request-type
                                                  :total_tokens total-tokens}))
