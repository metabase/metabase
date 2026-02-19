(ns ^:mb/driver-tests metabase.driver.clickhouse-substitution-test
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.query-processor :as qp]
   [metabase.query-processor.compile :as qp.compile]
   [metabase.test :as mt]
   [metabase.test.data.clickhouse :as ctd]
   [metabase.util :as u]
   [schema.core :as s])
  (:import (java.time LocalDate LocalDateTime)))

(set! *warn-on-reflection* true)

(defn- get-mbql
  [value db]
  (let [uuid (str (java.util.UUID/randomUUID))]
    {:database (mt/id)
     :type "native"
     :native {:collection "test-table"
              :template-tags
              {:x {:id uuid
                   :name "d"
                   :display-name "D"
                   :type "dimension"
                   :dimension ["field" (mt/id :test-table :d) nil]
                   :required true}}
              :query (format "SELECT * FROM `%s`.`test_table` WHERE {{x}}" db)}
     :parameters [{:type "date/all-options"
                   :value value
                   :target ["dimension" ["template-tag" "x"]]
                   :id uuid}]}))

(def ^:private clock (t/mock-clock (t/instant "2019-11-30T23:00:00Z") (t/zone-id "UTC")))
(s/defn ^:private local-date-now      :- LocalDate     [] (LocalDate/now clock))
(s/defn ^:private local-date-time-now :- LocalDateTime [] (LocalDateTime/now clock))

(deftest ^:parallel clickhouse-variables-field-filters-datetime-and-datetime64
  (mt/test-driver :clickhouse
    (mt/with-clock clock
      (letfn
       [(->clickhouse-input
          [^LocalDateTime ldt]
          [(t/format "yyyy-MM-dd HH:mm:ss" ldt)])
        (get-test-table
          [rows native-type]
          [["test_table"
            [{:field-name "d"
              :base-type {:native native-type}}]
            (map ->clickhouse-input rows)]])
        (->iso-str
          [^LocalDateTime ldt]
          (t/format "yyyy-MM-dd'T'HH:mm:ss'Z'" ldt))]
        (doseq [base-type ["DateTime" "DateTime64"]]
          (testing base-type
            (testing "on specific"
              (let [db    (format "mb_vars_on_x_%s"
                                  (u/lower-case-en base-type))
                    now   (local-date-time-now)
                    row1  (.minusHours   now 14)
                    row2  (.minusMinutes now 20)
                    row3  (.plusMinutes  now 5)
                    row4  (.plusHours    now 6)
                    table (get-test-table [row1 row2 row3 row4] base-type)]
                (mt/dataset
                  (mt/dataset-definition db table)
                  (testing "date"
                    (is (= [[(->iso-str row1)] [(->iso-str row2)] [(->iso-str row3)]]
                           (ctd/rows-without-index (qp/process-query (get-mbql "2019-11-30" db))))))
                  (testing "datetime"
                    (is (= [[(->iso-str row2)]]
                           (ctd/rows-without-index (qp/process-query (get-mbql "2019-11-30T22:40:00" db)))))))))
            (testing "past/next minutes"
              (let [db    (format "mb_vars_m_%s"
                                  (u/lower-case-en base-type))
                    now   (local-date-time-now)
                    row1  (.minusHours   now 14)
                    row2  (.minusMinutes now 20)
                    row3  (.plusMinutes  now 5)
                    row4  (.plusHours    now 6)
                    table (get-test-table [row1 row2 row3 row4] base-type)]
                (mt/dataset
                  (mt/dataset-definition db table)
                  (testing "past30minutes"
                    (is (= [[(->iso-str row2)]]
                           (ctd/rows-without-index (qp/process-query (get-mbql "past30minutes" db))))))
                  (testing "next30minutes"
                    (is (= [[(->iso-str row3)]]
                           (ctd/rows-without-index (qp/process-query (get-mbql "next30minutes" db)))))))))
            (testing "past/next hours"
              (let [db    (format "mb_vars__past_next_hours_%s"
                                  (u/lower-case-en base-type))
                    now   (local-date-time-now)
                    row1  (.minusHours now 14)
                    row2  (.minusHours now 2)
                    row3  (.plusHours  now 25)
                    row4  (.plusHours  now 6)
                    table (get-test-table [row1 row2 row3 row4] base-type)]
                (mt/dataset
                  (mt/dataset-definition db table)
                  (testing "past12hours"
                    (is (= [[(->iso-str row2)]]
                           (ctd/rows-without-index (qp/process-query (get-mbql "past12hours" db))))))
                  (testing "next12hours"
                    (is (= [[(->iso-str row4)]]
                           (ctd/rows-without-index (qp/process-query (get-mbql "next12hours" db)))))))))
            (testing "past/next days"
              (let [db    (format "mb_vars_d_%s"
                                  (u/lower-case-en base-type))
                    now   (local-date-time-now)
                    row1  (.minusDays now 14)
                    row2  (.minusDays now 2)
                    row3  (.plusDays  now 25)
                    row4  (.plusDays  now 6)
                    table (get-test-table [row1 row2 row3 row4] base-type)]
                (mt/dataset
                  (mt/dataset-definition db table)
                  (testing "past12days"
                    (is (= [[(->iso-str row2)]]
                           (ctd/rows-without-index (qp/process-query (get-mbql "past12days" db))))))
                  (testing "next12days"
                    (is (= [[(->iso-str row4)]]
                           (ctd/rows-without-index (qp/process-query (get-mbql "next12days" db)))))))))
            (testing "past/next months/quarters"
              (let [db    (format "mb_vars_m_q_%s"
                                  (u/lower-case-en base-type))
                    now   (local-date-time-now)
                    row1  (.minusMonths now 14)
                    row2  (.minusMonths now 4)
                    row3  (.plusMonths  now 25)
                    row4  (.plusMonths  now 6)
                    table (get-test-table [row1 row2 row3 row4] base-type)]
                (mt/dataset
                  (mt/dataset-definition db table)
                  (testing "past12months"
                    (is (= [[(->iso-str row2)]]
                           (ctd/rows-without-index (qp/process-query (get-mbql "past12months" db))))))
                  (testing "next12months"
                    (is (= [[(->iso-str row4)]]
                           (ctd/rows-without-index (qp/process-query (get-mbql "next12months" db))))))
                  (testing "past3quarters"
                    (is (= [[(->iso-str row2)]]
                           (ctd/rows-without-index (qp/process-query (get-mbql "past3quarters" db))))))
                  (testing "next3quarters"
                    (is (= [[(->iso-str row4)]]
                           (ctd/rows-without-index (qp/process-query (get-mbql "next3quarters" db)))))))))
            (testing "past/next years"
              (let [db    (format "mb_vars_y_%s"
                                  (u/lower-case-en base-type))
                    now   (local-date-time-now)
                    row1  (.minusYears now 14)
                    row2  (.minusYears now 4)
                    row3  (.plusYears  now 25)
                    row4  (.plusYears  now 6)
                    table (get-test-table [row1 row2 row3 row4] base-type)]
                (mt/dataset
                  (mt/dataset-definition db table)
                  (testing "past12years"
                    (is (= [[(->iso-str row2)]]
                           (ctd/rows-without-index (qp/process-query (get-mbql "past12years" db))))))
                  (testing "next12years"
                    (is (= [[(->iso-str row4)]]
                           (ctd/rows-without-index (qp/process-query (get-mbql "next12years" db)))))))))))))))

(deftest ^:parallel clickhouse-variables-field-filters-date-and-date32
  (mt/test-driver :clickhouse
    (mt/with-clock clock
      (letfn
       [(->clickhouse-input
          [^LocalDate ld]
          [(t/format "yyyy-MM-dd" ld)])
        (get-test-table
          [rows native-type]
          [["test_table"
            [{:field-name "d"
              :base-type {:native native-type}}]
            (map ->clickhouse-input rows)]])
        (->iso-str
          [^LocalDate ld]
          (str (t/format "yyyy-MM-dd" ld) "T00:00:00Z"))]
        (doseq [base-type ["Date" "Date32"]]
          (testing base-type
            (testing "on specific date"
              (let [db    (format "mb_vars_on_x_%s"
                                  (u/lower-case-en base-type))
                    now   (local-date-time-now)
                    row1  (.minusDays now 14)
                    row2  now
                    row3  (.plusDays  now 25)
                    row4  (.plusDays  now 6)
                    table (get-test-table [row1 row2 row3 row4] base-type)]
                (mt/dataset
                  (mt/dataset-definition db table)
                  (is (= [[(->iso-str row2)]]
                         (ctd/rows-without-index (qp/process-query (get-mbql "2019-11-30" db))))))))
            (testing "past/next days"
              (let [db    (format "mb_vars_d_%s"
                                  (u/lower-case-en base-type))
                    now   (local-date-now)
                    row1  (.minusDays now 14)
                    row2  (.minusDays now 2)
                    row3  (.plusDays  now 25)
                    row4  (.plusDays  now 6)
                    table (get-test-table [row1 row2 row3 row4] base-type)]
                (mt/dataset
                  (mt/dataset-definition db table)
                  (testing "past12days"
                    (is (= [[(->iso-str row2)]]
                           (ctd/rows-without-index (qp/process-query (get-mbql "past12days" db))))))
                  (testing "next12days"
                    (is (= [[(->iso-str row4)]]
                           (ctd/rows-without-index (qp/process-query (get-mbql "next12days" db)))))))))
            (testing "past/next months/quarters"
              (let [db    (format "mb_vars_m_q_%s"
                                  (u/lower-case-en base-type))
                    now   (local-date-now)
                    row1  (.minusMonths now 14)
                    row2  (.minusMonths now 4)
                    row3  (.plusMonths  now 25)
                    row4  (.plusMonths  now 6)
                    table (get-test-table [row1 row2 row3 row4] base-type)]
                (mt/dataset
                  (mt/dataset-definition db table)
                  (testing "past12months"
                    (is (= [[(->iso-str row2)]]
                           (ctd/rows-without-index (qp/process-query (get-mbql "past12months" db))))))
                  (testing "next12months"
                    (is (= [[(->iso-str row4)]]
                           (ctd/rows-without-index (qp/process-query (get-mbql "next12months" db))))))
                  (testing "past3quarters"
                    (is (= [[(->iso-str row2)]]
                           (ctd/rows-without-index (qp/process-query (get-mbql "past3quarters" db))))))
                  (testing "next3quarters"
                    (is (= [[(->iso-str row4)]]
                           (ctd/rows-without-index (qp/process-query (get-mbql "next3quarters" db)))))))))
            (testing "past/next years"
              (let [db    (format "mb_vars_y_%s"
                                  (u/lower-case-en base-type))
                    now   (local-date-now)
                    row1  (.minusYears now 14)
                    row2  (.minusYears now 4)
                    row3  (.plusYears  now 25)
                    row4  (.plusYears  now 6)
                    table (get-test-table [row1 row2 row3 row4] base-type)]
                (mt/dataset
                  (mt/dataset-definition db table)
                  (testing "past12years"
                    (is (= [[(->iso-str row2)]]
                           (ctd/rows-without-index (qp/process-query (get-mbql "past12years" db))))))
                  (testing "next12years"
                    (is (= [[(->iso-str row4)]]
                           (ctd/rows-without-index (qp/process-query (get-mbql "next12years" db)))))))))))))))

(deftest ^:parallel clickhouse-variables-field-filters-null-dates
  (mt/test-driver :clickhouse
    (mt/with-clock clock
      (letfn
       [(->input-ld
          [^LocalDate ld]
          [(t/format "yyyy-MM-dd" ld)])
        (->input-ldt
          [^LocalDateTime ldt]
          [(t/format "yyyy-MM-dd HH:mm:ss" ldt)])
        (->iso-str-ld
          [^LocalDate ld]
          (str (t/format "yyyy-MM-dd" ld) "T00:00:00Z"))
        (->iso-str-ldt
          [^LocalDateTime ldt]
          (t/format "yyyy-MM-dd'T'HH:mm:ss'Z'" ldt))]
        (let [db         "mb_vars_null_dates"
              now-ld     (local-date-now)
              now-ldt    (local-date-time-now)
              table      [["test_table"
                           [{:field-name "d"
                             :base-type {:native "Nullable(Date)"}}
                            {:field-name "d32"
                             :base-type {:native "Nullable(Date32)"}}
                            {:field-name "dt"
                             :base-type {:native "Nullable(DateTime)"}}
                            {:field-name "dt64"
                             :base-type {:native "Nullable(DateTime64)"}}]
                           [;; row 1
                            [(->input-ld now-ld) nil (->input-ldt now-ldt) nil]
                            ;; row 2
                            [nil (->input-ld now-ld) nil (->input-ldt now-ldt)]]]]
              first-row  [[(->iso-str-ld now-ld) nil (->iso-str-ldt now-ldt) nil]]
              second-row [[nil (->iso-str-ld now-ld) nil (->iso-str-ldt now-ldt)]]]
          (mt/dataset
            (mt/dataset-definition db table)
            (letfn
             [(get-mbql*
                [field value]
                (let [uuid (str (java.util.UUID/randomUUID))]
                  {:database (mt/id)
                   :type "native"
                   :native {:collection "test-table"
                            :template-tags
                            {:x {:id uuid
                                 :name (str field)
                                 :display-name (str field)
                                 :type "dimension"
                                 :dimension ["field" (mt/id :test-table field) nil]
                                 :required true}}
                            :query (format "SELECT * FROM `%s`.`test_table` WHERE {{x}}" db)}
                   :parameters [{:type "date/all-options"
                                 :value value
                                 :target ["dimension" ["template-tag" "x"]]
                                 :id uuid}]}))]
              (testing "first row (Date field match)"
                (is (= first-row (ctd/rows-without-index (qp/process-query (get-mbql* :d "2019-11-30"))))))
              (testing "first row (DateTime field match)"
                (is (= first-row (ctd/rows-without-index (qp/process-query (get-mbql* :dt "2019-11-30T23:00:00"))))))
              (testing "second row (Date32 field match)"
                (is (= second-row (ctd/rows-without-index (qp/process-query (get-mbql* :d32 "2019-11-30"))))))
              (testing "second row (DateTime64 field match)"
                (is (= second-row (ctd/rows-without-index (qp/process-query (get-mbql* :dt64 "2019-11-30T23:00:00")))))))))))))

(deftest ^:parallel variable-filter-with-question-mark-test
  (mt/test-driver :clickhouse
    (testing "a query with a variable filter that includes a question mark will work as expected"
      (let [uuid (str (java.util.UUID/randomUUID))]
        (is (= [["?"]]
               (mt/rows (qp/process-query
                         {:database (mt/id)
                          :type "native"
                          :native {:collection "products"
                                   :template-tags
                                   {:x {:id uuid
                                        :default "Gizmo"
                                        :name "x"
                                        :display-name "X"
                                        :type "text"}}
                                   :query  "select '?' from test_data.products where category = {{x}} limit 1"}
                          :parameters [{:type "category"
                                        :value "Gizmo"
                                        :target ["variable" ["template-tag" "x"]]
                                        :id uuid}]}))))))))

(deftest clickhouse-native-query-with-uuid-filter-test
  (mt/test-driver :clickhouse
    (let [uuid-1 #uuid "3127abff-e634-4114-a015-59893b49ae74"
          uuid-2 #uuid "a65e1a3b-4710-4136-b5b7-63a747e17a5a"]
      (mt/dataset
        (mt/dataset-definition "uuid_filter_db"
                               [["uuid_filter_table"
                                 [{:field-name "uuid"
                                   :base-type {:native "UUID"}
                                   :semantic-type :type/PK}
                                  {:field-name "value"
                                   :base-type :type/Integer}]
                                 [[uuid-1 10]
                                  [uuid-2 20]]]])
        (let [query {:database   (mt/id)
                     :type       :native
                     :native     {:query         "select sum(value) from `uuid_filter_db`.`uuid_filter_table` where {{uuid}}"
                                  :template-tags {"uuid" {:type         :dimension
                                                          :dimension    ["field" (mt/id :uuid_filter_table :uuid) nil]
                                                          :default      [(str uuid-2)]
                                                          :name         "uuid"
                                                          :display-name "UUID"
                                                          :widget-type  "id"}}}
                     :parameters [{:type   "id"
                                   :target [:dimension [:template-tag "uuid"]]
                                   :value  [(str uuid-2)]}]}]
          (is (= [[20]]
                 (mt/formatted-rows [int]
                                    (qp/process-query query))))
          (is (= (str "select sum(value) from `uuid_filter_db`.`uuid_filter_table` "
                      (format "where `uuid_filter_db`.`uuid_filter_table`.`uuid` IN (CAST('%s' AS UUID))" uuid-2))
                 (:query (qp.compile/compile-with-inline-parameters query)))))))))

