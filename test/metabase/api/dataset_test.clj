(ns metabase.api.dataset-test
  "Unit tests for /api/dataset endpoints."
  (:require [expectations :refer :all]
            [metabase.api.dataset :refer [dataset-query-api-constraints]]
            [metabase.db :refer :all]
            [metabase.driver.query-processor.expand :as ql]
            [metabase.models.card :refer [Card]]
            [metabase.models.query-execution :refer [QueryExecution]]
            [metabase.test.data.users :refer :all]
            [metabase.test.data :refer :all]
            [metabase.test.util :as tu]))


(defn user-details [user]
  (tu/match-$ user
              {:email $
               :date_joined $
               :first_name $
               :last_name $
               :last_login $
               :is_superuser $
               :is_qbnewb $
               :common_name $}))

(defn remove-ids-and-boolean-timestamps [m]
  (let [f (fn [v]
            (cond
              (map? v) (remove-ids-and-boolean-timestamps v)
              (coll? v) (mapv remove-ids-and-boolean-timestamps v)
              :else v))]
    (into {} (for [[k v] m]
               (when-not (or (= :id k)
                             (.endsWith (name k) "_id"))
                 (if (or (= :created_at k)
                         (= :updated_at k))
                   [k (not (nil? v))]
                   [k (f v)]))))))

(defn format-response [m]
  (into {} (for [[k v] m]
             (if (contains? #{:id :uuid :started_at :finished_at :running_time} k)
               [k (boolean v)]
               [k v]))))

;;; ## POST /api/meta/dataset
;; Just a basic sanity check to make sure Query Processor endpoint is still working correctly.
(expect
  ;; the first result is directly from the api call
  ;; the second result is checking our QueryExection log to ensure it captured the right details
  [{:data         {:rows    [[1000]]
                   :columns ["count"]
                   :cols    [{:base_type "IntegerField", :special_type "number", :name "count", :display_name "count", :id nil, :table_id nil,
                              :description nil, :target nil, :extra_info {}}]}
    :row_count    1
    :status       "completed"
    :id           true
    :uuid         true
    :json_query   (-> (ql/wrap-inner-query
                        (query checkins
                               (ql/aggregation (ql/count))))
                      (assoc :type "query")
                      (assoc-in [:query :aggregation] {:aggregation-type "count"})
                      (assoc :constraints dataset-query-api-constraints))
    :started_at   true
    :finished_at  true
    :running_time true}
   {:row_count    1
    :result_rows  1
    :status       :completed
    :error        ""
    :id           true
    :uuid         true
    :raw_query    ""
    :json_query   (-> (ql/wrap-inner-query
                        (query checkins
                               (ql/aggregation (ql/count))))
                      (assoc :type "query")
                      (assoc-in [:query :aggregation] {:aggregation-type "count"})
                      (assoc :constraints dataset-query-api-constraints))
    :started_at   true
    :finished_at  true
    :running_time true
    :version      0}]
  (let [result ((user->client :rasta) :post 200 "dataset" (ql/wrap-inner-query
                                                            (query checkins
                                                                   (ql/aggregation (ql/count)))))]
    [(format-response result)
     (format-response (sel :one QueryExecution :uuid (:uuid result)))]))

;; Even if a query fails we still expect a 200 response from the api
(expect
  ;; the first result is directly from the api call
  ;; the second result is checking our QueryExection log to ensure it captured the right details
  (let [output {:data         {:rows    []
                               :columns []
                               :cols    []}
                :row_count    0
                :status       "failed"
                :error        "Syntax error in SQL statement \"FOOBAR[*] \"; expected \"FROM, {\""
                :id           true
                :uuid         true
                :json_query   {:database    (id)
                               :type        "native"
                               :native      {:query "foobar"}
                               :constraints dataset-query-api-constraints}
                :started_at   true
                :finished_at  true
                :running_time true}]
    [output
     (-> output
         (dissoc :data)
         (assoc :status      :failed
                :version     0
                :raw_query   ""
                :result_rows 0))])
  (let [result ((user->client :rasta) :post 200 "dataset" {:database (id)
                                                           :type     "native"
                                                           :native   {:query "foobar"}})]
    [(format-response result)
     (format-response (sel :one QueryExecution :uuid (:uuid result)))]))


;; GET /api/dataset/card/:id
(expect
  ;; the first result is directly from the api call
  ;; the second result is checking our QueryExection log to ensure it captured the right details
  [{:card   {:name                   "Dataset Test Card"
             :description            nil
             :public_perms           0
             :creator                (user-details (fetch-user :rasta))
             :display                "scalar"
             :query_type             "query"
             :dataset_query          (-> (ql/wrap-inner-query
                                           (query checkins
                                                  (ql/aggregation (ql/count))))
                                         (assoc :type "query")
                                         (assoc-in [:query :aggregation] {:aggregation-type "count"}))
             :visualization_settings {}
             :created_at             true
             :updated_at             true}
    :result {:data         {:rows    [[1000]]
                            :columns ["count"]
                            :cols    [{:base_type "IntegerField", :special_type "number", :name "count", :display_name "count", :id nil, :table_id nil,
                                       :description nil, :target nil, :extra_info {}}]}
             :row_count    1
             :status       "completed"
             :id           true
             :uuid         true
             :json_query   (-> (ql/wrap-inner-query
                                 (query checkins
                                        (ql/aggregation (ql/count))))
                               (assoc :type "query")
                               (assoc-in [:query :aggregation] {:aggregation-type "count"})
                               (assoc :constraints dataset-query-api-constraints))
             :started_at   true
             :finished_at  true
             :running_time true}}
   {:row_count    1
    :result_rows  1
    :status       :completed
    :error        ""
    :id           true
    :uuid         true
    :raw_query    ""
    :json_query   (-> (ql/wrap-inner-query
                        (query checkins
                               (ql/aggregation (ql/count))))
                      (assoc :type "query")
                      (assoc-in [:query :aggregation] {:aggregation-type "count"})
                      (assoc :constraints dataset-query-api-constraints))
    :started_at   true
    :finished_at  true
    :running_time true
    :version      0}]
  (tu/with-temp Card [{card-id :id} {:name                   "Dataset Test Card"
                                     :creator_id             (user->id :rasta)
                                     :public_perms           0
                                     :display                "scalar"
                                     :dataset_query          (ql/wrap-inner-query
                                                               (query checkins
                                                                      (ql/aggregation (ql/count))))
                                     :visualization_settings {}}]
    (let [result ((user->client :rasta) :get 200 (format "dataset/card/%d" card-id))]
      [(-> result
           (update :card remove-ids-and-boolean-timestamps)
           (update :result format-response))
       (format-response (sel :one QueryExecution :uuid (get-in result [:result :uuid])))])))
