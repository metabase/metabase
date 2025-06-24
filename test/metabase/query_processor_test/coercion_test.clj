(ns ^:mb/driver-tests metabase.query-processor-test.coercion-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.jvm :as lib.metadata.jvm]
   [metabase.lib.test-util :as lib.tu]
   [metabase.query-processor :as qp]
   [metabase.query-processor.store :as qp.store]
   [metabase.test :as mt]))

(deftest string-to-number-coercion-test
  (mt/test-drivers
    (mt/normal-drivers)
    (mt/dataset
      string-nums-db
      (doseq [[human-col col res] [["integer" :int_col   10.0]
                                   ["float"   :float_col 12.5]
                                   ["mixed"   :mix_col   7.259]]]
        (let [mp (lib.tu/merged-mock-metadata-provider
                  (lib.metadata.jvm/application-database-metadata-provider (mt/id))
                  {:fields [{:id                (mt/id :string_nums col)
                             :coercion-strategy :Coercion/String->Float
                             :effective-type    :type/Float}]})
              query (-> (lib/query mp (lib.metadata/table mp (mt/id :string_nums)))
                        (lib/aggregate (lib/sum (lib.metadata/field mp (mt/id :string_nums col)))))]
          (testing (format "String->Float coercion works with %s" human-col)
            (is (= res
                   (->> (qp.store/with-metadata-provider mp
                          (qp/process-query query))
                        (mt/formatted-rows [3.0])
                        ffirst)))))))))
