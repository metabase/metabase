(ns ^:mb/driver-tests metabase.query-processor-test.coercion-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.jvm :as lib.metadata.jvm]
   [metabase.lib.test-util :as lib.tu]
   [metabase.query-processor :as qp]
   [metabase.query-processor.store :as qp.store]
   [metabase.test :as mt]
   [metabase.types :as types]))

(set! *warn-on-reflection* true)

(deftest string-to-float-coercion-test
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

(deftest string-to-integer-coercion-test
  (mt/test-drivers
    (mt/normal-drivers)
    (mt/dataset
      string-nums-db
      (doseq [[human-col col res] [["integer" :int_col   (biginteger 10)]]]
        (let [mp (lib.tu/merged-mock-metadata-provider
                  (lib.metadata.jvm/application-database-metadata-provider (mt/id))
                  {:fields [{:id                (mt/id :string_nums col)
                             :coercion-strategy :Coercion/String->Integer
                             :effective-type    :type/Integer}]})
              query (-> (lib/query mp (lib.metadata/table mp (mt/id :string_nums)))
                        (lib/aggregate (lib/sum (lib.metadata/field mp (mt/id :string_nums col)))))]
          (testing (format "String->Integer coercion works with %s" human-col)
            (let [coerced-number (->> (qp.store/with-metadata-provider mp
                                        (qp/process-query query))
                                      (mt/rows)
                                      ffirst)]

              (is (or (integer? coerced-number)
                      (instance? BigDecimal coerced-number)))
              (is (= res
                     (biginteger coerced-number))))))))))

(deftest float-to-integer-coercion-test
  (mt/test-drivers
    (mt/normal-drivers)
    (mt/dataset
      rounding-nums-db
      (doseq [[human-col col res] [["floats that round up"   :float_up_col   (biginteger 15)]
                                   ["floats that round down" :float_down_col (biginteger 10)]]]
        (let [mp (lib.tu/merged-mock-metadata-provider
                  (lib.metadata.jvm/application-database-metadata-provider (mt/id))
                  {:fields [{:id                (mt/id :nums col)
                             :coercion-strategy :Coercion/Float->Integer
                             :effective-type    :type/Integer}]})
              query (-> (lib/query mp (lib.metadata/table mp (mt/id :nums)))
                        (lib/aggregate (lib/sum (lib.metadata/field mp (mt/id :nums col)))))]
          (testing (format "Float->Integer coercion works with %s" human-col)
            (let [coerced-number (->> (qp.store/with-metadata-provider mp
                                        (qp/process-query query))
                                      (mt/rows)
                                      ffirst)]

              (is (or (integer? coerced-number)
                      (instance? BigDecimal coerced-number)))
              (is (= res
                     (biginteger coerced-number))))))))))

(defn- date-type? [col]
  (some #(types/field-is-type? % col) [:type/DateTime ;; some databases return datetimes for date (e.g., Oracle)
                                       :type/Text ;; sqlite uses text :(
                                       :type/Date]))

(defn- parse-date [s]
  (try
    (let [instant (-> s java.time.Instant/parse (.atZone (java.time.ZoneId/of "UTC")))]
      (is (zero? (.getHour   instant)))
      (is (zero? (.getMinute instant)))
      (is (zero? (.getSecond instant)))
      (.toLocalDate instant))
    (catch Exception _
      (-> s java.time.LocalDate/parse))))

(deftest datetime-to-date-coercion-test
  (mt/test-drivers (mt/normal-drivers)
    (doseq [[human-col table col] [["orders created_at (timestamptz)" :orders :created_at]
                                   ["users last_login (timestamp)"    :users  :last_login]]]
      (testing (format "DateTime->Date coercion works with %s" human-col)
        (let [mp (lib.tu/merged-mock-metadata-provider
                  (lib.metadata.jvm/application-database-metadata-provider (mt/id))
                  {:fields [{:id                (mt/id table col)
                             :coercion-strategy :Coercion/DateTime->Date
                             :effective-type    :type/Date}]})
              query (-> (lib/query mp (lib.metadata/table mp (mt/id table)))
                        (lib/with-fields [(lib.metadata/field mp (mt/id table col))])
                        (lib/limit 10))
              result (qp/process-query query)
              cols (mt/cols result)
              rows (mt/rows result)
              col (last cols)]
          (is (date-type? col))
          (doseq [[date-col] rows]
            (is (parse-date date-col))))))))
