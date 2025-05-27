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

  (is (thrown-with-msg?
       java.lang.UnsupportedOperationException
       #"You cannot set audit-max-retention-days"
       (setting/set! :audit-max-retention-days 30))))
