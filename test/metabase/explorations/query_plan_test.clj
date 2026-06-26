(ns metabase.explorations.query-plan-test
  "Tests for the orchestrator's planner-selection logic. Planner-specific
  validators and variant emission live in
  `metabase.explorations.query-plan.llm-test` and
  `metabase.explorations.query-plan.mechanical-test`."
  (:require
   [clojure.test :refer :all]
   [metabase.explorations.query-plan :as query-plan]
   [metabase.explorations.query-plan.llm :as qp.llm]
   [metabase.explorations.query-plan.mechanical :as qp.mech]
   [metabase.explorations.query-plan.planner :as planner]
   [metabase.explorations.settings :as explorations.settings]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.metabot.settings :as metabot.settings]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(deftest pick-planner-test
  (testing ":auto + LLM configured → LLM planner"
    (mt/with-temporary-setting-values [explorations-query-planner :auto]
      (with-redefs [metabot.settings/llm-metabot-configured? (constantly true)]
        (is (identical? qp.llm/planner (query-plan/pick-planner!)))
        (is (= :llm (planner/planner-name (query-plan/pick-planner!)))))))
  (testing ":auto + LLM unconfigured → mechanical planner (no skip)"
    (mt/with-temporary-setting-values [explorations-query-planner :auto]
      (with-redefs [metabot.settings/llm-metabot-configured? (constantly false)]
        (is (identical? qp.mech/planner (query-plan/pick-planner!)))
        (is (= :mechanical (planner/planner-name (query-plan/pick-planner!)))))))
  (testing ":llm + LLM configured → LLM planner"
    (mt/with-temporary-setting-values [explorations-query-planner :llm]
      (with-redefs [metabot.settings/llm-metabot-configured? (constantly true)]
        (is (identical? qp.llm/planner (query-plan/pick-planner!))))))
  (testing ":llm + LLM unconfigured → skip-no-llm"
    (mt/with-temporary-setting-values [explorations-query-planner :llm]
      (with-redefs [metabot.settings/llm-metabot-configured? (constantly false)]
        (is (= {:skip :skip-no-llm} (query-plan/pick-planner!))))))
  (testing ":mechanical always picks mechanical, regardless of LLM availability"
    (mt/with-temporary-setting-values [explorations-query-planner :mechanical]
      (with-redefs [metabot.settings/llm-metabot-configured? (constantly true)]
        (is (identical? qp.mech/planner (query-plan/pick-planner!))))
      (with-redefs [metabot.settings/llm-metabot-configured? (constantly false)]
        (is (identical? qp.mech/planner (query-plan/pick-planner!)))))))

(deftest planner-protocol-implementations-test
  (testing "Every planner singleton satisfies the QueryPlanner protocol"
    (is (satisfies? planner/QueryPlanner qp.llm/planner))
    (is (satisfies? planner/QueryPlanner qp.mech/planner)))
  (testing "Each planner names itself"
    (is (= :llm        (planner/planner-name qp.llm/planner)))
    (is (= :mechanical (planner/planner-name qp.mech/planner)))))

(deftest planner-setting-default-test
  (testing "explorations-query-planner defaults to :mechanical"
    (is (= :mechanical (explorations.settings/explorations-query-planner)))))

;;; ---------------------------------------------------------------------------
;;; Materialization stamps group_id (mechanical planner, end-to-end through the DB)
;;; ---------------------------------------------------------------------------

(defn- count-metric-query []
  (lib/->legacy-MBQL
   (let [mp (mt/metadata-provider)]
     (-> (lib/query mp (lib.metadata/table mp (mt/id :venues)))
         (lib/aggregate (lib/count))))))

(deftest materialize-stamps-group-id-test
  (mt/with-temporary-setting-values [explorations-query-planner :mechanical]
    (mt/with-temp [:model/Card metric {:type :metric :dataset_query (count-metric-query)}
                   :model/Exploration e {:name "x"}
                   :model/ExplorationThread t {:exploration_id (:id e)}]
      (let [cid      (:id metric)
            mappings [{:dimension_id "d1" :table_id (mt/id :venues)
                       :target ["field" {} (mt/id :venues :price)]}
                      {:dimension_id "d2" :table_id (mt/id :venues)
                       :target ["field" {} (mt/id :venues :name)]}]
            mk-group (fn [dim-id disp etype]
                       (first (t2/insert-returning-instances!
                               :model/ExplorationBlock
                               {:exploration_thread_id (:id t)
                                :metrics               [{:card_id cid :dimension_mappings mappings}]
                                :dimensions            [{:dimension_id dim-id :display_name disp
                                                         :effective_type etype}]
                                :position              0})))
            g1       (mk-group "d1" "Price" "type/Number")
            g2       (mk-group "d2" "Name" "type/Text")]
        (is (= :ok (query-plan/generate-query-plan! (:id t))))
        (let [rows     (t2/select [:model/ExplorationQuery :group_id :card_id :dimension_id]
                                  :exploration_thread_id (:id t))
              by-group (group-by :group_id rows)]
          (testing "every materialized row carries a group_id"
            (is (every? :group_id rows))
            (is (= #{(:id g1) (:id g2)} (set (keys by-group)))))
          (testing "each group's rows only reference that group's (metric, dim) pair"
            (is (every? #(= "d1" (:dimension_id %)) (by-group (:id g1))))
            (is (every? #(= "d2" (:dimension_id %)) (by-group (:id g2))))
            (is (every? #(= cid (:card_id %)) rows))))))))

(deftest duplicate-pair-across-groups-materializes-once-per-group-test
  (testing "the same (metric, dim) in two groups produces rows under each group"
    (mt/with-temporary-setting-values [explorations-query-planner :mechanical]
      (mt/with-temp [:model/Card metric {:type :metric :dataset_query (count-metric-query)}
                     :model/Exploration e {:name "x"}
                     :model/ExplorationThread t {:exploration_id (:id e)}]
        (let [cid      (:id metric)
              mappings [{:dimension_id "d1" :table_id (mt/id :venues)
                         :target ["field" {} (mt/id :venues :price)]}]
              dims     [{:dimension_id "d1" :display_name "Price" :effective_type "type/Number"}]
              mk       (fn [] (first (t2/insert-returning-instances!
                                      :model/ExplorationBlock
                                      {:exploration_thread_id (:id t)
                                       :metrics    [{:card_id cid :dimension_mappings mappings}]
                                       :dimensions dims :position 0})))
              g1       (mk)
              g2       (mk)]
          (is (= :ok (query-plan/generate-query-plan! (:id t))))
          (let [by-group (group-by :group_id (t2/select [:model/ExplorationQuery :group_id :dimension_id]
                                                        :exploration_thread_id (:id t)))]
            (is (= #{(:id g1) (:id g2)} (set (keys by-group))) "rows under both groups")
            (is (pos? (count (by-group (:id g1)))))
            (is (pos? (count (by-group (:id g2)))))))))))

;;; ---------------------------------------------------------------------------
;;; Page reconciliation (mechanical planner, end-to-end through the DB)
;;; ---------------------------------------------------------------------------

(defn- mk-block!
  "Insert a one-metric, one-dimension block on `tid` and return its instance."
  [tid cid dim-id disp etype]
  (let [mappings [{:dimension_id dim-id :table_id (mt/id :venues)
                   :target ["field" {} (mt/id :venues :price)]}]]
    (first (t2/insert-returning-instances!
            :model/ExplorationBlock
            {:exploration_thread_id tid
             :metrics               [{:card_id cid :dimension_mappings mappings}]
             :dimensions            [{:dimension_id dim-id :display_name disp :effective_type etype}]
             :position              0}))))

(deftest reconcile-creates-pages-and-stamps-page-id-test
  (testing "every query is stamped with a page; one page per (block, card, dim, query_type)"
    (mt/with-temporary-setting-values [explorations-query-planner :mechanical]
      (mt/with-temp [:model/Card metric {:type :metric :dataset_query (count-metric-query)}
                     :model/Exploration e {:name "x"}
                     :model/ExplorationThread t {:exploration_id (:id e)}]
        (let [cid (:id metric)
              g1  (mk-block! (:id t) cid "d1" "Price" "type/Number")
              g2  (mk-block! (:id t) cid "d2" "Name" "type/Text")]
          (is (= :ok (query-plan/generate-query-plan! (:id t))))
          (let [qrows (t2/select [:model/ExplorationQuery :id :page_id :group_id :card_id
                                  :dimension_id :query_type]
                                 :exploration_thread_id (:id t))
                pages (t2/select :model/ExplorationPage :exploration_block_id [:in [(:id g1) (:id g2)]])
                by-id (u/index-by :id pages)]
            (is (every? :page_id qrows) "every query carries a page_id")
            (is (= (count (distinct (map (juxt :group_id :card_id :dimension_id :query_type) qrows)))
                   (count pages))
                "exactly one page per distinct (block, card, dim, query_type)")
            (is (every? (fn [q]
                          (let [p (by-id (:page_id q))]
                            (and (= (:group_id q)     (:exploration_block_id p))
                                 (= (:card_id q)      (:card_id p))
                                 (= (:dimension_id q) (:dimension_id p))
                                 (= (:query_type q)   (:query_type p)))))
                        qrows)
                "each query's page matches the query's (block, card, dim, query_type)")))))))

(deftest reconcile-preserves-page-ids-across-rerun-test
  (testing "a rerun with unchanged selection reuses the same page ids"
    (mt/with-temporary-setting-values [explorations-query-planner :mechanical]
      (mt/with-temp [:model/Card metric {:type :metric :dataset_query (count-metric-query)}
                     :model/Exploration e {:name "x"}
                     :model/ExplorationThread t {:exploration_id (:id e)}]
        (let [g        (mk-block! (:id t) (:id metric) "d1" "Price" "type/Number")
              page-ids #(set (t2/select-pks-vec :model/ExplorationPage :exploration_block_id (:id g)))]
          (is (= :ok (query-plan/generate-query-plan! (:id t))))
          (let [before (page-ids)]
            (is (seq before))
            ;; mimic reset-thread-for-rerun!: drop queries, keep pages, replan
            (t2/delete! :model/ExplorationQuery :exploration_thread_id (:id t))
            (is (= :ok (query-plan/generate-query-plan! (:id t))))
            (is (= before (page-ids)) "page ids are stable across the rerun")
            (is (every? :page_id (t2/select [:model/ExplorationQuery :page_id]
                                            :exploration_thread_id (:id t)))
                "regenerated queries are re-stamped onto the surviving pages")))))))

(deftest reconcile-gcs-orphan-pages-test
  (testing "a page with no queries (a removed selection) is GC'd when the plan runs"
    (mt/with-temporary-setting-values [explorations-query-planner :mechanical]
      (mt/with-temp [:model/Card metric {:type :metric :dataset_query (count-metric-query)}
                     :model/Exploration e {:name "x"}
                     :model/ExplorationThread t {:exploration_id (:id e)}]
        (let [cid    (:id metric)
              g      (mk-block! (:id t) cid "d1" "Price" "type/Number")
              orphan (t2/insert-returning-pk! :model/ExplorationPage
                                              {:exploration_block_id (:id g)
                                               :card_id              cid
                                               :dimension_id         "ghost"
                                               :query_type           "default"})]
          (is (some? (t2/select-one-pk :model/ExplorationPage :id orphan)) "orphan page seeded")
          (is (= :ok (query-plan/generate-query-plan! (:id t))))
          (is (nil? (t2/select-one-pk :model/ExplorationPage :id orphan))
              "orphan page (no queries) was GC'd")
          (is (seq (t2/select-pks-vec :model/ExplorationPage :exploration_block_id (:id g)))
              "pages for the live selection remain"))))))
