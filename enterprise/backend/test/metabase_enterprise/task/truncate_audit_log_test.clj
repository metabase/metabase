(ns metabase-enterprise.task.truncate-audit-log-test
  (:require
   [clojure.test :refer :all]
   [metabase.models.setting :as setting]
   [metabase.public-settings.premium-features :as premium-features]
   [metabase.task.truncate-audit-log.interface :as truncate-audit-log.i]
   [metabase.test :as mt]))

(deftest audit-max-retention-days-test
  ;; Tests for the OSS & Cloud implementations are in `metabase.task.truncate-audit-log-test`
  (with-redefs [premium-features/enable-advanced-config? (constantly true)]
    (is (= ##Inf (truncate-audit-log.i/audit-max-retention-days)))

    (mt/with-temp-env-var-value [mb-audit-max-retention-days 0]
      (is (= ##Inf (truncate-audit-log.i/audit-max-retention-days))))

    (mt/with-temp-env-var-value [mb-audit-max-retention-days 100]
      (is (= 100 (truncate-audit-log.i/audit-max-retention-days))))

    ;; Acceptable values have a lower bound of 30
    (mt/with-temp-env-var-value [mb-audit-max-retention-days 1]
      (is (= 30 (truncate-audit-log.i/audit-max-retention-days))))

    (is (thrown-with-msg?
         java.lang.UnsupportedOperationException
         #"You cannot set audit-max-retention-days"
         (setting/set! :audit-max-retention-days 30)))))
