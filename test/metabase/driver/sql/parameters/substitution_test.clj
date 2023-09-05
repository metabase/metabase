(ns metabase.driver.sql.parameters.substitution-test
  "Most of the code in `metabase.driver.sql.parameters.substitution` is actually tested by
  [[metabase.driver.sql.parameters.substitute-test]]."
  (:require
   [clojure.test :refer :all]
   [metabase.driver.common.parameters :as params]
   [metabase.driver.sql.parameters.substitution
    :as sql.params.substitution]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.test-metadata :as meta]
   [metabase.query-processor.store :as qp.store]
   [metabase.test :as mt]))

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
           :number/=))))

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
                       :value ["Doohickey"]}})))))
  (testing "Compound filters should be wrapped in parens"
    (mt/dataset sample-dataset
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
