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

(defn- bad-table-total
  "The `COUNT(*) OVER ()` total, surfaced as a top-level `:total_count` on the
  bad-table response (0 when the filtered set is empty)."
  [& args]
  (:total_count (run-query ::queries/bad-table :args (vec args))))

(deftest bad-table-total-count-test
  (testing "bad-table carries a total_count matching the filtered set"
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
                     ;; latest_qe CTE joined on started_at alone, so equal timestamps across
                     ;; cards would duplicate rows
                     :model/QueryExecution _ (merge query-execution-defaults
                                                    {:card_id     ok-card-id
                                                     :executor_id (mt/user->id :crowberto)
                                                     :started_at  #t "2026-01-01T11:00:00Z"})]
        (testing "an error filter matching only the erroring card"
          (is (= 1 (bad-table-total "unique-broken-table-xyz" nil nil nil nil))))
        (testing "an error filter matching nothing -> no rows -> total 0"
          (is (= 0 (bad-table-total "no-such-error-substring-abc" nil nil nil nil))))
        (testing "the total matches the number of returned rows"
          (is (= (count (mt/rows (run-query ::queries/bad-table
                                            :args ["unique-broken-table-xyz" nil nil nil nil])))
                 (bad-table-total "unique-broken-table-xyz" nil nil nil nil))))))))

(deftest bad-table-total-count-filter-clauses-test
  (testing "the bad-table total_count honors the db-name and collection-name filters, not just the error filter"
    (mt/test-helpers-set-global-values!
      (mt/with-temp [:model/Database   {db-a :id} {:name "erroring-db-alpha"}
                     :model/Database   {db-b :id} {:name "erroring-db-beta"}
                     :model/Collection {coll-a :id} {:name "Erroring Collection Alpha"}
                     ;; two erroring cards sharing a unique error marker (so they can be
                     ;; isolated from any other erroring cards in the app DB) but living in
                     ;; different databases/collections
                     :model/Card {card-a :id} {:name          "Filter card A"
                                               :database_id   db-a
                                               :collection_id coll-a}
                     ;; null collection -> "Our Analytics" fallback, different database
                     :model/Card {card-b :id} {:name        "Filter card B"
                                               :database_id db-b}
                     :model/QueryExecution _ (merge query-execution-defaults
                                                    {:card_id     card-a
                                                     :executor_id (mt/user->id :crowberto)
                                                     :error       "shared-filter-marker-qq"})
                     :model/QueryExecution _ (merge query-execution-defaults
                                                    {:card_id     card-b
                                                     :executor_id (mt/user->id :crowberto)
                                                     :started_at  #t "2026-03-03T13:00:00Z"
                                                     :error       "shared-filter-marker-qq"})]
        (testing "no db/collection filter matches both erroring cards"
          (is (= 2 (bad-table-total "shared-filter-marker-qq" nil nil nil nil))))
        (testing "the db-name filter narrows the count to the matching database"
          (is (= 1 (bad-table-total "shared-filter-marker-qq" "erroring-db-alpha" nil nil nil))))
        (testing "the collection-name filter narrows the count to the matching collection"
          (is (= 1 (bad-table-total "shared-filter-marker-qq" nil "Erroring Collection Alpha" nil nil))))
        (testing "the null-collection card is reachable via the Our Analytics fallback name"
          (is (= 1 (bad-table-total "shared-filter-marker-qq" nil "Our Analytics" nil nil))))))))

(deftest bad-table-no-duplicate-cards-test
  (testing "cards aren't duplicated when executions across cards share a started_at (latest_qe joins on card_id, not timestamp alone)"
    (mt/test-helpers-set-global-values!
      (let [shared-ts #t "2026-02-02T12:00:00Z"]
        (mt/with-temp [:model/Card {erroring-id :id} {:name "Collision erroring card"}
                       :model/Card {healthy-id :id}  {:name "Collision healthy card"}
                       ;; both cards' latest run is at the SAME timestamp; only one errored
                       :model/QueryExecution _ (merge query-execution-defaults
                                                      {:card_id     erroring-id
                                                       :executor_id (mt/user->id :crowberto)
                                                       :started_at  shared-ts
                                                       :error       "collision-error-marker-abc"})
                       :model/QueryExecution _ (merge query-execution-defaults
                                                      {:card_id     healthy-id
                                                       :executor_id (mt/user->id :crowberto)
                                                       :started_at  shared-ts})]
          (let [rows (mt/rows (run-query ::queries/bad-table
                                         :args ["collision-error-marker-abc" nil nil nil nil]))]
            (testing "exactly one row, for the erroring card only (buggy join returns two)"
              (is (= 1 (count rows)))
              (is (= [erroring-id] (map first rows))))
            (testing "and the total_count agrees"
              (is (= 1 (bad-table-total "collision-error-marker-abc" nil nil nil nil))))))))))
