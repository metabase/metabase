(ns metabase.task.truncate-audit-tables-test
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.models.setting :as setting]
   [metabase.public-settings.premium-features :as premium-features]
   [metabase.public-settings.premium-features-test
    :as premium-features-test]
   [metabase.query-processor.util :as qp.util]
   [metabase.task.truncate-audit-tables :as task.truncate-audit-tables]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]
   [toucan2.tools.with-temp :as t2.with-temp]))

(use-fixtures :once (fixtures/initialize :db))

(deftest audit-max-retention-days-test
  (mt/with-temp-env-var-value [mb-audit-max-retention-days nil]
    (is (= 720 (task.truncate-audit-tables/audit-max-retention-days))))

  (mt/with-temp-env-var-value [mb-audit-max-retention-days 0]
    (is (= ##Inf (task.truncate-audit-tables/audit-max-retention-days))))

  (mt/with-temp-env-var-value [mb-audit-max-retention-days 100]
    (is (= 100 (task.truncate-audit-tables/audit-max-retention-days))))

  ;; Acceptable values have a lower bound of 30
  (mt/with-temp-env-var-value [mb-audit-max-retention-days 1]
    (is (= 30 (task.truncate-audit-tables/audit-max-retention-days))))

  (is (thrown-with-msg?
       java.lang.UnsupportedOperationException
       #"You cannot set audit-max-retention-days"
       (setting/set! :audit-max-retention-days 30))))

(defn- query-execution-defaults
  []
  {:hash         (qp.util/query-hash {})
   :running_time 1
   :result_rows  1
   :native       false
   :executor_id  nil
   :card_id      nil
   :context      :ad-hoc})

(deftest truncate-table-test
  (testing "truncate-table accurately truncates a table according to the value of the audit-max-retention-days env var"
    (premium-features-test/with-premium-features #{}
      (t2.with-temp/with-temp
        [:model/QueryExecution {qe1-id :id} (merge (query-execution-defaults)
                                                   {:started_at (t/offset-date-time)})
         ;; 31 days ago
         :model/QueryExecution {qe2-id :id} (merge (query-execution-defaults)
                                                   {:started_at (t/minus (t/offset-date-time) (t/days 31))})
         ;; 1 year ago
         :model/QueryExecution {qe3-id :id} (merge (query-execution-defaults)
                                                   {:started_at (t/minus (t/offset-date-time) (t/years 1))})]
        ;; Mock a cloud environment so that we can change the setting value via env var
        (with-redefs [premium-features/is-hosted? (constantly true)]
          (testing "When the threshold is 0 (representing infinity), no rows are deleted"
            (mt/with-temp-env-var-value [mb-audit-max-retention-days 0]
              (#'task.truncate-audit-tables/truncate-audit-tables!)
              (is (= #{qe1-id qe2-id qe3-id}
                     (t2/select-fn-set :id :model/QueryExecution {:where [:in :id [qe1-id qe2-id qe3-id]]}))))

            (testing "When the threshold is 100 days, one row is deleted"
              (mt/with-temp-env-var-value [mb-audit-max-retention-days 100]
                (#'task.truncate-audit-tables/truncate-audit-tables!)
                (is (= #{qe1-id qe2-id}
                       (t2/select-fn-set :id :model/QueryExecution {:where [:in :id [qe1-id qe2-id qe3-id]]})))))

            (testing "When the threshold is 30 days, two rows are deleted"
              (mt/with-temp-env-var-value [mb-audit-max-retention-days 30]
                (#'task.truncate-audit-tables/truncate-audit-tables!)
                (is (= #{qe1-id}
                       (t2/select-fn-set :id :model/QueryExecution {:where [:in :id [qe1-id qe2-id qe3-id]]})))))

            (testing "When the threshold set to 1 day, the remaining row is not deleted because the minimum threshold is 30"
              (mt/with-temp-env-var-value [mb-audit-max-retention-days 1]
                (#'task.truncate-audit-tables/truncate-audit-tables!)
                (is (= #{qe1-id}
                       (t2/select-fn-set :id :model/QueryExecution {:where [:in :id [qe1-id qe2-id qe3-id]]})))))))))))
