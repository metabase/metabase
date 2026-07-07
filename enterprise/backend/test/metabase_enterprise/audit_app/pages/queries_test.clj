(ns metabase-enterprise.audit-app.pages.queries-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.audit-app.pages.queries :as queries]
   [metabase.query-processor.test :as qp]
   [metabase.query-processor.util :as qp.util]
   [metabase.test :as mt]
   [metabase.util :as u]))

(def ^:private query-execution-defaults
  {:hash         (qp.util/query-hash {})
   :result_rows  0
   :running_time 0
   :native       false
   :started_at   #t "2026-01-01T10:00:00Z"
   :context      :ad-hoc})

(defn- run-query
  [query-type & {:as additional-query-params}]
  (mt/with-test-user :crowberto
    (mt/with-premium-features #{:audit-app}
      (qp/process-query (merge {:type :internal
                                :fn   (u/qualified-name query-type)}
                               additional-query-params)))))

(deftest bad-table-count-test
  (testing "bad-table-count returns the number of failing questions matching the filters"
    ;; audit internal queries read the app DB outside the with-temp transaction,
    ;; so the fixtures must be committed for real
    (mt/test-helpers-set-global-values!
      (mt/with-temp [:model/Card {bad-card-id :id} {:name "Erroring card"}
                     :model/Card {ok-card-id :id}  {:name "Healthy card"}
                     :model/QueryExecution _ (merge query-execution-defaults
                                                    {:card_id     bad-card-id
                                                     :executor_id (mt/user->id :crowberto)
                                                     :error       "unique-broken-table-xyz not found"})
                     ;; different started_at from the erroring card's execution: the legacy
                     ;; latest_qe CTE joins on started_at alone, so equal timestamps across
                     ;; cards would duplicate rows
                     :model/QueryExecution _ (merge query-execution-defaults
                                                    {:card_id     ok-card-id
                                                     :executor_id (mt/user->id :crowberto)
                                                     :started_at  #t "2026-01-01T11:00:00Z"})]
        (testing "an error filter matching only the erroring card"
          (is (= [[1]]
                 (mt/rows (run-query ::queries/bad-table-count
                                     :args ["unique-broken-table-xyz" nil nil])))))
        (testing "an error filter matching nothing"
          (is (= [[0]]
                 (mt/rows (run-query ::queries/bad-table-count
                                     :args ["no-such-error-substring-abc" nil nil])))))
        (testing "the count matches the number of bad-table rows"
          (is (= (count (mt/rows (run-query ::queries/bad-table
                                            :args ["unique-broken-table-xyz" nil nil nil nil])))
                 (-> (run-query ::queries/bad-table-count
                                :args ["unique-broken-table-xyz" nil nil])
                     mt/rows
                     ffirst))))))))
