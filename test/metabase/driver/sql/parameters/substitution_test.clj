(ns metabase.driver.sql.parameters.substitution-test
  "Most of the code in [[metabase.driver.sql.parameters.substitution]] is actually tested by
  [[metabase.driver.sql.parameters.substitute-test]]."
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.driver :as driver]
   [metabase.driver.common.parameters :as params]
   [metabase.driver.sql.parameters.substitution
    :as sql.params.substitution]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.test-metadata :as meta]
   [metabase.query-processor.store :as qp.store]
   [metabase.test :as mt]
   [metabase.util.honey-sql-2 :as h2x]))

(set! *warn-on-reflection* true)

(deftest ^:parallel field->clause-test
  (is (=? [:field
           (meta/id :venues :id)
           {:base-type                                                           :type/BigInteger
            :temporal-unit                                                       nil
            :metabase.query-processor.util.add-alias-info/source-table           (meta/id :venues)
            :metabase.driver.sql.parameters.substitution/compiling-field-filter? true}]
          (#'sql.params.substitution/field->clause
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
