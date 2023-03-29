(ns metabase.driver.sql-jdbc.actions-test
  "Most of the tests for code in [[metabase.driver.sql-jdbc.actions]] are e2e tests that live
  in [[metabase.api.action-test]]."
  (:require
   [clojure.test :refer :all]
   [metabase.actions :as actions]
   [metabase.api.common :refer [*current-user-permissions-set*]]
   [metabase.driver :as driver]
   [metabase.driver.sql-jdbc.actions :as sql-jdbc.actions]
   [metabase.models :refer [Field]]
   [metabase.test :as mt]
   [metabase.util.honeysql-extensions :as hx]))

(deftest cast-values-test
  (binding [hx/*honey-sql-version* 2]
    (testing "Should work with underscored Field names (#24166)"
      (is (= {:CATEGORY_ID (hx/cast "INTEGER" 50)}
             (#'sql-jdbc.actions/cast-values :h2 {:CATEGORY_ID 50} (mt/id :venues))))
      (testing "Should parse string values as integers"
        (is (= {:CATEGORY_ID (hx/cast "INTEGER" "50")}
               (#'sql-jdbc.actions/cast-values :h2 {:CATEGORY_ID "50"} (mt/id :venues))))))
    (testing "Should cache column types for repeated calls"
      (binding [actions/*misc-value-cache* (atom {})]
        (is (= {:CATEGORY_ID (hx/cast "INTEGER" 50)}
               (#'sql-jdbc.actions/cast-values :h2 {:CATEGORY_ID 50} (mt/id :venues))))
        (mt/with-temp-vals-in-db Field (mt/id :venues :category_id) {:base_type :type/Float}
          (is (= {:CATEGORY_ID (hx/cast "INTEGER" 40)}
                 (#'sql-jdbc.actions/cast-values :h2 {:CATEGORY_ID 40} (mt/id :venues)))))))))

;; this driver throws an Exception when you call `parse-sql-error`.
(driver/register! ::parse-sql-error-exception, :parent :h2)

(def ^:private parse-sql-error-called? (atom false))

(defmethod sql-jdbc.actions/parse-sql-error ::parse-sql-error-exception
  [_driver _database message]
  (reset! parse-sql-error-called? true)
  (throw (ex-info "OOPS I THREW AN EXCEPTION!" {:message message})))

(deftest parse-sql-error-catch-exceptions-test
  (testing "If parse-sql-error throws an Exception, log it and return the unparsed exception instead of failing entirely (#24021)"
    (driver/with-driver ::parse-sql-error-exception
      (mt/with-actions-test-data-tables #{"venues" "categories"}
        (mt/with-actions-test-data-and-actions-enabled
          (reset! parse-sql-error-called? false)
          ;; attempting to delete the `Pizza` category should fail because there are several rows in `venues` that have
          ;; this `category_id` -- it's an FK constraint violation.
          (binding [*current-user-permissions-set* (delay #{"/"})]
            (is (thrown-with-msg? Exception #"Referential integrity constraint violation:.*"
                                            (actions/perform-action! :row/delete (mt/mbql-query categories {:filter [:= $id 58]})))))
          (testing "Make sure our impl was actually called."
            (is @parse-sql-error-called?)))))))
