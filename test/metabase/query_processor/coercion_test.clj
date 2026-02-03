(ns ^:mb/driver-tests metabase.query-processor.coercion-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.test-util :as lib.tu]
   [metabase.lib.test-util.notebook-helpers :as lib.tu.notebook]
   [metabase.query-processor :as qp]
   ^{:clj-kondo/ignore [:deprecated-namespace]} [metabase.query-processor.store :as qp.store]
   [metabase.query-processor.test-util :as qp.test-util]
   [metabase.test :as mt]
   [metabase.types.core :as types]
   [metabase.util.date-2 :as u.date]))

(set! *warn-on-reflection* true)

(deftest ^:parallel string-to-float-coercion-test
  (mt/test-drivers
    (mt/normal-drivers)
    (mt/dataset
      coerced-string-nums-db
      (doseq [[human-col col res] [["integer" :int_col   10.0]
                                   ["float"   :float_col 12.5]
                                   ["mixed"   :mix_col   7.259]]]
        (let [mp (mt/metadata-provider)
              query (-> (lib/query mp (lib.metadata/table mp (mt/id :string_nums)))
                        (lib/aggregate (lib/sum (lib.metadata/field mp (mt/id :string_nums col)))))]
          (testing (format "String->Float coercion works with %s" human-col)
            (is (= res
                   (->> (qp.store/with-metadata-provider mp
                          (qp/process-query query))
                        (mt/formatted-rows [3.0])
                        ffirst)))))))))

(deftest ^:parallel string-to-integer-coercion-test
  (mt/test-drivers
    (mt/normal-drivers)
    (mt/dataset
      coerced-string-nums-db
      (doseq [[human-col col res] [["integer" :int_col   (biginteger 10)]]]
        (let [mp (mt/metadata-provider)
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

(deftest ^:parallel float-to-integer-coercion-test
  (mt/test-drivers
    (mt/normal-drivers)
    (mt/dataset
      rounding-nums-db
      (doseq [[human-col col res] [["floats that round up"   :float_up_col   (biginteger 15)]
                                   ["floats that round down" :float_down_col (biginteger 10)]]]
        (let [mp (lib.tu/merged-mock-metadata-provider
                  (mt/metadata-provider)
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
  ;; legacy usage -- do not use going forward
  #_{:clj-kondo/ignore [:deprecated-var]}
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

(deftest ^:parallel datetime-to-date-coercion-test
  (mt/test-drivers (mt/normal-drivers)
    (doseq [[human-col table col] [["orders created_at (timestamptz)" :orders :created_at]
                                   ["users last_login (timestamp)"    :users  :last_login]]]
      (testing (format "DateTime->Date coercion works with %s" human-col)
        (let [mp (lib.tu/merged-mock-metadata-provider
                  (mt/metadata-provider)
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

(deftest ^:parallel coerced-custom-column-from-join-test
  (testing "Should be able to used a coerced column from a join in expressions (#63890)"
    (mt/test-drivers (mt/normal-drivers-with-feature :left-join :expressions)
      (let [mp    (-> (mt/metadata-provider)
                      (lib.tu/merged-mock-metadata-provider
                       {:fields [{:id                (mt/id :orders :quantity)
                                  :coercion-strategy :Coercion/UNIXMilliSeconds->DateTime
                                  :effective-type    :type/DateTime}]})
                      qp.test-util/mock-fks-application-database-metadata-provider)
            query (-> (lib/query mp (lib.metadata/table mp (mt/id :products)))
                      (lib/join (-> (lib/join-clause (lib.metadata/table mp (mt/id :orders)))
                                    (lib/with-join-alias "Orders")
                                    (lib/with-join-fields :none)))
                      (as-> $query (lib/expression $query "test" (lib.tu.notebook/find-col-with-spec
                                                                  $query
                                                                  (lib/visible-columns $query)
                                                                  {:display-name #".*Orders"}
                                                                  {:display-name "Quantity"})))
                      (as-> $query (lib/with-fields $query [(lib.tu.notebook/find-col-with-spec
                                                             $query
                                                             (lib/visible-columns $query)
                                                             {:display-name #".*Products"}
                                                             {:display-name "ID"})
                                                            (lib.tu.notebook/find-col-with-spec
                                                             $query
                                                             (lib/visible-columns $query)
                                                             {:display-name #".*Orders"}
                                                             {:display-name "ID"})
                                                            (lib.tu.notebook/find-col-with-spec
                                                             $query
                                                             (lib/visible-columns $query)
                                                             {}
                                                             {:display-name "test"})]))
                      (as-> $query (lib/order-by $query (lib.tu.notebook/find-col-with-spec
                                                         $query
                                                         (lib/orderable-columns $query)
                                                         {:display-name #".*Products"}
                                                         {:display-name "ID"})))
                      (as-> $query (lib/order-by $query (lib.tu.notebook/find-col-with-spec
                                                         $query
                                                         (lib/orderable-columns $query)
                                                         {:display-name #".*Orders"}
                                                         {:display-name "ID"})))
                      (lib/limit 3))]
        (mt/with-native-query-testing-context query
          (is (= [[1 448 "1970-01-01T00:00:00.002Z"]
                  [1 493 "1970-01-01T00:00:00.001Z"]
                  [1 607 "1970-01-01T00:00:00.007Z"]]
                 (mt/formatted-rows [int int (fn [s]
                                               (if (string? s)
                                                 (u.date/format "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'" (u.date/parse s))
                                                 s))]
                                    (qp/process-query query)))))))))
