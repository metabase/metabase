(ns metabase.explorations.impl-test
  (:require
   [clojure.test :refer :all]
   [metabase.explorations.impl :as explorations.impl]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db :test-users))

(defn- count-metric-query
  "Legacy MBQL for a `count` aggregation over the given table — a minimal valid metric query."
  [table-kw]
  (let [mp (mt/metadata-provider)]
    (lib/->legacy-MBQL (-> (lib/query mp (lib.metadata/table mp (mt/id table-kw)))
                           (lib/aggregate (lib/count))))))

(defn- do-with-sample-metrics-archived [thunk]
  (let [sample-db-id (t2/select-one-pk :model/Database :is_sample true)
        metric-ids   (when sample-db-id
                       (t2/select-pks-vec :model/Card :type :metric :archived false
                                          :database_id sample-db-id))]
    (if (seq metric-ids)
      (try
        (t2/query {:update :report_card :set {:archived true} :where [:in :id metric-ids]})
        (thunk)
        (finally
          (t2/query {:update :report_card :set {:archived false} :where [:in :id metric-ids]})))
      (thunk))))

(defn- insert-n-metrics!
  "Insert `n` metric Cards and return the set of their ids."
  [n]
  (let [q (count-metric-query :orders)]
    (set (for [_ (range n)]
           (t2/insert-returning-pk! :model/Card
                                    {:name                   (mt/random-name)
                                     :type                   :metric
                                     :creator_id             (mt/user->id :crowberto)
                                     :database_id            (mt/id)
                                     :table_id               (mt/id :orders)
                                     :display                :scalar
                                     :visualization_settings {}
                                     :dataset_query          q})))))

(deftest target-resolvable?-test
  (testing "target-resolvable? reuses a prebuilt query and breakoutable columns"
    (let [mp           (mt/metadata-provider)
          query        (lib/query mp (lib.metadata/table mp (mt/id :orders)))
          breakoutable (lib/breakoutable-columns query)
          total-ref    [:field {} (mt/id :orders :total)]]
      (testing "a real field ref on the table resolves"
        (is (true? (explorations.impl/target-resolvable? query breakoutable total-ref))))
      (testing "a bogus field ref does not resolve (and does not throw)"
        (is (false? (explorations.impl/target-resolvable?
                     query breakoutable [:field {} Integer/MAX_VALUE]))))
      (testing "a malformed ref is handled defensively"
        (is (false? (explorations.impl/target-resolvable?
                     query breakoutable [:not-a-ref {}])))))))

(deftest breakoutable-resolver-memoizes-by-table-test
  (let [mp            (mt/metadata-provider)
        q             (-> (lib/query mp (lib.metadata/table mp (mt/id :orders)))
                          (lib/aggregate (lib/count)))
        m             {:database_id (mt/id) :table_id (mt/id :orders) :dataset_query :stored}
        simple?       @#'explorations.impl/simple-table-query?
        make-resolver @#'explorations.impl/make-breakoutable-resolver]
    (testing "simple-table-query? detects a single-table, join-free, expression-free query"
      (is (true?  (simple? m q)))
      (is (false? (simple? (dissoc m :table_id) q)) "no :table_id (e.g. card source) -> not simple")
      (is (false? (simple? m nil)) "unbuildable query -> not simple"))
    (testing "resolver computes breakoutable-columns once per (db,table) and reuses it"
      (let [calls    (atom 0)
            resolve* (make-resolver)]
        (with-redefs [lib/breakoutable-columns (fn [_] (swap! calls inc) [])]
          (resolve* m q)                                  ; orders: miss
          (resolve* m q)                                  ; orders: hit
          (resolve* (assoc m :table_id (mt/id :products)) q)) ; products: miss
        (is (= 2 @calls))))))

(deftest query-count-does-not-scale-with-metric-count-test
  (testing "exploration-data issues a ~constant number of DB queries regardless of metric count"
    ;; Before batching, each extra metric added ~2 permission queries (an N+1). After batching,
    ;; adding metrics must not add per-metric queries.
    (mt/with-test-user :rasta
      (let [run-with (fn [n]
                       (do-with-sample-metrics-archived
                        (fn []
                          (mt/with-model-cleanup [:model/Card]
                            (let [ids (insert-n-metrics! n)]
                              (t2/with-call-count [qc]
                                (let [res  (explorations.impl/exploration-data {})
                                      ;; Scope to the metrics we inserted — other tests' temp
                                      ;; :metric Cards can be live in the catalog concurrently.
                                      mine (filter #(ids (:id %)) (:metrics res))]
                                  (assert (= n (count mine))
                                          (str "expected " n " of our metrics, got " (count mine)))
                                  (qc))))))))
            few  (run-with 2)
            many (run-with 12)]
        (testing (str "queries for 2 metrics = " few ", for 12 metrics = " many)
          ;; 10 extra metrics would have meant ~20 extra queries pre-fix; allow generous slack
          ;; for incidental per-row variation while still proving it is not per-metric.
          (is (< (- many few) 6)))))))
