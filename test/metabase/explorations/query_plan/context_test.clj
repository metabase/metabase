(ns metabase.explorations.query-plan.context-test
  (:require
   [clojure.test :refer :all]
   [metabase.explorations.query-plan.context :as qp.context]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(defn- count-metric-query []
  (lib/->legacy-MBQL
   (let [mp (mt/metadata-provider)]
     (-> (lib/query mp (lib.metadata/table mp (mt/id :venues)))
         (lib/aggregate (lib/count))))))

(deftest per-group-context-scopes-applicability-test
  (testing "metric-and-dim-context returns one entry per group, with applicability scoped to that group's dims"
    (mt/with-temp [:model/Card metric {:type :metric :name "Revenue"
                                       :dataset_query (count-metric-query)}]
      (let [cid      (:id metric)
            mappings [{:dimension_id "d1" :table_id (mt/id :venues)
                       :target ["field" {} (mt/id :venues :price)]}
                      {:dimension_id "d2" :table_id (mt/id :venues)
                       :target ["field" {} (mt/id :venues :name)]}]
            ;; Two groups sharing the same metric. Group A pairs it with d1 only;
            ;; group B with d2 only — even though the metric's dimension_mappings
            ;; resolve BOTH dims. Applicability must stay within each group.
            group-a  {:id 1
                      :metrics    [{:card_id cid :dimension_mappings mappings}]
                      :dimensions [{:dimension_id "d1" :display_name "Price"
                                    :effective_type :type/Number}]}
            group-b  {:id 2
                      :metrics    [{:card_id cid :dimension_mappings mappings}]
                      :dimensions [{:dimension_id "d2" :display_name "Name"
                                    :effective_type :type/Text}]}
            result   (qp.context/metric-and-dim-context [group-a group-b])
            groups   (:groups result)
            [ga gb]  groups]
        (is (= 2 (count groups)) "one context entry per group")
        (is (= [1 2] (map :group-id groups)) "group-id carried through")
        (is (= ["Revenue" "Revenue"] (map :name groups))
            "group name is computed from the metric Card (both groups share the metric)")
        (testing "the shared metric is hydrated in both groups"
          (is (= [cid] (map :metric-id (:metrics ga))))
          (is (= [cid] (map :metric-id (:metrics gb))))
          (is (= cid (-> ga :metrics first :card :id))
              "metric Card is hydrated (not just referenced)"))
        (testing "applicability is scoped to each group's own dimensions"
          (is (= #{"d1"} (set (keys (get-in ga [:applicability cid])))))
          (is (= #{"d2"} (set (keys (get-in gb [:applicability cid]))))))
        (testing "each group's :dimensions list is its own"
          (is (= ["d1"] (map :dimension-id (:dimensions ga))))
          (is (= ["d2"] (map :dimension-id (:dimensions gb)))))))))

(deftest group-context-normalizes-anchor-type-test
  (testing "metric-and-dim-context resolves a definite :type at the edge — type-less groups are
            inferred there (not deep in a planner): 1 metric → metric, several → dimension; an
            explicit :type is honored"
    (mt/with-temp [:model/Card metric {:type :metric :dataset_query (count-metric-query)}]
      (let [cid        (:id metric)
            mapping    [{:dimension_id "d1" :table_id (mt/id :venues)
                         :target ["field" {} (mt/id :venues :price)]}]
            dim        {:dimension_id "d1" :display_name "Price" :effective_type :type/Number}
            metric-e   {:card_id cid :dimension_mappings mapping}
            one-metric {:id 1 :metrics [metric-e] :dimensions [dim]}            ; type-less, 1 metric
            two-metric {:id 2 :metrics [metric-e metric-e] :dimensions [dim]}   ; type-less, 2 metrics
            explicit   {:id 3 :type "dimension" :metrics [metric-e] :dimensions [dim]}
            groups     (:groups (qp.context/metric-and-dim-context [one-metric two-metric explicit]))]
        (is (= ["metric" "dimension" "dimension"] (map :type groups))
            "type-less inferred by metric count; explicit type honored")))))

(deftest build-row-context-resolves-from-group-test
  (testing "build-row-context resolves the dim target + snapshot from the row's group (not per-thread tables)"
    (mt/with-temp [:model/Card metric {:type :metric :dataset_query (count-metric-query)}
                   :model/Exploration e {:name "x"}
                   :model/ExplorationThread t {:exploration_id (:id e)}]
      (let [cid      (:id metric)
            mappings [{:dimension_id "d1" :table_id (mt/id :venues)
                       :target ["field" {} (mt/id :venues :price)]}]
            group    (first (t2/insert-returning-instances!
                             :model/ExplorationThreadGroup
                             {:exploration_thread_id (:id t)
                              :metrics               [{:card_id cid :dimension_mappings mappings}]
                              :dimensions            [{:dimension_id "d1" :display_name "Price"
                                                       :effective_type "type/Number"}]
                              :position              0}))
            row      {:card_id cid :dimension_id "d1" :group_id (:id group) :params {}}
            ctx      (qp.context/build-row-context row)]
        (is (some? ctx))
        (is (some? (:target ctx)) "dimension target resolved from the group's metric mappings")
        (is (= "Price" (:dim-label ctx)))
        (is (= "d1" (-> ctx :dim :dimension_id)))
        (is (= :type/Number (-> ctx :dim :effective_type)) "dim type keywordized by the model transform")))))

(deftest build-row-context-filter-path-test
  (mt/with-temp [:model/Card metric {:type :metric :dataset_query (count-metric-query)}
                 :model/Exploration e {:name "x"}
                 :model/ExplorationThread t {:exploration_id (:id e)}]
    (let [cid      (:id metric)
          ;; The metric maps ONLY d1 — d2 / unknown dims do not resolve to a target.
          mappings [{:dimension_id "d1" :table_id (mt/id :venues)
                     :target ["field" {} (mt/id :venues :price)]}]
          group    (first (t2/insert-returning-instances!
                           :model/ExplorationThreadGroup
                           {:exploration_thread_id (:id t)
                            :metrics               [{:card_id cid :dimension_mappings mappings}]
                            :dimensions            [{:dimension_id "d1" :display_name "Price"
                                                     :effective_type "type/Number"}]
                            :position              0}))
          row-for  (fn [filter-path]
                     {:card_id cid :dimension_id "d1" :group_id (:id group)
                      :params {:filter_path filter-path}})]
      (testing "a resolvable adaptive filter path resolves into :filter-path with targets"
        (let [ctx (qp.context/build-row-context (row-for [{:dimension_id "d1" :value 5}]))]
          (is (some? ctx))
          (is (= 1 (count (:filter-path ctx))))
          (is (= 5 (-> ctx :filter-path first :value)))
          (is (some? (-> ctx :filter-path first :target)) "step's target resolved")))
      (testing "an unresolvable filter-path step FAILS the row (returns nil) rather than silently
                dropping the step and broadening the query's scope behind its drill title"
        (is (nil? (qp.context/build-row-context (row-for [{:dimension_id "ghost" :value 5}])))
            "no mapping for 'ghost' → the row is failed, not widened")
        (is (nil? (qp.context/build-row-context
                   (row-for [{:dimension_id "d1" :value 5} {:dimension_id "ghost" :value 9}])))
            "one unresolvable step among resolvable ones still fails the whole row")))))

(deftest prompt-vars-emits-per-group-sections-test
  (testing "prompt-vars renders one block per group with its own metric/dimension counts"
    (mt/with-temp [:model/Card metric {:type :metric :name "Revenue"
                                       :dataset_query (count-metric-query)}]
      (let [cid      (:id metric)
            mappings [{:dimension_id "d1" :table_id (mt/id :venues)
                       :target ["field" {} (mt/id :venues :price)]}]
            group    {:id 7
                      :metrics    [{:card_id cid :dimension_mappings mappings}]
                      :dimensions [{:dimension_id "d1" :display_name "Price"
                                    :effective_type :type/Number}]}
            ctx      (qp.context/metric-and-dim-context [group])
            vars     (qp.context/prompt-vars {:metric-dim-ctx ctx :thread-prompt "why down?"})]
        (is (= "why down?" (:thread_prompt vars)))
        (is (= 1 (:group_count vars)))
        (is (= 1 (count (:groups vars))))
        (let [block (first (:groups vars))]
          (is (= 7 (:group_id block)))
          (is (= "Revenue" (:name block)) "block name is computed from the metric Card")
          (is (string? (:metrics_md block)))
          (is (string? (:dimensions_md block))))))))
