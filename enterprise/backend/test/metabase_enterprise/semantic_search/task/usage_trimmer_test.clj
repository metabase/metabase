(ns metabase-enterprise.semantic-search.task.usage-trimmer-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.semantic-search.task.usage-trimmer :as semantic.task.trimmer]
   [metabase-enterprise.semantic-search.util :as semantic.u]
   [toucan2.core :as t2])
  (:import
   (java.sql Timestamp)
   (java.time LocalDateTime)))

(set! *warn-on-reflection* true)

(deftest trim-test
  (when (semantic.u/semantic-search-available?)
    (t2/delete! :model/SemanticSearchTokenTracking)
    (let [now (LocalDateTime/now)
          ;; semantic.task.trimmer/storage-months is set to 2
          long-ago (.minusMonths now 6)]
      (t2/insert! :model/SemanticSearchTokenTracking {:model_name "model now"
                                                      :request_type :index
                                                      :created_at (Timestamp/valueOf now)
                                                      :total_tokens 999})
      (t2/insert! :model/SemanticSearchTokenTracking {:model_name "model long-ago"
                                                      :request_type :query
                                                      :created_at (Timestamp/valueOf long-ago)
                                                      :total_tokens 1000})
      (is (=? [{:model_name "model now"}
               {:model_name "model long-ago"}]
              (t2/select :model/SemanticSearchTokenTracking {:order-by [[:total_tokens :asc]]})))
      (@#'semantic.task.trimmer/trim-old-token-data!)
      (is (=? [{:model_name "model now"}]
              (t2/select :model/SemanticSearchTokenTracking {:order-by [[:total_tokens :asc]]}))))))
