(ns metabase.audit-app.settings-test
  (:require
   [clojure.test :refer :all]
   [metabase.audit-app.settings :as audit.settings]
   [metabase.settings.core :as setting]
   [metabase.test :as mt]))

(deftest audit-max-retention-days-test
  (mt/with-temp-env-var-value! [mb-audit-max-retention-days nil]
    (is (= 720 (audit.settings/audit-max-retention-days))))
  (mt/with-temp-env-var-value! [mb-audit-max-retention-days 0]
    (is (= ##Inf (audit.settings/audit-max-retention-days))))
  (mt/with-temp-env-var-value! [mb-audit-max-retention-days 100]
    (is (= 100 (audit.settings/audit-max-retention-days))))
  ;; Acceptable values have a lower bound of 30
  (mt/with-temp-env-var-value! [mb-audit-max-retention-days 1]
    (is (= 30 (audit.settings/audit-max-retention-days))))
  (testing "sysadmin-only: cannot be set through the setter, even bypassing read-only"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"Setting audit-max-retention-days can only be set by the MB_AUDIT_MAX_RETENTION_DAYS environment variable"
         (setting/set! :audit-max-retention-days 30 :bypass-read-only? true)))))
