(ns metabase.warehouse-schema.field-values.distinct-batch-test
  (:require
   [clojure.test :refer :all]
   ^{:clj-kondo/ignore [:deprecated-namespace :discouraged-namespace]} [metabase.query-processor.store :as qp.store]
   [metabase.test :as mt]
   [metabase.warehouse-schema.field-values.distinct-batch :as distinct-batch]
   [toucan2.core :as t2]))

(deftest run-distinct-batch-has-metadata-provider-bound-while-compiling-sql-test
  (testing "the batch's HoneySQL is compiled with an active metadata provider for the field's database, so
            drivers that need one while resolving identifiers (e.g. BigQuery, to qualify table names with
            the project id) can see it. Unlike a normal MBQL query, this SQL is hand-built and compiled
            *before* qp/process-query -- which would otherwise set this up -- ever sees it (metabase#78525)"
    (mt/dataset test-data
      (let [table (t2/select-one :model/Table :id (mt/id :venues))
            price-field (t2/select-one :model/Field :id (mt/id :venues :price))
            initialized-during-build (atom nil)]
        (mt/with-dynamic-fn-redefs [distinct-batch/build-union
                                    (let [orig (mt/original-fn #'distinct-batch/build-union)]
                                      (fn [driver table fields]
                                        (reset! initialized-during-build (qp.store/initialized?))
                                        (orig driver table fields)))]
          (distinct-batch/run-distinct-batch table [price-field]))
        (is (true? @initialized-during-build))))))
