(ns metabase-enterprise.serialization.test-util
  (:require [metabase-enterprise.serialization.names :as names]
            [metabase.models :refer [Card Collection Dashboard DashboardCard DashboardCardSeries Database Field Metric
                                     Segment Table]]
            [metabase.test.data :as data]
            [toucan.util.test :as tt]))

(defmacro with-world
  "Run test in the context of a minimal Metabase instance connected to our test database."
  [& body]
  `(tt/with-temp* [Database   [{~'db-id :id} (into {} (-> (data/id)
                                                          Database
                                                          (dissoc :id :features :name)))]
                   Table      [{~'table-id :id} (-> (data/id :venues)
                                                    Table
                                                    (dissoc :id)
                                                    (assoc :db_id ~'db-id))]
                   Field      [{~'numeric-field-id :id} (-> (data/id :venues :price)
                                                            Field
                                                            (dissoc :id)
                                                            (assoc :table_id ~'table-id))]
                   Field      [{~'category-field-id :id} (-> (data/id :venues :category_id)
                                                             Field
                                                             (dissoc :id)
                                                             (assoc :table_id ~'table-id))]
                   Collection [{~'collection-id :id} {:name "My Collection"}]
                   Collection [{~'collection-id-nested :id} {:name "My Nested Collection"
                                                             :location (format "/%s/" ~'collection-id)}]
                   Metric     [{~'metric-id :id} {:name "My Metric"
                                                  :table_id ~'table-id
                                                  :definition {:source-table ~'table-id
                                                               :aggregation [:sum [:field-id ~'numeric-field-id]]}}]

                   Segment    [{~'segment-id :id} {:name "My Segment"
                                                   :table_id ~'table-id
                                                   :definition {:source-table ~'table-id
                                                                :filter [:!= [:field-id ~'category-field-id] nil]}}]
                   Dashboard  [{~'dashboard-id :id} {:name "My Dashboard"
                                                     :collection_id ~'collection-id}]
                   Card       [{~'card-id :id}
                               {:table_id ~'table-id
                                :name "My Card"
                                :collection_id ~'collection-id
                                :dataset_query {:type :query
                                                :database ~'db-id
                                                :query {:source-table ~'table-id
                                                        :aggregation [:sum [:field-id ~'numeric-field-id]]
                                                        :breakout [[:field-id ~'category-field-id]]}}}]
                   Card       [{~'card-id-root :id}
                               {:table_id ~'table-id
                                ;; https://en.wikipedia.org/wiki/Filename#Reserved_characters_and_words
                                :name "My Root Card \\ with a/nasty: (*) //n`me ' * ? \" < > | ŠĐž"
                                :dataset_query {:type :query
                                                :database ~'db-id
                                                :query {:source-table ~'table-id}}}]
                   Card       [{~'card-id-nested :id}
                               {:table_id ~'table-id
                                :name "My Nested Card"
                                :collection_id ~'collection-id
                                :dataset_query {:type :query
                                                :database ~'db-id
                                                :query {:source-table (str "card__" ~'card-id)}}}]
                   DashboardCard       [{~'dashcard-id :id}
                                        {:dashboard_id ~'dashboard-id
                                         :card_id ~'card-id}]
                   DashboardCardSeries [~'_ {:dashboardcard_id ~'dashcard-id
                                             :card_id ~'card-id
                                             :position 0}]
                   DashboardCardSeries [~'_ {:dashboardcard_id ~'dashcard-id
                                             :card_id ~'card-id-nested
                                             :position 1}]]
     ~@body))

;; Don't memoize as IDs change in each `with-world` context
(alter-var-root #'names/path->context (fn [_] #'names/path->context*))
