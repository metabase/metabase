(ns metabase.health-inspector.core-test
  (:require
   [clojure.test :refer :all]
   [metabase.health-inspector.core :as hi]
   [metabase.test :as mt]
   [metabase.util.json :as json]
   [toucan2.core :as t2]))

(defn- test-check []
  {:health 100
   :message "test check"})

(hi/register-check! :test-check test-check)

(def ^:private probe-result (atom {:health 0 :message "down"}))

(hi/register-check! :test-nil    (constantly nil))
(hi/register-check! :test-probe  (fn [] @probe-result))
(hi/register-check! :test-throws (fn [] (throw (ex-info "kaboom" {}))))

(deftest report-test
  (let [report (hi/report)]
    (testing "test check works"
      (is (= {:health 100 :message "test check"}
             (:test-check report))))
    (testing "validate-queries works"
      (is (= 100 (-> report :validate-queries :health))))))

(deftest validate-queries*-works
  (let [bad-query {"database" 1
                   "query" {"expressions" "extremely invalid"
                            "source-table" 2}
                   "type" "query"}
        bad-card (assoc (dissoc (t2/select-one :report_card) :id :entity_id)
                        :dataset_query (json/encode bad-query)
                        :description "bad query")
        bad (t2/insert! :report_card bad-card)]
    (try
      (let [{:keys [health message]} (hi/validate-queries)]
        (is (< 0 health 100))
        (is (= "Some queries are invalid." message)))
      (finally (t2/delete! :report_card bad)))))

(deftest report-db-test
  (t2/delete! :health_inspector_runs)
  (hi/save-report)
  (hi/save-report)
  (let [runs (group-by :check_name (hi/list-runs 32))]
    (is (= [100 100] (map :health (runs "test-check"))))
    (is (= ["test check" "test check"] (map :message (runs "test-check"))))
    (is (= [100 100] (map :health (runs "validate-queries"))))))

(deftest nil-check-is-omitted-test
  (testing "a check returning nil (not applicable on this instance) is omitted, not persisted as a green score"
    (is (nil? (:test-nil (hi/report))))
    (t2/delete! :health_inspector_runs)
    (hi/save-report)
    (is (not (contains? (set (map :check_name (hi/list-runs 512))) "test-nil")))))

(deftest report-isolates-throwing-check-test
  (testing "a throwing check reads as degraded and doesn't abort the rest of the report"
    (let [report (hi/report)]
      (is (=? {:health 0 :message #".*kaboom.*"} (:test-throws report)))
      (is (= 100 (-> report :test-check :health)) "other checks still run"))))

(deftest run-and-save-check!-test
  (testing "no-op when the health inspector is disabled"
    (mt/with-temporary-setting-values [health-inspector-enabled false]
      (t2/delete! :health_inspector_runs)
      (hi/run-and-save-check! :test-probe)
      (is (empty? (hi/list-runs 512)))))
  (mt/with-temporary-setting-values [health-inspector-enabled true]
    (testing "no-op for an unregistered check"
      (t2/delete! :health_inspector_runs)
      (hi/run-and-save-check! :no-such-check)
      (is (empty? (hi/list-runs 512))))
    (testing "persists once, then dedups an unchanged result"
      (reset! probe-result {:health 0 :message "down"})
      (t2/delete! :health_inspector_runs)
      (hi/run-and-save-check! :test-probe)
      (hi/run-and-save-check! :test-probe)
      (is (= 1 (count (hi/list-runs 512))) "the unchanged repeat is deduped"))
    (testing "a changed result is persisted"
      (reset! probe-result {:health 100 :message "up"})
      (hi/run-and-save-check! :test-probe)
      (is (= 2 (count (hi/list-runs 512))) "a changed result is persisted"))))
