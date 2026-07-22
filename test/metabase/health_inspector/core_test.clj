(ns metabase.health-inspector.core-test
  (:require
   [clojure.test :refer :all]
   [metabase.health-inspector.core :as hi]
   [metabase.util.json :as json]
   [toucan2.core :as t2]))

(defn- test-check []
  {:health 100
   :message "test check"})

(hi/register-check! :test-check test-check)

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
