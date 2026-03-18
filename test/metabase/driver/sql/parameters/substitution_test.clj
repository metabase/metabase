(ns metabase.driver.sql.parameters.substitution-test
  "Most of the code in [[metabase.driver.sql.parameters.substitution]] is actually tested by
  [[metabase.driver.sql.parameters.substitute-test]]."
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.driver :as driver]
   ^{:clj-kondo/ignore [:deprecated-namespace]} [metabase.driver.common.parameters :as params]
   [metabase.driver.sql.parameters.substitution :as sql.params.substitution]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.test-metadata :as meta]
   ^{:clj-kondo/ignore [:deprecated-namespace]} [metabase.query-processor.store :as qp.store]
   [metabase.test :as mt]
   [metabase.util.honey-sql-2 :as h2x]))

(set! *warn-on-reflection* true)

(deftest ^:parallel field->field-filter-clause-test
  (is (=? [:field
           {:base-type                                                           :type/BigInteger
            :metabase.query-processor.util.add-alias-info/source-table           (meta/id :venues)
            :metabase.driver.sql.parameters.substitution/compiling-field-filter? true}
           (meta/id :venues :id)]
          (#'sql.params.substitution/field->field-filter-clause
           :h2
           (meta/field-metadata :venues :id)
           :number/=
           nil))))

(deftest ^:parallel honeysql->replacement-snippet-info-test
  (testing "make sure we handle quotes inside names correctly!"
    (is (= {:replacement-snippet     "\"test-data\".\"PUBLIC\".\"checkins\".\"date\""
            :prepared-statement-args nil}
           (#'sql.params.substitution/honeysql->replacement-snippet-info :h2 :test-data.PUBLIC.checkins.date)))))

(deftest ^:parallel field-filter->replacement-snippet-info-test
  (testing "Ensure native snippet expansion uses proper names for fields (#15460)"
    (mt/with-metadata-provider meta/metadata-provider
      (is (= {:replacement-snippet     "(\"PUBLIC\".\"VENUES\".\"NAME\" = ?)"
              :prepared-statement-args ["Doohickey"]}
             (#'sql.params.substitution/field-filter->replacement-snippet-info
              :h2
              {:field (lib.metadata/field (qp.store/metadata-provider) (meta/id :venues :name))
               :value {:type  :string/=
                       :value ["Doohickey"]}}))))))

(deftest ^:parallel field-filter->replacement-snippet-info-test-2
  (testing "Compound filters should be wrapped in parens"
    (mt/dataset test-data
      (mt/with-metadata-provider meta/metadata-provider
        (is (= {:replacement-snippet     "((\"PUBLIC\".\"PEOPLE\".\"STATE\" <> ?) OR (\"PUBLIC\".\"PEOPLE\".\"STATE\" IS NULL))"
                :prepared-statement-args ["OR"]}
               (#'sql.params.substitution/field-filter->replacement-snippet-info
                :h2
                (params/map->FieldFilter
                 {:field (lib.metadata/field (qp.store/metadata-provider) (meta/id :people :state))
                  :value {:type :string/!=, :slug "state", :value ["OR"]}}))))))))

(deftest ^:parallel card-with-params->replacement-snippet-test
  (testing "Make sure Card params are preserved when expanding a Card reference (#12236)"
    (is (= {:replacement-snippet     "(SELECT * FROM table WHERE x LIKE ?)"
            :prepared-statement-args ["G%"]}
           (sql.params.substitution/->replacement-snippet-info
            :h2
            (params/map->ReferencedCardQuery
             {:card-id 1
              :query   "SELECT * FROM table WHERE x LIKE ?"
              :params  ["G%"]}))))))

;;; ------------------------------------ align-temporal-unit-with-param-type-and-value test ------------------------------------

(driver/register! ::temporal-unit-alignment-original :abstract? true :parent :sql)
(driver/register! ::temporal-unit-alignment-override :abstract? true :parent :sql)

(doseq [driver [::temporal-unit-alignment-original ::temporal-unit-alignment-override]]
  (defmethod driver/database-supports? [driver :set-timezone]
    [_driver _feature _db]
    false))

(defmethod sql.params.substitution/align-temporal-unit-with-param-type-and-value ::temporal-unit-alignment-override
  [_driver _field _param-type _value]
  nil)

(defmethod sql.qp/date [::temporal-unit-alignment-original :minute]
  [_driver _unit expr]
  (h2x/minute expr))

(defmethod sql.qp/date [::temporal-unit-alignment-original :day]
  [_driver _unit expr]
  (h2x/day expr))

(deftest ^:parallel align-temporal-unit-with-param-type-test
  (mt/with-clock #t "2018-07-01T12:30:00.000Z"
    (mt/with-metadata-provider meta/metadata-provider
      (testing "date"
        (let [field-filter (params/map->FieldFilter
                            {:field (lib.metadata/field (qp.store/metadata-provider) (meta/id :orders :created-at))
                             :value {:type :date/all-options, :value "next3days"}})
              expected-args [(t/zoned-date-time 2018 7 2 0 0 0 0 (t/zone-id "UTC"))
                             (t/zoned-date-time 2018 7 5 0 0 0 0 (t/zone-id "UTC"))]]
          (testing "default implementation"
            (driver/with-driver ::temporal-unit-alignment-original
              (is (= {:prepared-statement-args expected-args
                      ;; `sql.qp/date [driver :day]` was called due to `:day` returned from the multimethod by default
                      :replacement-snippet "\"PUBLIC\".\"ORDERS\".\"CREATED_AT\" >= ? AND \"PUBLIC\".\"ORDERS\".\"CREATED_AT\" < ?"}
                     (sql.params.substitution/->replacement-snippet-info ::temporal-unit-alignment-original field-filter)))))
          (testing "override"
            (driver/with-driver ::temporal-unit-alignment-override
              (is (= {:prepared-statement-args expected-args
                      ;; no extra `sql.qp/date` calls due to `nil` returned from the override
                      :replacement-snippet "\"PUBLIC\".\"ORDERS\".\"CREATED_AT\" >= ? AND \"PUBLIC\".\"ORDERS\".\"CREATED_AT\" < ?"}
                     (sql.params.substitution/->replacement-snippet-info ::temporal-unit-alignment-override field-filter)))))))
      (testing "datetime"
        (let [field-filter (params/map->FieldFilter
                            {:field (lib.metadata/field (qp.store/metadata-provider) (meta/id :orders :created-at))
                             :value {:type :date/all-options, :value "past30minutes"}})
              expected-args [(t/zoned-date-time 2018 7 1 12 0 0 0 (t/zone-id "UTC"))
                             (t/zoned-date-time 2018 7 1 12 30 0 0 (t/zone-id "UTC"))]]
          (testing "default implementation"
            (driver/with-driver ::temporal-unit-alignment-original
              (is (= {:prepared-statement-args expected-args
                      ;; `sql.qp/date [driver :day]` was called due to `:day` returned from the multimethod by default
                      :replacement-snippet "\"PUBLIC\".\"ORDERS\".\"CREATED_AT\" >= ? AND \"PUBLIC\".\"ORDERS\".\"CREATED_AT\" < ?"}
                     (sql.params.substitution/->replacement-snippet-info ::temporal-unit-alignment-original field-filter)))))
          (testing "override"
            (driver/with-driver ::temporal-unit-alignment-override
              (is (= {:prepared-statement-args expected-args
                      ;; no extra `sql.qp/date` calls due to `nil` returned from the override
                      :replacement-snippet "\"PUBLIC\".\"ORDERS\".\"CREATED_AT\" >= ? AND \"PUBLIC\".\"ORDERS\".\"CREATED_AT\" < ?"}
                     (sql.params.substitution/->replacement-snippet-info ::temporal-unit-alignment-override field-filter))))))))))

(deftest ^:parallel table-query->replacement-snippet-test
  (testing "Basic table reference without source-filters"
    (mt/with-metadata-provider meta/metadata-provider
      (is (= {:replacement-snippet     "\"PUBLIC\".\"ORDERS\""
              :prepared-statement-args []}
             (sql.params.substitution/->replacement-snippet-info
              :h2
              (params/map->ReferencedTableQuery
               {:table-id (meta/id :orders)}))))))
  (testing "Basic table reference with alias"
    (mt/with-metadata-provider meta/metadata-provider
      (is (= {:replacement-snippet     "\"PUBLIC\".\"ORDERS\" AS \"my_orders\""
              :prepared-statement-args []}
             (sql.params.substitution/->replacement-snippet-info
              :h2
              (params/map->ReferencedTableQuery
               {:table-id (meta/id :orders)
                :alias    "my_orders"})))))))

(deftest ^:parallel table-query-with-source-filters->replacement-snippet-test
  (testing "Table reference with a single source-filter produces a filtered subquery"
    (mt/with-metadata-provider meta/metadata-provider
      (is (= {:replacement-snippet     "(SELECT * FROM \"PUBLIC\".\"ORDERS\" WHERE (\"TOTAL\" > 100))"
              :prepared-statement-args []}
             (sql.params.substitution/->replacement-snippet-info
              :h2
              (params/map->ReferencedTableQuery
               {:table-id       (meta/id :orders)
                :source-filters [{:field-id (meta/id :orders :total)
                                  :op       :>
                                  :value    100}]}))))))
  (testing "Table reference with multiple source-filters joins them with AND"
    (mt/with-metadata-provider meta/metadata-provider
      (is (= {:replacement-snippet     "(SELECT * FROM \"PUBLIC\".\"ORDERS\" WHERE (\"TOTAL\" > 100) AND (\"TOTAL\" <= 500))"
              :prepared-statement-args []}
             (sql.params.substitution/->replacement-snippet-info
              :h2
              (params/map->ReferencedTableQuery
               {:table-id       (meta/id :orders)
                :source-filters [{:field-id (meta/id :orders :total)
                                  :op       :>
                                  :value    100}
                                 {:field-id (meta/id :orders :total)
                                  :op       :<=
                                  :value    500}]}))))))
  (testing "Table reference with a timestamp source-filter value"
    (driver/with-driver ::temporal-unit-alignment-override
      (mt/with-metadata-provider meta/metadata-provider
        (let [ts (t/offset-date-time 2024 1 15 0 0 0 0 (t/zone-offset 0))]
          (is (= {:replacement-snippet     "(SELECT * FROM \"PUBLIC\".\"ORDERS\" WHERE (\"CREATED_AT\" > ?))"
                  :prepared-statement-args [ts]}
                 (sql.params.substitution/->replacement-snippet-info
                  ::temporal-unit-alignment-override
                  (params/map->ReferencedTableQuery
                   {:table-id       (meta/id :orders)
                    :source-filters [{:field-id (meta/id :orders :created-at)
                                      :op       :>
                                      :value    ts}]}))))))))
  (testing "Table reference with source-filters and alias"
    (mt/with-metadata-provider meta/metadata-provider
      (is (= {:replacement-snippet     "(SELECT * FROM \"PUBLIC\".\"ORDERS\" WHERE (\"TOTAL\" > 100)) AS \"src\""
              :prepared-statement-args []}
             (sql.params.substitution/->replacement-snippet-info
              :h2
              (params/map->ReferencedTableQuery
               {:table-id       (meta/id :orders)
                :alias          "src"
                :source-filters [{:field-id (meta/id :orders :total)
                                  :op       :>
                                  :value    100}]})))))))
