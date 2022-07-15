(ns metabase.driver.sql-jdbc.actions-test
  (:require
   [clojure.test :refer :all]
   [metabase.actions.test-util :as actions.test-util]
   [metabase.driver :as driver]
   [metabase.driver.sql-jdbc.actions :as sql-jdbc.actions]
   [metabase.test :as mt]
   [schema.core :as s]))

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
      (actions.test-util/with-actions-test-data-tables #{"venues" "categories"}
        (actions.test-util/with-actions-test-data-and-actions-enabled
          (reset! parse-sql-error-called? false)
          ;; attempting to delete the `Pizza` category should fail because there are several rows in `venues` that have
          ;; this `category_id` -- it's an FK constraint violation.
          (is (schema= {:message #"Referential integrity constraint violation:.*"
                        s/Keyword s/Any}
                       (mt/user-http-request :crowberto :post 400
                                             "action/row/delete"
                                             (mt/mbql-query categories {:filter [:= $id 58]}))))
          (testing "Make sure our impl was actually called."
            (is @parse-sql-error-called?)))))))
