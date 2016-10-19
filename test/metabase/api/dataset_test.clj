(ns metabase.api.dataset-test
  "Unit tests for /api/dataset endpoints."
  (:require [clojure.string :as s]
            [expectations :refer :all]
            [metabase.api.dataset :refer [query-constraints]]
            [metabase.db :as db]
            (metabase.models [card :refer [Card]]
                             [query-execution :refer [QueryExecution]])
            [metabase.query-processor.expand :as ql]
            [metabase.test.data.users :refer :all]
            [metabase.test.data :refer :all]
            [metabase.test.util :as tu]))


(defn user-details [user]
  (tu/match-$ user
    {:email        $
     :date_joined  $
     :first_name   $
     :last_name    $
     :last_login   $
     :is_superuser $
     :is_qbnewb    $
     :common_name  $}))

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
             (cond
               (contains? #{:id :uuid :started_at :finished_at :running_time} k) [k (boolean v)]
               (= :data k) [k (if-not (contains? v :native_form)
                                v
                                (update v :native_form boolean))]
               :else [k v]))))

;;; ## POST /api/meta/dataset
;; Just a basic sanity check to make sure Query Processor endpoint is still working correctly.
(expect
  ;; the first result is directly from the api call
  ;; the second result is checking our QueryExection log to ensure it captured the right details
  [{:data         {:rows    [[1000]]
                   :columns ["count"]
                   :cols    [{:base_type "type/Integer", :special_type "type/Number", :name "count", :display_name "count", :id nil, :table_id nil,
                              :description nil, :target nil, :extra_info {}, :source "aggregation"}]
                   :native_form true}
    :row_count    1
    :status       "completed"
    :id           true
    :uuid         true
    :json_query   (-> (wrap-inner-query
                        (query checkins
                               (ql/aggregation (ql/count))))
                      (assoc :type "query")
                      (assoc-in [:query :aggregation] {:aggregation-type "count"})
                      (assoc :constraints query-constraints))
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
    :json_query   (-> (wrap-inner-query
                        (query checkins
                               (ql/aggregation (ql/count))))
                      (assoc :type "query")
                      (assoc-in [:query :aggregation] {:aggregation-type "count"})
                      (assoc :constraints query-constraints))
    :started_at   true
    :finished_at  true
    :running_time true
    :version      0}]
  (let [result ((user->client :rasta) :post 200 "dataset" (wrap-inner-query
                                                            (query checkins
                                                                   (ql/aggregation (ql/count)))))]
    [(format-response result)
     (format-response (QueryExecution :uuid (:uuid result)))]))


;; Even if a query fails we still expect a 200 response from the api
(expect
  ;; the first result is directly from the api call
  ;; the second result is checking our QueryExection log to ensure it captured the right details
  (let [output {:data         {:rows    []
                               :columns []
                               :cols    []}
                :row_count    0
                :status       "failed"
                :error        true
                :id           true
                :uuid         true
                :json_query   {:database    (id)
                               :type        "native"
                               :native      {:query "foobar"}
                               :constraints query-constraints}
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
  ;; Error message's format can differ a bit depending on DB version and the comment we prepend to it, so check that it exists and contains the substring "Syntax error in SQL statement"
  (let [check-error-message (fn [output]
                              (update output :error (fn [error-message]
                                                      (boolean (re-find #"Syntax error in SQL statement" error-message)))))
        result              ((user->client :rasta) :post 200 "dataset" {:database (id)
                                                                        :type     "native"
                                                                        :native   {:query "foobar"}})]
    [(check-error-message (format-response result))
     (check-error-message (format-response (QueryExecution :uuid (:uuid result))))]))


;; GET /api/dataset/card/:id
(expect
  ;; the first result is directly from the api call
  ;; the second result is checking our QueryExection log to ensure it captured the right details
  [{:card   {:name                   "Dataset Test Card"
             :description            nil
             :creator                (user-details (fetch-user :rasta))
             :display                "table"
             :query_type             "query"
             :dataset_query          (-> (wrap-inner-query
                                           (query checkins
                                             (ql/aggregation (ql/count))))
                                         (assoc :type "query")
                                         (assoc-in [:query :aggregation] {:aggregation-type "count"}))
             :visualization_settings {}
             :created_at             true
             :updated_at             true
             :archived               false}
    :result {:data         {:rows    [[1000]]
                            :columns ["count"]
                            :cols    [{:base_type "type/Integer", :special_type "type/Number", :name "count", :display_name "count", :id nil, :table_id nil,
                                       :description nil, :target nil, :extra_info {}, :source "aggregation"}]
                            :native_form true}
             :row_count    1
             :status       "completed"
             :id           true
             :uuid         true
             :json_query   (-> (wrap-inner-query
                                 (query checkins
                                   (ql/aggregation (ql/count))))
                               (assoc :type "query")
                               (assoc-in [:query :aggregation] {:aggregation-type "count"})
                               (assoc :constraints query-constraints))
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
    :json_query   (-> (wrap-inner-query
                        (query checkins
                          (ql/aggregation (ql/count))))
                      (assoc :type "query")
                      (assoc-in [:query :aggregation] {:aggregation-type "count"})
                      (assoc :constraints query-constraints))
    :started_at   true
    :finished_at  true
    :running_time true
    :version      0}]
  (tu/with-temp Card [{card-id :id} {:name          "Dataset Test Card"
                                     :dataset_query (wrap-inner-query
                                                      (query checkins
                                                        (ql/aggregation (ql/count))))}]
    (let [result ((user->client :rasta) :get 200 (format "dataset/card/%d" card-id))]
      [(-> result
           (update :card remove-ids-and-boolean-timestamps)
           (update :result format-response))
       (format-response (QueryExecution :uuid (get-in result [:result :uuid])))])))
