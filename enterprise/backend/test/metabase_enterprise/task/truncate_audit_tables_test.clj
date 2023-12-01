(ns metabase-enterprise.task.truncate-audit-tables-test
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.public-settings.premium-features :as premium-features]
   [metabase.public-settings.premium-features-test
    :as premium-features-test]
   [metabase.query-processor.util :as qp.util]
   [metabase.task.truncate-audit-tables :as task.truncate-audit-tables]
   [metabase.test :as mt]
   [toucan2.core :as t2]
   [toucan2.tools.with-temp :as t2.with-temp]))

(defn- query-execution-defaults
  []
  {:hash         (qp.util/query-hash {})
   :running_time 1
   :result_rows  1
   :native       false
   :executor_id  nil
   :card_id      nil
   :context      :ad-hoc})

;; More tests for different values of `mb-audit-max-retention-days` are located in
;; `metabase.task.truncate-audit-tables-test`
(deftest query-execution-cleanup-test
  (testing "When the task runs, rows in `query_execution` older than the configured threshold are deleted"
    (premium-features-test/with-premium-features #{:audit-app}
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
                     (t2/select-fn-set :id :model/QueryExecution {:where [:in :id [qe1-id qe2-id qe3-id]]}))))))))))

(defn- audit-log-defaults
  []
  {:user_id (mt/user->id :rasta)
   :topic   :card-create})

(deftest audit-log-cleanup-test
  (testing "When the task runs, rows in `audit_log` older than the configured threshold are deleted"
    (premium-features-test/with-premium-features #{:audit-app}
      (t2.with-temp/with-temp
        [:model/AuditLog {al1-id :id} (audit-log-defaults)
         :model/AuditLog {al2-id :id} (merge (audit-log-defaults)
                                             {:timestamp (t/minus (t/offset-date-time) (t/days 31))})
         :model/AuditLog {al3-id :id} (merge (audit-log-defaults)
                                             {:timestamp (t/minus (t/offset-date-time) (t/years 1))})]
        ;; Mock a cloud environment so that we can change the setting value via env var
        (with-redefs [premium-features/is-hosted? (constantly true)]
          (testing "When the threshold is 30 days, two rows are deleted"
            (mt/with-temp-env-var-value [mb-audit-max-retention-days 30]
              (#'task.truncate-audit-tables/truncate-audit-tables!)
              (is (= #{al1-id}
                     (t2/select-fn-set :id :model/AuditLog {:where [:in :id [al1-id al2-id al3-id]]}))))))))))

(defn- view-log-defaults
  []
  {:user_id  (mt/user->id :rasta)
   :model    "card"
   :model_id 1})

(deftest view-log-cleanup-test
  (testing "When the task runs, rows in `view_log` older than the configured threshold are deleted"
    (premium-features-test/with-premium-features #{:audit-app}
      (t2.with-temp/with-temp
        [:model/ViewLog {vl1-id :id} (view-log-defaults)
         :model/ViewLog {vl2-id :id} (merge (view-log-defaults)
                                            {:timestamp (t/minus (t/offset-date-time) (t/days 31))})
         :model/ViewLog {vl3-id :id} (merge (view-log-defaults)
                                            {:timestamp (t/minus (t/offset-date-time) (t/years 1))})]
        ;; Mock a cloud environment so that we can change the setting value via env var
        (with-redefs [premium-features/is-hosted? (constantly true)]
          (testing "When the threshold is 30 days, two rows are deleted"
            (mt/with-temp-env-var-value [mb-audit-max-retention-days 30]
              (#'task.truncate-audit-tables/truncate-audit-tables!)
              (is (= #{vl1-id}
                     (t2/select-fn-set :id :model/ViewLog {:where [:in :id [vl1-id vl2-id vl3-id]]}))))))))))
