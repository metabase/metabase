(ns metabase.explorations.impl-test
  (:require
   [clojure.test :refer :all]
   [metabase.explorations.impl :as explorations.impl]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util :as u]
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

;;; ----------------------------------- research-candidates / research-groups -----------------------------------

;; Synthetic hydrated metrics for the Metabot research tools. `region-1` and `region-2` share a
;; source, so they collapse into one dimension group spanning both metrics; `plan-1` is its own
;; group on metric 1 only.
(def ^:private region-source {:source 1})
(def ^:private plan-source {:source 2})

(defn- dim [id display interestingness sources]
  {:id id :name id :display-name display :effective-type "type/Text" :semantic-type nil
   :dimension-interestingness interestingness :sources sources})

(def ^:private synthetic-metrics
  [{:id 1 :name "Revenue" :description "rev" :result_column_name "count"
    :dimensions [(dim "region-1" "Region" 0.9 [region-source])
                 (dim "plan-1" "Plan" 0.5 [plan-source])]}
   {:id 2 :name "Churn" :description "churn" :result_column_name "count"
    :dimensions [(dim "region-2" "Region" 0.9 [region-source])]}])

(defmacro ^:private with-synthetic-metrics [& body]
  `(with-redefs [explorations.impl/hydrated-metrics (fn [~'_] synthetic-metrics)]
     ~@body))

(deftest research-candidates-test
  (with-synthetic-metrics
    (let [{:keys [metrics dimension_groups]} (explorations.impl/research-candidates {})]
      (testing "each metric inlines its candidate dimensions with ids + interestingness"
        (is (= [{:id 1 :name "Revenue"} {:id 2 :name "Churn"}]
               (mapv #(select-keys % [:id :name]) metrics)))
        (is (= ["region-1" "plan-1"] (mapv :id (:dimensions (first metrics)))))
        (is (= 0.9 (:dimension-interestingness (first (:dimensions (first metrics)))))))
      (testing "dimension groups carry their member dimension ids and the metrics they slice"
        (let [by-name (u/index-by :name dimension_groups)]
          (is (= #{"region-1" "region-2"} (set (:dimension_ids (get by-name "Region")))))
          (is (= #{1 2} (set (:metric_ids (get by-name "Region")))))
          (is (= #{1} (set (:metric_ids (get by-name "Plan"))))))))))

(deftest research-groups-metric-anchored-test
  (with-synthetic-metrics
    (testing "a valid metric-anchored group echoes its spec and restricts to that metric"
      (let [spec {:anchor "metric" :metric_id 1 :dimension_ids ["plan-1"]}
            {:keys [metrics groups]} (explorations.impl/research-groups {:groups [spec]})]
        (is (= [spec] groups))
        (is (= [1] (mapv :id metrics)))
        (is (= ["region-1" "plan-1"] (:dimension_ids (first metrics))))))
    (testing "dimension_ids is optional"
      (is (= [1] (mapv :id (:metrics (explorations.impl/research-groups
                                      {:groups [{:anchor "metric" :metric_id 1}]}))))))))

(deftest research-groups-dimension-anchored-test
  (with-synthetic-metrics
    (testing "a dimension-anchored group pulls every metric exposing a dimension in that group"
      (let [{:keys [metrics groups]} (explorations.impl/research-groups
                                      {:groups [{:anchor "dimension" :dimension_id "region-1"}]})]
        (is (= [{:anchor "dimension" :dimension_id "region-1"}] groups))
        ;; region-1 and region-2 share a source -> one group across metrics 1 and 2
        (is (= [1 2] (sort (mapv :id metrics))))))))

(deftest research-groups-dimension-anchored-metric-subset-test
  (with-synthetic-metrics
    (testing "metric_ids restricts a dimension-anchored group to the chosen metrics"
      (let [spec {:anchor "dimension" :dimension_id "region-1" :metric_ids [1]}
            {:keys [metrics groups]} (explorations.impl/research-groups {:groups [spec]})]
        (is (= [spec] groups))
        (is (= [1] (mapv :id metrics)))))
    (testing "omitting metric_ids still pulls every metric exposing the dimension"
      (is (= [1 2] (sort (mapv :id (:metrics (explorations.impl/research-groups
                                              {:groups [{:anchor "dimension" :dimension_id "region-1"}]})))))))))

(deftest research-groups-hard-errors-test
  (with-synthetic-metrics
    (testing "unknown metric id"
      (is (thrown-with-msg? Exception #"Unknown or inaccessible metric id 999"
                            (explorations.impl/research-groups
                             {:groups [{:anchor "metric" :metric_id 999}]}))))
    (testing "dimension that isn't a candidate of its metric"
      (is (thrown-with-msg? Exception #"not a candidate of metric"
                            (explorations.impl/research-groups
                             {:groups [{:anchor "metric" :metric_id 1 :dimension_ids ["region-2"]}]}))))
    (testing "unknown dimension id"
      (is (thrown-with-msg? Exception #"Unknown dimension id"
                            (explorations.impl/research-groups
                             {:groups [{:anchor "dimension" :dimension_id "bogus"}]}))))
    (testing "replace_default_dimensions with no dimension_ids"
      (is (thrown-with-msg? Exception #"replace_default_dimensions requires"
                            (explorations.impl/research-groups
                             {:groups [{:anchor "metric" :metric_id 1 :replace_default_dimensions true}]}))))
    (testing "metric_id not related to a dimension-anchored group's dimension"
      (is (thrown-with-msg? Exception #"not related to dimension"
                            (explorations.impl/research-groups
                             {:groups [{:anchor "dimension" :dimension_id "plan-1" :metric_ids [2]}]}))))
    (testing "unknown anchor"
      (is (thrown-with-msg? Exception #"Unknown anchor"
                            (explorations.impl/research-groups
                             {:groups [{:anchor "segment" :metric_id 1}]}))))
    (testing "metric anchor missing metric_id"
      (is (thrown-with-msg? Exception #"requires a metric_id"
                            (explorations.impl/research-groups
                             {:groups [{:anchor "metric"}]}))))
    (testing "dimension anchor missing dimension_id"
      (is (thrown-with-msg? Exception #"requires a dimension_id"
                            (explorations.impl/research-groups
                             {:groups [{:anchor "dimension"}]}))))))

;;; ------------------------------------------ exploration-data ------------------------------------------

(def ^:private threshold-source {:source 3})

(def ^:private threshold-metrics
  "One metric with a candidate dim (scores above the threshold), an unscored dim (nil — kept),
  and a sub-threshold dim (dropped by the candidate filter and the dimension groups alike)."
  [{:id 1 :name "Revenue" :description "rev" :result_column_name "count"
    :dimensions [(dim "keep-1" "Keep" 0.9 [region-source])
                 (dim "unscored-1" "Unscored" nil [plan-source])
                 (dim "weak-1" "Weak" 0.05 [threshold-source])]}])

(deftest exploration-data-no-dangling-dimension-ids-test
  (testing "metric :dimension_ids and :dimension_groups apply the same interestingness filter"
    (with-redefs [explorations.impl/hydrated-metrics (fn [_] threshold-metrics)]
      (let [{:keys [metrics dimension_groups]} (explorations.impl/exploration-data {})
            metric-dim-ids (set (:dimension_ids (first metrics)))
            group-dim-ids  (into #{} (mapcat #(map :id (:dimensions %))) dimension_groups)]
        (testing "the sub-threshold dimension is dropped from the metric's dimension_ids"
          (is (= #{"keep-1" "unscored-1"} metric-dim-ids)))
        (testing "every referenced dimension id resolves to a dimension group (no dangling ids)"
          (is (= metric-dim-ids group-dim-ids)))))))

;;; --------------------------------------- missing-dimension self-healing (UXW-4475) ---------------------------------------

(defn- metric-on-card-query
  "Metric dataset_query whose source is `card-id` (a model)."
  [card-id]
  (let [mp (mt/metadata-provider)]
    (-> (lib/query mp (lib.metadata/card mp card-id))
        (lib/aggregate (lib/count)))))

(defn- wipe-dimensions!
  "Simulate a metric row whose dimensions were never synced, bypassing Card transforms/hooks."
  [metric-id]
  (t2/update! (t2/table-name :model/Card) metric-id {:dimensions nil :dimension_mappings nil}))

(deftest exploration-data-heals-missing-dimensions-test
  (testing "a metric on an MBQL model with NULL dimensions is synced and persisted on read"
    (mt/with-test-user :crowberto
      (mt/with-temp [:model/Card model  {:name          "MBQL Model"
                                         :type          :model
                                         :database_id   (mt/id)
                                         :table_id      (mt/id :venues)
                                         :dataset_query (mt/mbql-query venues)}
                     :model/Card metric {:name          "Metric on MBQL model"
                                         :type          :metric
                                         :database_id   (mt/id)
                                         :dataset_query (metric-on-card-query (:id model))}]
        (wipe-dimensions! (:id metric))
        (let [res  (explorations.impl/exploration-data {:metric-ids [(:id metric)]})
              mine (first (filter #(= (:id %) (:id metric)) (:metrics res)))]
          (is (seq (:dimension_ids mine))
              "response includes the freshly synced dimensions")
          (is (seq (:dimensions (t2/select-one :model/Card :id (:id metric))))
              "healed dimensions are persisted"))))))

(deftest exploration-data-heals-missing-dimensions-sql-model-test
  (testing "a metric on a native-SQL model with NULL dimensions is synced and persisted on read"
    (mt/with-test-user :crowberto
      (mt/with-temp [:model/Card model  {:name            "SQL Model"
                                         :type            :model
                                         :database_id     (mt/id)
                                         :dataset_query   (mt/native-query
                                                           {:query "SELECT ID, NAME, CATEGORY_ID FROM VENUES"})
                                         :result_metadata [{:name "ID" :display_name "ID" :base_type :type/BigInteger}
                                                           {:name "NAME" :display_name "Name" :base_type :type/Text}
                                                           {:name "CATEGORY_ID" :display_name "Category ID" :base_type :type/Integer}]}
                     :model/Card metric {:name          "Metric on SQL model"
                                         :type          :metric
                                         :database_id   (mt/id)
                                         :dataset_query (metric-on-card-query (:id model))}]
        (wipe-dimensions! (:id metric))
        (let [res  (explorations.impl/exploration-data {:metric-ids [(:id metric)]})
              mine (first (filter #(= (:id %) (:id metric)) (:metrics res)))]
          (is (seq (:dimension_ids mine)))
          (is (= #{"ID" "NAME" "CATEGORY_ID"}
                 (into #{} (map :name) (:dimensions (t2/select-one :model/Card :id (:id metric)))))
              "healed dimensions match the model's result_metadata columns"))))))

(deftest exploration-data-uncomputable-metric-does-not-break-test
  (testing "a metric whose model has no result_metadata computes no dimensions but doesn't break the response"
    (mt/with-test-user :crowberto
      (mt/with-temp [:model/Card model {:name          "SQL Model without metadata"
                                        :type          :model
                                        :database_id   (mt/id)
                                        :dataset_query (mt/native-query
                                                        {:query "SELECT ID, NAME FROM VENUES"})}]
        (t2/update! (t2/table-name :model/Card) (:id model) {:result_metadata nil})
        (mt/with-temp [:model/Card metric {:name          "Metric on metadata-less model"
                                           :type          :metric
                                           :database_id   (mt/id)
                                           :dataset_query (metric-on-card-query (:id model))}]
          (wipe-dimensions! (:id metric))
          (let [res  (explorations.impl/exploration-data {:metric-ids [(:id metric)]})
                mine (first (filter #(= (:id %) (:id metric)) (:metrics res)))]
            (is (some? mine) "metric still appears in the response")
            (is (empty? (:dimension_ids mine)))
            (is (nil? (:dimensions (t2/select-one :model/Card :id (:id metric))))
                "nothing computed -> nothing persisted, stays NULL for a later retry")))))))

;;; --------------------------------------- metric search matching ---------------------------------------

(deftest metric-search-matches-displayed-names-test
  (testing "search matches the '<group> - <dimension>' combination the picker displays"
    (let [matches? #(#'explorations.impl/metric-matches-search? %1 %2)
          metric   {:name       "Revenue"
                    :dimensions [{:display-name "Created At"
                                  :group        {:display-name "Orders"}}]}]
      (testing "metric name still matches"
        (is (matches? metric "revenue")))
      (testing "the raw dimension name still matches"
        (is (matches? metric "created at")))
      (testing "the group name matches"
        (is (matches? metric "orders")))
      (testing "the displayed combination matches"
        (is (matches? metric "orders - created")))
      (testing "non-matches stay non-matches"
        (is (not (matches? metric "customers")))))))
