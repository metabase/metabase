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
    (mt/test-helpers-set-global-values!
      (mt/with-temp [:model/Card {bad-card-id :id} {:name "Toucan card"}
                     :model/Card {ok-card-id :id}  {:name "Sparrow card"}
                     :model/QueryExecution _ (merge query-execution-defaults
                                                    {:card_id     bad-card-id
                                                     :executor_id (mt/user->id :crowberto)
                                                     :error       "unique-broken-table-xyz not found"})
                     :model/QueryExecution _ (merge query-execution-defaults
                                                    {:card_id     ok-card-id
                                                     :executor_id (mt/user->id :crowberto)
                                                     :started_at  #t "2026-01-01T11:00:00Z"})]
        (testing "an error filter matching only the erroring card"
          (is (= 1 (bad-table-total "unique-broken-table-xyz" nil nil))))
        (testing "an error filter matching nothing -> no rows -> total 0"
          (is (= 0 (bad-table-total "no-such-error-substring-abc" nil nil))))
        (testing "the total matches the number of returned rows"
          (is (= (count (mt/rows (run-query ::queries/bad-table
                                            :args ["unique-broken-table-xyz" nil nil])))
                 (bad-table-total "unique-broken-table-xyz" nil nil))))))))

(deftest bad-table-search-term-matches-any-field-test
  (testing "the single search term matches against question name, error text, db name, or collection name (OR, not AND)"
    (mt/test-helpers-set-global-values!
      (mt/with-temp [:model/Database   {db-a :id} {:name "kingfisher-db-alpha"}
                     :model/Database   {db-b :id} {:name "kingfisher-db-beta"}
                     :model/Collection {coll-a :id} {:name "Heron Collection Alpha"}
                     ;; two erroring cards sharing a unique error marker (so they can be
                     ;; isolated from any other erroring cards in the app DB) but living in
                     ;; different databases/collections
                     :model/Card {card-a :id} {:name          "Sparrow Card Name Alpha"
                                               :database_id   db-a
                                               :collection_id coll-a}
                     ;; null collection -> "Our Analytics" fallback, different database
                     :model/Card {card-b :id} {:name        "Wren card B"
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
        (testing "a term matching the shared error text matches both cards"
          (is (= 2 (bad-table-total "shared-filter-marker-qq" nil nil))))
        (testing "a term matching only a question name reaches that field, not just error text"
          (is (= 1 (bad-table-total "Sparrow Card Name Alpha" nil nil))))
        (testing "a term matching only a db name reaches that field, not just error text"
          (is (= 1 (bad-table-total "kingfisher-db-alpha" nil nil))))
        (testing "a term matching only a collection name reaches that field too"
          (is (= 1 (bad-table-total "Heron Collection Alpha" nil nil))))
        (testing "the null-collection card is reachable via the Our Analytics fallback name"
          ;; "Our Analytics" is a common fallback shared by every uncollected card in the
          ;; app db, so unlike the other terms above this can't be isolated to an exact
          ;; total; assert card-b is included in the results instead.
          (let [rows (mt/rows (run-query ::queries/bad-table
                                         :args ["Our Analytics" nil nil]))]
            (is (contains? (set (map first rows)) card-b))))
        (testing "a term shared by both db names matches both cards via the db-name field"
          (is (= 2 (bad-table-total "kingfisher-db" nil nil))))))))

(deftest bad-table-no-duplicate-cards-test
  (testing "cards aren't duplicated when executions across cards share a started_at (latest_qe joins on card_id, not timestamp alone)"
    (mt/test-helpers-set-global-values!
      (let [shared-ts #t "2026-02-02T12:00:00Z"]
        (mt/with-temp [:model/Card {erroring-id :id} {:name "Magpie collision card"}
                       :model/Card {healthy-id :id}  {:name "Finch collision card"}
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
                                         :args ["collision-error-marker-abc" nil nil]))]
            (testing "exactly one row, for the erroring card only (buggy join returns two)"
              (is (= 1 (count rows)))
              (is (= [erroring-id] (map first rows))))
            (testing "and the total_count agrees"
              (is (= 1 (bad-table-total "collision-error-marker-abc" nil nil))))))))))

(deftest bad-table-dedupes-tied-executions-for-one-card-test
  (testing "a card whose latest executions tie on started_at appears once, not once per tied execution"
    (mt/test-helpers-set-global-values!
      (let [shared-ts #t "2026-04-04T09:00:00Z"]
        (mt/with-temp [:model/Card {card-id :id} {:name "Kestrel tied-run card"}
                       ;; an older run, to prove ranking picks from the latest timestamp only
                       :model/QueryExecution _ (merge query-execution-defaults
                                                      {:card_id     card-id
                                                       :executor_id (mt/user->id :crowberto)
                                                       :started_at  #t "2026-04-04T08:00:00Z"
                                                       :error       "tied-run-marker-de stale error"})
                       ;; two runs of the SAME card landing in the same clock tick
                       :model/QueryExecution _ (merge query-execution-defaults
                                                      {:card_id     card-id
                                                       :executor_id (mt/user->id :crowberto)
                                                       :started_at  shared-ts
                                                       :error       "tied-run-marker-de first error"})
                       :model/QueryExecution _ (merge query-execution-defaults
                                                      {:card_id     card-id
                                                       :executor_id (mt/user->id :crowberto)
                                                       :started_at  shared-ts
                                                       :error       "tied-run-marker-de second error"})]
          (let [rows (mt/rows (run-query ::queries/bad-table :args ["tied-run-marker-de" nil nil]))]
            (testing "one row for the card (the un-deduped join returns one per tied execution)"
              (is (= 1 (count rows)))
              (is (= [card-id] (map first rows))))
            (testing "the surviving row is the most recently inserted of the tied executions"
              (is (= "tied-run-marker-de second error..." (nth (first rows) 2))))
            (testing "and the total_count agrees"
              (is (= 1 (bad-table-total "tied-run-marker-de" nil nil))))))))))

(deftest bad-table-paging-is-stable-across-tied-sort-values-test
  (testing "cards tied on the sort column don't repeat across pages: each page yields a distinct card"
    (mt/test-helpers-set-global-values!
      (let [shared-ts #t "2026-05-05T15:00:00Z"
            page      (fn [offset]
                        (mt/rows (run-query ::queries/bad-table
                                            :args   ["paging-tie-marker-fg" "last_run_at" "desc"]
                                            :limit  1
                                            :offset offset)))]
        (mt/with-temp [:model/Card {card-a :id} {:name "Avocet paging card"}
                       :model/Card {card-b :id} {:name "Bittern paging card"}
                       :model/QueryExecution _ (merge query-execution-defaults
                                                      {:card_id     card-a
                                                       :executor_id (mt/user->id :crowberto)
                                                       :started_at  shared-ts
                                                       :error       "paging-tie-marker-fg"})
                       :model/QueryExecution _ (merge query-execution-defaults
                                                      {:card_id     card-b
                                                       :executor_id (mt/user->id :crowberto)
                                                       :started_at  shared-ts
                                                       :error       "paging-tie-marker-fg"})]
          (is (= 2 (bad-table-total "paging-tie-marker-fg" "last_run_at" "desc")))
          (is (= #{card-a card-b}
                 (set (concat (map first (page 0)) (map first (page 1)))))))))))
