(ns metabase.api.dataset-test
  "Unit tests for /api/dataset endpoints."
  (:require [expectations :refer :all]
            [metabase.api.dataset :refer [default-query-constraints]]
            [metabase.models.query-execution :refer [QueryExecution]]
            [metabase.query-processor.expand :as ql]
            [metabase.test
             [data :refer :all]
             [util :as tu]]
            [metabase.test.data.users :refer :all]
            [toucan.db :as db]))

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
               (contains? #{:id :started_at :running_time :hash} k) [k (boolean v)]
               (= :data k) [k (if-not (contains? v :native_form)
                                v
                                (update v :native_form boolean))]
               :else [k v]))))

(defn- most-recent-query-execution [] (db/select-one QueryExecution {:order-by [[:id :desc]]}))

;;; ## POST /api/meta/dataset
;; Just a basic sanity check to make sure Query Processor endpoint is still working correctly.
(expect
  [;; API call response
   {:data                   {:rows    [[1000]]
                             :columns ["count"]
                             :cols    [{:base_type "type/Integer", :special_type "type/Number", :name "count", :display_name "count", :id nil, :table_id nil,
                                        :description nil, :target nil, :extra_info {}, :source "aggregation"}]
                             :native_form true}
    :row_count              1
    :status                 "completed"
    :context                "ad-hoc"
    :json_query             (-> (wrap-inner-query
                                  (query checkins
                                    (ql/aggregation (ql/count))))
                                (assoc :type "query")
                                (assoc-in [:query :aggregation] [{:aggregation-type "count", :custom-name nil}])
                                (assoc :constraints default-query-constraints))
    :started_at             true
    :running_time           true
    :average_execution_time nil}
   ;; QueryExecution record in the DB
   {:hash         true
    :row_count    1
    :result_rows  1
    :context      :ad-hoc
    :executor_id  (user->id :rasta)
    :native       false
    :pulse_id     nil
    :card_id      nil
    :dashboard_id nil
    :error        nil
    :id           true
    :started_at   true
    :running_time true}]
  (let [result ((user->client :rasta) :post 200 "dataset" (wrap-inner-query
                                                            (query checkins
                                                              (ql/aggregation (ql/count)))))]
    [(format-response result)
     (format-response (most-recent-query-execution))]))


;; Even if a query fails we still expect a 200 response from the api
(expect
  [;; API call response
   {:data         {:rows    []
                   :columns []
                   :cols    []}
    :row_count    0
    :status       "failed"
    :context      "ad-hoc"
    :error        true
    :json_query   {:database    (id)
                   :type        "native"
                   :native      {:query "foobar"}
                   :constraints default-query-constraints}
    :started_at   true
    :running_time true}
   ;; QueryExecution entry in the DB
   {:hash         true
    :id           true
    :result_rows  0
    :row_count    0
    :context      :ad-hoc
    :error        true
    :started_at   true
    :running_time true
    :executor_id  (user->id :rasta)
    :native       true
    :pulse_id     nil
    :card_id      nil
    :dashboard_id nil}]
  ;; Error message's format can differ a bit depending on DB version and the comment we prepend to it, so check that it exists and contains the substring "Syntax error in SQL statement"
  (let [check-error-message (fn [output]
                              (update output :error (fn [error-message]
                                                      (boolean (re-find #"Syntax error in SQL statement" error-message)))))
        result              ((user->client :rasta) :post 200 "dataset" {:database (id)
                                                                        :type     "native"
                                                                        :native   {:query "foobar"}})]
    [(check-error-message (format-response result))
     (check-error-message (format-response (most-recent-query-execution)))]))
