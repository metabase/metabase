(ns metabase.explorations.impl-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.explorations.impl :as explorations.impl]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db :test-users))

(defn- count-metric-query
  "Legacy MBQL for a `count` aggregation over the given table — a minimal valid metric query."
  [table-kw]
  (let [mp (mt/metadata-provider)]
    (lib/->legacy-MBQL (-> (lib/query mp (lib.metadata/table mp (mt/id table-kw)))
                           (lib/aggregate (lib/count))))))

(defn- do-with-sample-metrics-archived [thunk]
  (let [sample-db-id (t2/select-one-pk :model/Database 'is_sample true)
        metric-ids   (when sample-db-id
                       (t2/select-pks-vec :model/Card 'type :metric 'archived false
                                          'database_id sample-db-id))]
    (if (seq metric-ids)
      (try
        (t2/query {'update 'report_card 'set {:archived true} 'where ['in 'id metric-ids]})
        (thunk)
        (finally
          (t2/query {'update 'report_card 'set {:archived false} 'where ['in 'id metric-ids]})))
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
  [{:id 1 :name "Revenue" :description "rev" :result_column_name "count" :in_library true
    :dimensions [(dim "region-1" "Region" 0.9 [region-source])
                 (dim "plan-1" "Plan" 0.5 [plan-source])]}
   {:id 2 :name "Churn" :description "churn" :result_column_name "count" :in_library false
    :dimensions [(dim "region-2" "Region" 0.9 [region-source])]}])

(defn- synthetic-hydrated
  "Stand-in for the metric-loading functions over [[synthetic-metrics]], honouring the same
   `:metric-ids` restriction and `:q` match the real ones do — so tests can exercise filtering,
   and an id no metric has behaves like one the user can't read."
  [{:keys [metric-ids q]}]
  (cond->> synthetic-metrics
    (seq metric-ids)     (filterv (comp (set metric-ids) :id))
    (not (str/blank? q)) (filterv #(@#'explorations.impl/metric-matches-search?
                                    % (u/lower-case-en q)))))

(defmacro ^:private with-synthetic-metrics [& body]
  `(mt/with-dynamic-fn-redefs [explorations.impl/hydrated-metrics synthetic-hydrated
                               explorations.impl/index-metrics    synthetic-hydrated]
     ~@body))

(deftest research-metric-index-test
  (with-synthetic-metrics
    (testing "slim rows only — id/name/description/in_library, no dimensions"
      (is (= {:metrics [{:id 1 :name "Revenue" :description "rev" :in_library true}
                        {:id 2 :name "Churn" :description "churn" :in_library false}]}
             (explorations.impl/research-metric-index {}))))))

(deftest research-metric-index-truncates-descriptions-test
  (let [long-desc (apply str (repeat 40 "long desc "))
        stub      [{:id 1 :name "M" :description long-desc :in_library false :dimensions []}]]
    (mt/with-dynamic-fn-redefs [explorations.impl/index-metrics (fn [_] stub)]
      (let [[{:keys [description]}] (:metrics (explorations.impl/research-metric-index {}))]
        (is (= (inc @#'explorations.impl/catalog-description-max-length) (count description)))
        (is (str/ends-with? description "…"))))))

(deftest research-metric-index-cap-test
  ;; 505 matches: ids 0-4 in the library, the rest not.
  (let [many (vec (for [i (range 505)]
                    {:id i :name (str "M" i) :description nil
                     :in_library (< i 5)
                     :dimensions [(dim (str "d" i) (str "D" i) (+ 0.1 (/ i 1000.0))
                                       [{:source i}])]}))]
    (mt/with-dynamic-fn-redefs [explorations.impl/index-metrics (fn [_] many)]
      (let [{:keys [metrics truncated shown matched]} (explorations.impl/research-metric-index {})]
        (testing "an over-cap index is truncated and stamped"
          (is (true? truncated))
          (is (= 500 shown))
          (is (= 505 matched))
          (is (= 500 (count metrics))))
        (testing "library metrics survive the cut, ranked first"
          (is (= [4 3 2 1 0] (mapv :id (take 5 metrics)))))))))

(deftest research-metric-index-ranks-below-the-cap-too-test
  (testing "an under-cap index is ranked the same way an over-cap one is, so a metric doesn't
            move just because the instance grew past the cap"
    (let [few (vec (for [i (range 6)]
                     {:id i :name (str "M" i) :description nil
                      :in_library (< i 2)
                      :dimensions [(dim (str "d" i) (str "D" i) (+ 0.1 (/ i 100.0))
                                        [{:source i}])]}))]
      (mt/with-dynamic-fn-redefs [explorations.impl/index-metrics (fn [_] few)]
        (let [{:keys [metrics truncated]} (explorations.impl/research-metric-index {})]
          (is (nil? truncated))
          (is (= [1 0 5 4 3 2] (mapv :id metrics))))))))

(deftest research-metric-index-ranks-on-candidate-dimensions-test
  (testing "a metric whose only dimension scores below min-interestingness has no candidates, so
            it ranks with the dimension-less metrics rather than above them"
    ;; Input order matters: `bare` is listed first, so it only stays ahead of `sub` if `sub`
    ;; scored nothing. Ranking on raw (unfiltered) dimensions would lift `sub` above it.
    (let [bare {:id 2 :name "Bare" :description nil :in_library false :dimensions []}
          sub  {:id 1 :name "Sub" :description nil :in_library false
                :dimensions [(dim "d1" "D1" 0.09 [{:source 1}])]}
          real {:id 3 :name "Real" :description nil :in_library false
                :dimensions [(dim "d3" "D3" 0.2 [{:source 3}])]}]
      (mt/with-dynamic-fn-redefs [explorations.impl/index-metrics (fn [_] [bare sub real])]
        (is (= [3 2 1] (mapv :id (:metrics (explorations.impl/research-metric-index {})))))))))

(deftest research-candidates-test
  (with-synthetic-metrics
    (let [{:keys [metrics dimension_groups truncated]} (explorations.impl/research-candidates
                                                        {:metric-ids [1 2]})]
      (testing "each metric carries the dimension ids it can be sliced by, tagged with their group"
        (is (= [{:id 1 :name "Revenue" :description "rev" :result_column_name "count"
                 :dimensions [{:id "region-1" :group "Region"} {:id "plan-1" :group "Plan"}]}
                {:id 2 :name "Churn" :description "churn" :result_column_name "count"
                 :dimensions [{:id "region-2" :group "Region"}]}]
               metrics)))
      (testing "groups state the descriptive fields once, and which metrics they slice"
        (is (= [{:name "Region" :effective_type "type/Text" :semantic_type nil
                 :interestingness 0.9 :metric_ids [1 2]}
                {:name "Plan" :effective_type "type/Text" :semantic_type nil
                 :interestingness 0.5 :metric_ids [1]}]
               dimension_groups)))
      (testing "an explicit metric-ids request is not truncated"
        (is (nil? truncated))))))

(deftest research-candidates-renamed-dimension-test
  (testing "a dimension a metric renamed carries that metric's name; ones matching their group
            don't repeat it"
    (let [stub [{:id 1 :name "Revenue" :description nil :result_column_name "count"
                 :in_library false :dimensions [(dim "region-1" "Region" 0.9 [region-source])]}
                {:id 2 :name "Churn" :description nil :result_column_name "count"
                 :in_library false :dimensions [(dim "region-2" "Territory" 0.9 [region-source])]}]]
      (mt/with-dynamic-fn-redefs [explorations.impl/hydrated-metrics (fn [_] stub)]
        (let [{:keys [metrics]} (explorations.impl/research-candidates {:metric-ids [1 2]})]
          (is (= [[{:id "region-1" :group "Region"}]
                  [{:id "region-2" :group "Region" :name "Territory"}]]
                 (mapv :dimensions metrics))))))))

(deftest research-candidates-two-dimensions-in-one-group-test
  (testing "a metric with two dimensions in the same group keeps both — neither is dropped"
    (let [stub [{:id 1 :name "Revenue" :description nil :result_column_name "count"
                 :in_library false
                 :dimensions [(dim "region-a" "Region" 0.9 [region-source])
                              (dim "region-b" "Region (billing)" 0.9 [region-source])]}]]
      (mt/with-dynamic-fn-redefs [explorations.impl/hydrated-metrics (fn [_] stub)]
        (let [{:keys [metrics dimension_groups]} (explorations.impl/research-candidates
                                                  {:metric-ids [1]})]
          (is (= ["region-a" "region-b"] (mapv :id (:dimensions (first metrics)))))
          (is (= [[1]] (mapv :metric_ids dimension_groups))))))))

(deftest research-candidates-heterogeneous-group-test
  (testing "when a group's dimensions don't agree on their types (group-by-source unions
            transitively, so a group can span Fields) nothing is stated at the group level"
    (let [shared {:source 1}
          stub   [{:id 1 :name "Revenue" :description nil :result_column_name "count"
                   :in_library false
                   :dimensions [(dim "d1" "Region" 0.9 [shared])
                                (assoc (dim "d2" "Signup" 0.9 [shared])
                                       :effective-type "type/DateTime")]}]]
      (mt/with-dynamic-fn-redefs [explorations.impl/hydrated-metrics (fn [_] stub)]
        (let [groups (:dimension_groups (explorations.impl/research-candidates {:metric-ids [1]}))]
          (is (= 1 (count groups)))
          (is (not (contains? (first groups) :effective_type)))
          (is (not (contains? (first groups) :semantic_type))))))))

(deftest research-candidates-truncates-descriptions-test
  (testing "descriptions are capped here too — 20 essay-length ones would otherwise be most of
            the payload"
    (let [stub [{:id 1 :name "M" :description (apply str (repeat 40 "long desc "))
                 :result_column_name "count" :in_library false :dimensions []}]]
      (mt/with-dynamic-fn-redefs [explorations.impl/hydrated-metrics (fn [_] stub)]
        (let [[{:keys [description]}] (:metrics (explorations.impl/research-candidates
                                                 {:metric-ids [1]}))]
          (is (= (inc @#'explorations.impl/catalog-description-max-length) (count description))))))))

(deftest research-candidates-metric-ids-and-q-test
  (with-synthetic-metrics
    (testing "metric_ids and q compose — q narrows the requested metrics rather than replacing them"
      (is (= [1] (mapv :id (:metrics (explorations.impl/research-candidates
                                      {:metric-ids [1 2] :q "plan"}))))))))

(deftest research-candidates-missing-metric-ids-test
  (with-synthetic-metrics
    (testing "ids the user can't see are reported rather than silently dropped"
      (let [{:keys [metrics missing_metric_ids]} (explorations.impl/research-candidates
                                                  {:metric-ids [1 999 1000]})]
        (is (= [1] (mapv :id metrics)))
        (is (= [999 1000] missing_metric_ids))))
    (testing "nothing is stamped when every requested id came back"
      (is (nil? (:missing_metric_ids (explorations.impl/research-candidates
                                      {:metric-ids [1 2]})))))))

(deftest research-candidates-q-truncation-test
  ;; 25 matches: ids 0-4 in the library, the rest not; interestingness rises with id.
  (let [many (vec (for [i (range 25)]
                    {:id i :name (str "M" i) :description nil :result_column_name "count"
                     :in_library (< i 5)
                     :dimensions [(dim (str "d" i) (str "D" i) (+ 0.1 (/ i 100.0))
                                       [{:source i}])]}))]
    (mt/with-dynamic-fn-redefs [explorations.impl/hydrated-metrics (fn [_] many)]
      (let [{:keys [metrics truncated shown matched]} (explorations.impl/research-candidates
                                                       {:q "m"})]
        (testing "a q match beyond the cap is truncated and stamped"
          (is (true? truncated))
          (is (= 20 shown))
          (is (= 25 matched))
          (is (= 20 (count metrics))))
        (testing "library metrics rank first, then by interestingness"
          (is (= [4 3 2 1 0] (mapv :id (take 5 metrics))))
          (is (= 24 (:id (nth metrics 5)))))))))

;;; The whole point of the two-tier split (UXW-4967) is that neither research tool can hand the
;;; LLM an unbounded blob. These guard that: the payloads are a function of the caps, not of how
;;; many metrics the instance has. Sizes are generous ceilings — they catch a return to
;;; per-metric-inlined dimensions (which ran ~1KB/metric over the whole catalog), not drift.

(defn- realistic-metrics
  "`n` metrics shaped like real ones: uuid dimension ids, prose descriptions, `d` dimensions each
   drawn from a small pool of shared groups (as same-table metrics really do share Fields)."
  [n d]
  (vec (for [i (range n)]
         {:id i :name (str "Metric number " i) :in_library false :result_column_name "sum"
          :description (apply str (repeat 30 "some prose describing this metric. "))
          :dimensions (vec (for [j (range d)]
                             (dim (str (random-uuid)) (str "Dimension " j) (+ 0.1 (/ j 100.0))
                                  [{:source j}])))})))

(deftest research-metric-index-payload-is-bounded-test
  (mt/with-dynamic-fn-redefs [explorations.impl/index-metrics (fn [_] (realistic-metrics 5000 8))]
    (let [payload (explorations.impl/research-metric-index {})]
      (is (true? (:truncated payload)))
      (is (> 120000 (count (json/encode payload)))))))

(deftest research-candidates-payload-is-bounded-test
  (mt/with-dynamic-fn-redefs [explorations.impl/hydrated-metrics (fn [_] (realistic-metrics 5000 8))]
    (let [payload (explorations.impl/research-candidates {:q "metric"})]
      (is (true? (:truncated payload)))
      (is (> 20000 (count (json/encode payload)))))))

(deftest research-groups-test
  (with-synthetic-metrics
    (testing "a valid group echoes its spec and restricts to that metric"
      (let [spec {:metric_id 1 :dimension_ids ["plan-1"]}
            {:keys [metrics groups]} (explorations.impl/research-groups {:groups [spec]})]
        (is (= [spec] groups))
        (is (= [1] (mapv :id metrics)))
        (is (= ["region-1" "plan-1"] (:dimension_ids (first metrics))))))
    (testing "dimension_ids is optional"
      (is (= [1] (mapv :id (:metrics (explorations.impl/research-groups
                                      {:groups [{:metric_id 1}]}))))))
    (testing "several groups pull the union of their metrics"
      (is (= [1 2] (sort (mapv :id (:metrics (explorations.impl/research-groups
                                              {:groups [{:metric_id 1} {:metric_id 2}]})))))))))

(deftest research-groups-hard-errors-test
  (with-synthetic-metrics
    (testing "unknown metric id"
      (is (thrown-with-msg? Exception #"Unknown or inaccessible metric id 999"
                            (explorations.impl/research-groups
                             {:groups [{:metric_id 999}]}))))
    (testing "dimension that isn't a candidate of its metric"
      (is (thrown-with-msg? Exception #"not a candidate of metric"
                            (explorations.impl/research-groups
                             {:groups [{:metric_id 1 :dimension_ids ["region-2"]}]}))))
    (testing "replace_default_dimensions with no dimension_ids"
      (is (thrown-with-msg? Exception #"replace_default_dimensions requires"
                            (explorations.impl/research-groups
                             {:groups [{:metric_id 1 :replace_default_dimensions true}]}))))))

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
    (mt/with-dynamic-fn-redefs [explorations.impl/hydrated-metrics (fn [_] threshold-metrics)]
      (let [{:keys [metrics dimension_groups]} (explorations.impl/exploration-data {})
            metric-dim-ids (set (:dimension_ids (first metrics)))
            group-dim-ids  (into #{} (mapcat #(map :id (:dimensions %))) dimension_groups)]
        (testing "the sub-threshold dimension is dropped from the metric's dimension_ids"
          (is (= #{"keep-1" "unscored-1"} metric-dim-ids)))
        (testing "every referenced dimension id resolves to a dimension group (no dangling ids)"
          (is (= metric-dim-ids group-dim-ids)))))))

;;; --------------------------------------- missing-dimension self-healing (UXW-4475) ---------------------------------------

(defn- table-query
  "Model dataset_query selecting everything from `table-kw`."
  [table-kw]
  (let [mp (mt/metadata-provider)]
    (lib/query mp (lib.metadata/table mp (mt/id table-kw)))))

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
                                         :dataset_query (table-query :venues)}
                     :model/Card metric {:name          "Metric on MBQL model"
                                         :type          :metric
                                         :database_id   (mt/id)
                                         :dataset_query (metric-on-card-query (:id model))}]
        (wipe-dimensions! (:id metric))
        (let [res  (explorations.impl/exploration-data {:metric-ids [(:id metric)]})
              mine (first (filter #(= (:id %) (:id metric)) (:metrics res)))]
          (is (seq (:dimension_ids mine))
              "response includes the freshly synced dimensions")
          (is (seq (:dimensions (t2/select-one :model/Card 'id (:id metric))))
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
                 (into #{} (map :name) (:dimensions (t2/select-one :model/Card 'id (:id metric)))))
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
            (is (nil? (:dimensions (t2/select-one :model/Card 'id (:id metric))))
                "nothing computed -> nothing persisted, stays NULL for a later retry")))))))

;;; --------------------------------------- metric search matching ---------------------------------------

(deftest metric-search-matches-displayed-names-test
  (testing "search matches the metric name and each dimension's curated display_name"
    (let [matches? #(#'explorations.impl/metric-matches-search? %1 %2)
          metric   {:name       "Revenue"
                    :dimensions [{:display-name "Created At"
                                  :group        {:display-name "Orders"}}]}]
      (testing "metric name still matches"
        (is (matches? metric "revenue")))
      (testing "the curated dimension name matches"
        (is (matches? metric "created at")))
      (testing "the source group name is not part of the search text"
        (is (not (matches? metric "orders"))))
      (testing "non-matches stay non-matches"
        (is (not (matches? metric "customers")))))))
