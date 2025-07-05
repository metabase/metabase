(ns ^:mb/driver-tests metabase.query-processor.persistence-test
  (:require
   [clojure.core.async :as a]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [honey.sql :as sql]
   [metabase.driver :as driver]
   [metabase.driver.ddl.interface :as ddl.i]
   [metabase.query-processor :as qp]
   [metabase.query-processor.metadata :as qp.metadata]
   [metabase.query-processor.middleware.fix-bad-references :as fix-bad-refs]
   [metabase.query-processor.settings :as qp.settings]
   [metabase.system.core :as system]
   [metabase.test :as mt]
   [metabase.test.data.interface :as tx]
   [toucan2.core :as t2])
  (:import
   (java.time Instant)
   (java.time.temporal ChronoUnit)))

(set! *warn-on-reflection* true)

(defmulti can-persist-test-honeysql-quote-style
  {:arglists '([driver])}
  tx/dispatch-on-driver-with-test-extensions
  :hierarchy #'driver/hierarchy)

(defmethod can-persist-test-honeysql-quote-style :default
  [_driver]
  :ansi)

(defmethod can-persist-test-honeysql-quote-style :mysql
  [_driver]
  :mysql)

(deftest can-persist-test
  (testing "Can each database that allows for persistence actually persist"
    (mt/test-drivers (mt/normal-drivers-with-feature :persist-models)
      (testing (str driver/*driver* " can persist")
        (mt/dataset test-data
          (let [[success? error] (ddl.i/check-can-persist (mt/db))]
            (is success? (str "Not able to persist on " driver/*driver*))
            (is (= :persist.check/valid error)))
          (testing "Populates the `cache_info` table with v1 information"
            (let [schema-name (ddl.i/schema-name (mt/db) (system/site-uuid))
                  query       {:query
                               (first
                                (sql/format {:select [:key :value]
                                             :from   [(keyword schema-name "cache_info")]}
                                            {:dialect (can-persist-test-honeysql-quote-style driver/*driver*)}))}
                  values      (into {} (->> query mt/native-query qp/process-query mt/rows))]
              (is (partial= {"settings-version" "1"
                             "instance-uuid"    (system/site-uuid)}
                            (into {} (->> query mt/native-query qp/process-query mt/rows))))
              (let [[low high]       [(.minus (Instant/now) 1 ChronoUnit/MINUTES)
                                      (.plus (Instant/now) 1 ChronoUnit/MINUTES)]
                    ^Instant created (some-> (get values "created-at")
                                             (java.time.Instant/parse))]
                (if created
                  (is (and (.isAfter created low) (.isBefore created high))
                      "Date was not created recently")
                  (throw (ex-info "Did not find `created-at` in `cache_info` table"
                                  {})))))))))))

(deftest persisted-models-max-rows-test
  (testing "Persisted models should have the full number of rows of the underlying query,
            not limited by `absolute-max-results` (#24793)"
    (with-redefs [qp.settings/absolute-max-results 3]
      (mt/test-drivers (mt/normal-drivers-with-feature :persist-models)
        (mt/dataset daily-bird-counts
          (mt/with-persistence-enabled! [persist-models!]
            (mt/with-temp [:model/Card model {:type          :model
                                              :database_id   (mt/id)
                                              :query_type    :query
                                              :dataset_query {:database (mt/id)
                                                              :type     :query
                                                              :query    {:source-table (mt/id :bird-count)}}}]
              (let [;; Get the number of rows before the model is persisted
                    query-on-top       (mt/mbql-query nil
                                         {:aggregation  [[:count]]
                                          :source-table (str "card__" (:id model))})
                    [[num-rows-query]] (mt/rows (qp/process-query query-on-top))]
                ;; Persist the model
                (persist-models!)
                ;; Check the number of rows is the same after persisting
                (let [query-on-top (mt/mbql-query nil
                                     {:aggregation [[:count]]
                                      :source-table (str "card__" (:id model))})]
                  (is (= [[num-rows-query]] (mt/rows (qp/process-query query-on-top)))))))))))))

;; sandbox tests in metabase-enterprise.sandbox.query-processor.middleware.row-level-restrictions-test
;; impersonation tests in metabase-enterprise.advanced-permissions.driver.impersonation-test

(defn- populate-metadata [{query :dataset_query, id :id, :as _model}]
  (let [updater (a/thread
                  (let [metadata (-> query
                                     #_{:clj-kondo/ignore [:deprecated-var]}
                                     (qp.metadata/legacy-result-metadata nil))]
                    (t2/update! :model/Card id {:result_metadata metadata})))]
    ;; 4 seconds is long but redshift can be a little slow
    (when (= ::timed-out (mt/wait-for-result updater 4000 ::timed-out))
      (throw (ex-info "Query metadata not set in time for querying against model"
                      {:location `populate-metadata})))))

(deftest persisted-models-complex-queries-test
  (testing "Can use aggregations and custom columns with persisted models (#28679)"
    (mt/test-drivers (mt/normal-drivers-with-feature :persist-models)
      (mt/dataset test-data
        (doseq [[query-type query] [[:query (mt/mbql-query products)]
                                    #_[:native (mt/native-query
                                                 (qp.compile/compile
                                                  (mt/mbql-query products)))]]]
          (mt/with-persistence-enabled! [persist-models!]
            (mt/with-temp [:model/Card model {:type          :model
                                              :database_id   (mt/id)
                                              :query_type    query-type
                                              :dataset_query query}]
              (when (= query-type :native)
                ;; mbql we figure out metadata from query itself. native is opaque and must have metadata in order to
                ;; know which fields are in the model.
                (populate-metadata model))
              (persist-models!)
              (let [bad-refs (atom [])
                    price-field (case query-type
                                  :query (mt/$ids $products.price)
                                  :native [:field "price" {:base-type :type/Float}])
                    category-field (case query-type
                                     :query (mt/$ids $products.category)
                                     :native [:field "category" {:base-type :type/Text}])
                    query   (mt/mbql-query nil
                              {:source-table (str "card__" (:id model))
                               :expressions {"adjective"
                                             [:case
                                              [[[:> price-field 30] "expensive"]
                                               [[:> price-field 20] "not too bad"]]
                                              {:default "not expensive"}]}
                               :aggregation [[:count]]
                               :breakout [[:expression "adjective" nil]
                                          category-field]})
                    results (binding [fix-bad-refs/*bad-field-reference-fn*
                                      (fn [x]
                                        (swap! bad-refs conj x))]
                              (qp/process-query query))
                    persisted-schema (ddl.i/schema-name (mt/db) (system/site-uuid))]
                (testing "Was persisted"
                  (is (str/includes? (-> results :data :native_form :query) persisted-schema)))
                (testing "Did not find bad field clauses"
                  (is (= [] @bad-refs)))))))))))

(deftest persisted-models-complex-queries-joins-test
  (testing "Can use joins with persisted models (#28902)"
    (mt/test-drivers (mt/normal-drivers-with-feature :persist-models)
      (mt/dataset test-data
        (mt/with-persistence-enabled! [persist-models!]
          (mt/with-temp [:model/Card model {:type        :model
                                            :database_id (mt/id)
                                            :query_type  :query
                                            :dataset_query
                                            (mt/mbql-query orders
                                              {:fields [$total &products.products.category]
                                               :joins [{:source-table $$products
                                                        :condition [:= $product_id &products.products.id]
                                                        :strategy :left-join
                                                        :alias "products"}]})}]
            (persist-models!)
            (let [query   {:type :query
                           :database (mt/id)
                           :query {:source-table (str "card__" (:id model))}}
                  results (qp/process-query query)
                  persisted-schema (ddl.i/schema-name (mt/db) (system/site-uuid))]
              (testing "Was persisted"
                (is (str/includes? (-> results :data :native_form :query) persisted-schema))))
            (let [query (mt/mbql-query nil
                          {:source-table (str "card__" (:id model))
                           :aggregation [[:count]]
                           :breakout [$products.category]})
                  results (qp/process-query query)
                  persisted-schema (ddl.i/schema-name (mt/db) (system/site-uuid))]
              (testing "Was persisted"
                (is (str/includes? (-> results :data :native_form :query) persisted-schema)))
              (is (= {"Doohickey" 3976, "Gadget" 4939,
                      "Gizmo"     4784, "Widget" 5061}
                     (->> results :data :rows (into {})))))))))))
