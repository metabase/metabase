(ns metabase.query-processor.persistence-test
  (:require [clojure.string :as str]
            [clojure.test :refer :all]
            [metabase.driver :as driver]
            [metabase.driver.ddl.interface :as ddl.i]
            [metabase.models :refer [Card]]
            [metabase.public-settings :as public-settings]
            [metabase.query-processor :as qp]
            [metabase.query-processor.interface :as qp.i]
            [metabase.query-processor.middleware.fix-bad-references
             :as fix-bad-refs]
            [metabase.test :as mt]))

(deftest can-persist-test
  (testing "Can each database that allows for persistence actually persist"
    (mt/test-drivers (mt/normal-drivers-with-feature :persist-models)
      (testing (str driver/*driver* " can persist")
        (mt/dataset test-data
          (let [[success? error] (ddl.i/check-can-persist (mt/db))]
            (is success? (str "Not able to persist on " driver/*driver*))
            (is (= :persist.check/valid error))))))))

(deftest persisted-models-max-rows-test
  (testing "Persisted models should have the full number of rows of the underlying query,
            not limited by `absolute-max-results` (#24793)"
    #_{:clj-kondo/ignore [:discouraged-var]}
    (with-redefs [qp.i/absolute-max-results 3]
      (mt/test-drivers (mt/normal-drivers-with-feature :persist-models)
        (mt/dataset daily-bird-counts
          (mt/with-persistence-enabled [persist-models!]
            (mt/with-temp* [Card [model {:dataset       true
                                         :database_id   (mt/id)
                                         :query_type    :query
                                         :dataset_query {:database (mt/id)
                                                         :type     :query
                                                         :query    {:source-table (mt/id :bird-count)}}}]]
              (let [ ;; Get the number of rows before the model is persisted
                    query-on-top       {:database (mt/id)
                                        :type     :query
                                        :query    {:aggregation  [[:count]]
                                                   :source-table (str "card__" (:id model))}}
                    [[num-rows-query]] (mt/rows (qp/process-query query-on-top))]
                ;; Persist the model
                (persist-models!)
                ;; Check the number of rows is the same after persisting
                (let [query-on-top {:database (mt/id)
                                    :type     :query
                                    :query    {:aggregation [[:count]]
                                               :source-table (str "card__" (:id model))}}]
                  (is (= [[num-rows-query]] (mt/rows (qp/process-query query-on-top)))))))))))))

;; sandbox tests in metabase-enterprise.sandbox.query-processor.middleware.row-level-restrictions-test

(deftest persisted-stuff-rename-nocommit
  (mt/test-drivers (mt/normal-drivers-with-feature :persist-models)
    (mt/dataset sample-dataset
      (mt/with-persistence-enabled [persist-models!]
        (mt/with-temp* [Card [model {:dataset true
                                     :database_id (mt/id)
                                     :query_type :query
                                     :dataset_query (mt/mbql-query products)}]]
          (persist-models!)
          (let [bad-refs (atom [])
                price-field (mt/$ids $products.price)
                category-field (mt/$ids $products.category)
                query   {:type :query
                         :database (mt/id)
                         :query {:source-table (str "card__" (:id model))
                                 :expressions {:adjective
                                               [:case
                                                [[[:> price-field 30] "expensive"]
                                                 [[:> price-field 20] "not too bad"]]
                                                {:default "not expensive"}]}
                                 :aggregation [[:count]]
                                 :breakout [[:expression :adjective]
                                            category-field]}}
                results (binding [fix-bad-refs/*bad-field-reference-fn*
                                  (fn [x]
                                    (swap! bad-refs conj x))]
                          (qp/process-query query))
                persisted-schema (ddl.i/schema-name (mt/db) (public-settings/site-uuid))]
            (testing "Was persisted"
              (is (str/includes? (-> results :data :native_form :query) persisted-schema)))
            (testing "Did not find bad field clauses"
              (is (= [] @bad-refs)))))))))
