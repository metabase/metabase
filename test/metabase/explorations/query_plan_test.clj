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
;;; Page reconciliation (mechanical planner, end-to-end through the DB)
;;; ---------------------------------------------------------------------------

(defn- count-metric-query []
  (lib/->legacy-MBQL
   (let [mp (mt/metadata-provider)]
     (-> (lib/query mp (lib.metadata/table mp (mt/id :venues)))
         (lib/aggregate (lib/count))))))

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

(defn- block-of
  "The block id a query belongs to, via its page. `page-by-id` indexes ExplorationPage by id."
  [page-by-id q]
  (:exploration_block_id (page-by-id (:page_id q))))

(deftest materialize-assigns-pages-by-block-test
  (testing "every query is stamped with a page under the right block; blocks stay isolated"
    (mt/with-temporary-setting-values [explorations-query-planner :mechanical]
      (mt/with-temp [:model/Card metric {:type :metric :dataset_query (count-metric-query)}
                     :model/Exploration e {:name "x"}
                     :model/ExplorationThread t {:exploration_id (:id e)}]
        (let [cid (:id metric)
              g1  (mk-block! (:id t) cid "d1" "Price" "type/Number")
              g2  (mk-block! (:id t) cid "d2" "Name" "type/Text")]
          (is (= :ok (query-plan/generate-query-plan! (:id t))))
          (let [qrows  (t2/select [:model/ExplorationQuery :id :page_id :card_id :dimension_id]
                                  :exploration_thread_id (:id t))
                page-> (u/index-by :id (t2/select :model/ExplorationPage
                                                  :exploration_block_id [:in [(:id g1) (:id g2)]]))
                blk    (partial block-of page->)]
            (testing "every query carries a page under one of the thread's blocks"
              (is (every? :page_id qrows))
              (is (= #{(:id g1) (:id g2)} (set (map blk qrows)))))
            (testing "each block's queries only reference that block's (metric, dim) pair"
              (is (every? #(= "d1" (:dimension_id %)) (filter #(= (:id g1) (blk %)) qrows)))
              (is (every? #(= "d2" (:dimension_id %)) (filter #(= (:id g2) (blk %)) qrows)))
              (is (every? #(= cid (:card_id %)) qrows)))))))))

(deftest duplicate-pair-across-blocks-materializes-once-per-block-test
  (testing "the same (metric, dim) in two blocks produces a page (and rows) under each block"
    (mt/with-temporary-setting-values [explorations-query-planner :mechanical]
      (mt/with-temp [:model/Card metric {:type :metric :dataset_query (count-metric-query)}
                     :model/Exploration e {:name "x"}
                     :model/ExplorationThread t {:exploration_id (:id e)}]
        (let [cid (:id metric)
              g1  (mk-block! (:id t) cid "d1" "Price" "type/Number")
              g2  (mk-block! (:id t) cid "d1" "Price" "type/Number")]
          (is (= :ok (query-plan/generate-query-plan! (:id t))))
          (let [by-blk (group-by :exploration_block_id
                                 (t2/select :model/ExplorationPage
                                            :exploration_block_id [:in [(:id g1) (:id g2)]]))
                qcount (fn [block-id]
                         (t2/count :model/ExplorationQuery
                                   :page_id [:in (map :id (by-blk block-id))]))]
            (is (= #{(:id g1) (:id g2)} (set (keys by-blk))) "a page under each block")
            (is (pos? (qcount (:id g1))))
            (is (pos? (qcount (:id g2))))))))))

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
          (let [qrows (t2/select [:model/ExplorationQuery :id :page_id :card_id
                                  :dimension_id :query_type]
                                 :exploration_thread_id (:id t))
                pages (t2/select :model/ExplorationPage :exploration_block_id [:in [(:id g1) (:id g2)]])
                by-id (u/index-by :id pages)]
            (is (every? :page_id qrows) "every query carries a page_id")
            (is (= (count (distinct (map #(vector (:page_id %) (:card_id %)
                                                  (:dimension_id %) (:query_type %))
                                         qrows)))
                   (count pages))
                "exactly one page per distinct (page, card, dim, query_type)")
            (is (every? (fn [q]
                          (let [p (by-id (:page_id q))]
                            (and (= (:card_id q)      (:card_id p))
                                 (= (:dimension_id q) (:dimension_id p))
                                 (= (:query_type q)   (:query_type p)))))
                        qrows)
                "each query's page matches the query's (card, dim, query_type)")
            (is (= #{(:id g1) (:id g2)} (set (map :exploration_block_id pages)))
                "pages sit under the thread's blocks")))))))

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

(defn- comment-on-page!
  "Anchor an exploration comment on `page-id` (stored as a string in `child_target_id`, the way
  the FE posts it). Returns the comment id."
  [exploration-id page-id]
  (t2/insert-returning-pk! :model/Comment
                           {:target_type     "exploration"
                            :target_id       exploration-id
                            :child_target_id (str page-id)
                            :creator_id      (mt/user->id :rasta)
                            :content         {:type "doc"}}))

(deftest reconcile-retains-commented-orphan-page-test
  (testing "a rerun that drops a page's selection retains the page iff a comment anchors to it,
            while a no-comment empty page in the same rerun is still GC'd"
    (mt/with-temporary-setting-values [explorations-query-planner :mechanical]
      (mt/with-temp [:model/Card metric {:type :metric :dataset_query (count-metric-query)}
                     :model/Exploration e {:name "x"}
                     :model/ExplorationThread t {:exploration_id (:id e)}]
        (let [cid       (:id metric)
              g         (mk-block! (:id t) cid "d1" "Price" "type/Number")
              ;; two selections the planner won't regenerate: one with a comment, one without.
              commented (t2/insert-returning-pk! :model/ExplorationPage
                                                 {:exploration_block_id (:id g)
                                                  :card_id              cid
                                                  :dimension_id         "gone-but-commented"
                                                  :query_type           "default"})
              bare      (t2/insert-returning-pk! :model/ExplorationPage
                                                 {:exploration_block_id (:id g)
                                                  :card_id              cid
                                                  :dimension_id         "gone-no-comment"
                                                  :query_type           "default"})
              cmt       (comment-on-page! (:id e) commented)]
          (is (= :ok (query-plan/generate-query-plan! (:id t))))
          (testing "the commented orphan page is retained so the comment still resolves"
            (is (some? (t2/select-one-pk :model/ExplorationPage :id commented)))
            (is (= (str commented)
                   (t2/select-one-fn :child_target_id :model/Comment :id cmt))
                "the comment still anchors to the surviving page"))
          (testing "the orphan page with no comment is GC'd as before"
            (is (nil? (t2/select-one-pk :model/ExplorationPage :id bare)))))))))
