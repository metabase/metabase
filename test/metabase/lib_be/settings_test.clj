(ns metabase.lib-be.settings-test
  (:require
   [clojure.test :refer :all]
   [metabase.lib-be.settings :as lib-be.settings]
   [metabase.settings.core :as setting]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]))

(use-fixtures :once (fixtures/initialize :db))

(deftest start-of-week-test
  (mt/discard-setting-changes [start-of-week]
    (testing "Error on invalid value"
      (is (thrown-with-msg?
           Throwable
           #"Invalid day of week: :fraturday"
           (lib-be.settings/start-of-week! :fraturday))))
    (mt/with-temp-env-var-value! [start-of-week nil]
      (testing "Should default to Sunday"
        (is (= :sunday
               (lib-be.settings/start-of-week))))
      (testing "Sanity check: make sure we're setting the env var value correctly for the assertion after this"
        (mt/with-temp-env-var-value! [:mb-start-of-week "monday"]
          (is (= :monday
                 (lib-be.settings/start-of-week)))))
      (testing "Fall back to default if value is invalid"
        (mt/with-temp-env-var-value! [:mb-start-of-week "fraturday"]
          (is (= :sunday
                 (lib-be.settings/start-of-week))))))))

(deftest enable-nested-queries-test
  (testing "only an explicit false disables nested queries"
    (mt/with-temp-env-var-value! [mb-enable-nested-queries nil]
      (is (true? (lib-be.settings/enable-nested-queries))))
    (mt/with-temp-env-var-value! [mb-enable-nested-queries "FALSE"]
      (is (false? (lib-be.settings/enable-nested-queries))))
    (testing "a value that is neither true nor false is an error, like any other boolean setting's"
      (mt/with-temp-env-var-value! [mb-enable-nested-queries "nope"]
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Error parsing Setting :enable-nested-queries"
                              (lib-be.settings/enable-nested-queries))))))
  (testing "it is sysadmin-only: nothing in the app can turn it off"
    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"can only be set by the MB_ENABLE_NESTED_QUERIES environment variable"
                          (setting/set! :enable-nested-queries false))))
  (testing "the metabase.env layer counts the same as the real environment"
    (mt/with-env-file-values! {:mb-enable-nested-queries "false"}
      (is (false? (lib-be.settings/enable-nested-queries)))
      (is (= :env (setting/get-raw-value-source :enable-nested-queries))))))
