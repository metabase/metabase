(ns metabase.explorations.query-plan-test
  "Tests for the orchestrator. Planner-specific variant emission lives in
  `metabase.explorations.query-plan.mechanical-test`."
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.explorations.query-plan :as query-plan]
   [metabase.explorations.query-plan.mechanical :as qp.mech]
   [metabase.explorations.query-plan.planner :as planner]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.test :as mt]
   [metabase.test.util.dynamic-redefs :as dynamic-redefs]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(deftest pick-planner-test
  (testing "pick-planner! returns the mechanical planner"
    (is (identical? qp.mech/planner (query-plan/pick-planner!)))
    (is (= :mechanical (planner/planner-name (query-plan/pick-planner!))))))

(deftest planner-protocol-implementations-test
  (testing "Every planner singleton satisfies the QueryPlanner protocol"
    (is (satisfies? planner/QueryPlanner qp.mech/planner)))
  (testing "Each planner names itself"
    (is (= :mechanical (planner/planner-name qp.mech/planner)))))

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
            (is (every? #(= cid (:card_id %)) qrows))))))))

(deftest duplicate-pair-across-blocks-materializes-once-per-block-test
  (testing "the same (metric, dim) in two blocks produces a page (and rows) under each block"
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
          (is (pos? (qcount (:id g2)))))))))

(deftest reconcile-creates-pages-and-stamps-page-id-test
  (testing "every query is stamped with a page; one page per (block, card, dim, query_type)"
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
              "pages sit under the thread's blocks"))))))

(deftest reconcile-preserves-page-ids-across-rerun-test
  (testing "a rerun with unchanged selection reuses the same page ids"
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
              "regenerated queries are re-stamped onto the surviving pages"))))))

(deftest reconcile-gcs-orphan-pages-test
  (testing "a page with no queries (a removed selection) is GC'd when the plan runs"
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
            "pages for the live selection remain")))))

(defn- comment-on-page!
  "Anchor an exploration comment on `page-id` (stored as a string in `child_target_id`, the way
  the FE posts it). Returns the comment id. Extra `opts` merge into the row (e.g. `:deleted_at`)."
  ([exploration-id page-id]
   (comment-on-page! exploration-id page-id {}))
  ([exploration-id page-id opts]
   (t2/insert-returning-pk! :model/Comment
                            (merge {:target_type     "exploration"
                                    :target_id       exploration-id
                                    :child_target_id (str page-id)
                                    :creator_id      (mt/user->id :rasta)
                                    :content         {:type "doc"}}
                                   opts))))

(defn- orphan-page!
  "Seed a page under `block-id` for a selection the planner won't regenerate. Extra `opts`
  merge into the row (e.g. `:starred`)."
  [block-id card-id dim-id & [opts]]
  (t2/insert-returning-pk! :model/ExplorationPage
                           (merge {:exploration_block_id block-id
                                   :card_id              card-id
                                   :dimension_id         dim-id
                                   :query_type           "default"}
                                  opts)))

(deftest reconcile-retains-commented-orphan-page-test
  (testing "a rerun that drops a page's selection retains the page iff a comment anchors to it,
            while a no-comment empty page in the same rerun is still GC'd"
    (mt/with-temp [:model/Card metric {:type :metric :dataset_query (count-metric-query)}
                   :model/Exploration e {:name "x"}
                   :model/ExplorationThread t {:exploration_id (:id e)}]
      (let [cid       (:id metric)
            g         (mk-block! (:id t) cid "d1" "Price" "type/Number")
            ;; two selections the planner won't regenerate: one with a comment, one without.
            commented (orphan-page! (:id g) cid "gone-but-commented")
            bare      (orphan-page! (:id g) cid "gone-no-comment")
            cmt       (comment-on-page! (:id e) commented)]
        (is (= :ok (query-plan/generate-query-plan! (:id t))))
        (testing "the commented orphan page is retained so the comment still resolves"
          (is (some? (t2/select-one-pk :model/ExplorationPage :id commented)))
          (is (= (str commented)
                 (t2/select-one-fn :child_target_id :model/Comment :id cmt))
              "the comment still anchors to the surviving page"))
        (testing "the orphan page with no comment is GC'd as before"
          (is (nil? (t2/select-one-pk :model/ExplorationPage :id bare))))))))

(deftest reconcile-retains-starred-orphan-page-test
  (testing "a rerun that drops a page's selection retains the page iff it is starred — a star,
            like a comment, anchors user intent to the page"
    (mt/with-temp [:model/Card metric {:type :metric :dataset_query (count-metric-query)}
                   :model/Exploration e {:name "x"}
                   :model/ExplorationThread t {:exploration_id (:id e)}]
      (let [cid     (:id metric)
            g       (mk-block! (:id t) cid "d1" "Price" "type/Number")
            starred (orphan-page! (:id g) cid "gone-but-starred" {:starred true})
            bare    (orphan-page! (:id g) cid "gone-no-star")]
        (is (= :ok (query-plan/generate-query-plan! (:id t))))
        (testing "the starred orphan page survives, star intact"
          (is (true? (t2/select-one-fn :starred :model/ExplorationPage :id starred))))
        (testing "the unstarred orphan page is GC'd as before"
          (is (nil? (t2/select-one-pk :model/ExplorationPage :id bare))))))))

(deftest reconcile-ignores-soft-deleted-comment-anchors-test
  (testing "a page whose only anchor is a soft-deleted comment is GC'd — deleted comments don't count"
    (mt/with-temp [:model/Card metric {:type :metric :dataset_query (count-metric-query)}
                   :model/Exploration e {:name "x"}
                   :model/ExplorationThread t {:exploration_id (:id e)}]
      (let [cid    (:id metric)
            g      (mk-block! (:id t) cid "d1" "Price" "type/Number")
            orphan (orphan-page! (:id g) cid "gone-deleted-comment")]
        (comment-on-page! (:id e) orphan {:deleted_at (t/offset-date-time)})
        (is (= :ok (query-plan/generate-query-plan! (:id t))))
        (is (nil? (t2/select-one-pk :model/ExplorationPage :id orphan)))))))

(deftest empty-plan-skips-page-gc-test
  (testing "a plan that materializes zero rows leaves existing pages alone — a wholesale
            materialization failure must not destroy page-id stability for a later retry"
    (mt/with-temp [:model/Card metric {:type :metric :dataset_query (count-metric-query)}
                   :model/Exploration e {:name "x"}
                   :model/ExplorationThread t {:exploration_id (:id e)}]
      (let [cid    (:id metric)
            g      (mk-block! (:id t) cid "d1" "Price" "type/Number")
            orphan (orphan-page! (:id g) cid "would-be-orphan")]
        (is (zero? (#'query-plan/insert-plan-rows! (:id t) {} [])))
        (is (some? (t2/select-one-pk :model/ExplorationPage :id orphan))
            "no rows materialized → GC skipped → the page id survives")))))

;;; ---------------------------------------------------------------------------
;;; Redelivery safety
;;;
;;; Queue delivery is at-least-once, so `generate-query-plan!` can be entered twice for the same
;;; thread — sequentially (a redelivery) or concurrently (a duplicate delivery that overlaps the
;;; first). `plan-thread!`'s `exists?` gate only catches the sequential case *once rows exist*, so
;;; the persist step has to be safe on its own.
;;; ---------------------------------------------------------------------------

(deftest replanning-a-thread-does-not-duplicate-its-queries-test
  (testing "a redelivered plan message that reaches the planner again must not append a second set
            of query rows — the persist step re-checks, so the later planner discards its rows"
    (mt/with-temp [:model/Card metric {:type :metric :dataset_query (count-metric-query)}
                   :model/Exploration e {:name "x"}
                   :model/ExplorationThread t {:exploration_id (:id e)}]
      (let [cid (:id metric)]
        (mk-block! (:id t) cid "d1" "Price" "type/Number")
        (is (= :ok (query-plan/generate-query-plan! (:id t))))
        (let [after-first (t2/count :model/ExplorationQuery :exploration_thread_id (:id t))]
          (is (pos? after-first) "the first plan produced rows")
          (query-plan/generate-query-plan! (:id t))
          (is (= after-first (t2/count :model/ExplorationQuery :exploration_thread_id (:id t)))
              "planning the same thread again must not duplicate its query rows"))))))

(deftest planner-that-loses-the-persist-race-discards-its-rows-test
  (testing "a planner whose thread got planned by a *concurrent* delivery, after this one had already
            built its rows, must discard them rather than append a second set.

            This is the window the persist step's row lock closes. It matters most for pages:
            `find-or-create-page!` is a select-then-insert with no unique index behind it
            (`dimension_id` is a text column, which MySQL cannot uniquely index), so two planners
            inside it at once both miss and both insert — and a page's surrogate id is its identity,
            so the duplicate strands every comment and star anchored to the page that loses.

            The competing plan is committed here from inside `materialize-item`, i.e. after this
            planner has started but before it persists. That pins the re-check to the right side of
            the transaction: hoisting it earlier (or dropping it) fails this test. A genuinely
            two-connection version of this isn't possible in-process — a test body runs inside a
            single transaction, so a second connection cannot see the fixtures at all."
    (mt/with-temp [:model/Card metric {:type :metric :dataset_query (count-metric-query)}
                   :model/Exploration e {:name "x"}
                   :model/ExplorationThread t {:exploration_id (:id e)}]
      (let [cid    (:id metric)
            g      (mk-block! (:id t) cid "d1" "Price" "type/Number")
            ;; `original-fn`, not `@#'`: once the var has been proxied, deref'ing it returns the
            ;; proxy, and delegating to that would recur forever
            orig   (dynamic-redefs/original-fn #'query-plan/materialize-item)
            raced? (atom false)
            ;; stand in for the delivery that wins the race and commits its plan first
            winner (fn []
                     (t2/insert! :model/ExplorationQuery
                                 {:exploration_thread_id (:id t)
                                  :card_id               cid
                                  :database_id           (mt/id)
                                  :page_id               (orphan-page! (:id g) cid "d1")
                                  :dimension_id          "d1"
                                  :query_type            "default"
                                  :dataset_query         (count-metric-query)
                                  :status                "pending"
                                  :position              0}))]
        (mt/with-dynamic-fn-redefs [query-plan/materialize-item
                                    (fn [metric-by-key item]
                                      (when (compare-and-set! raced? false true)
                                        (winner))
                                      (orig metric-by-key item))]
          (query-plan/generate-query-plan! (:id t)))
        (is (= 1 (t2/count :model/ExplorationQuery :exploration_thread_id (:id t)))
            "the losing planner discards its rows instead of appending them")
        (is (= 1 (t2/count :model/ExplorationPage :exploration_block_id (:id g) :dimension_id "d1"))
            "and never reaches find-or-create-page!, so the thread's page is not duplicated")))))

(deftest gc-retains-pages-that-still-have-queries-test
  (testing "gc-orphan-pages! never deletes a page some query still points at — the page_id FK
            cascades, so deleting it would silently delete the query"
    (mt/with-temp [:model/Card metric {:type :metric :dataset_query (count-metric-query)}
                   :model/Exploration e {:name "x"}
                   :model/ExplorationThread t {:exploration_id (:id e)}]
      (let [cid     (:id metric)
            g       (mk-block! (:id t) cid "d1" "Price" "type/Number")
            page-id (orphan-page! (:id g) cid "d1")
            q-id    (t2/insert-returning-pk! :model/ExplorationQuery
                                             {:exploration_thread_id (:id t)
                                              :card_id               cid
                                              :database_id           (mt/id)
                                              :page_id               page-id
                                              :dimension_id          "d1"
                                              :dataset_query         (count-metric-query)
                                              :status                "pending"
                                              :position              0})]
        ;; an empty used set marks every page orphan; the query must still protect its page
        (#'query-plan/gc-orphan-pages! (:id t) [])
        (is (some? (t2/select-one-pk :model/ExplorationPage :id page-id)))
        (is (some? (t2/select-one-pk :model/ExplorationQuery :id q-id)))))))

(deftest reconcile-positions-pages-per-block-test
  (testing "newly-created pages are positioned by first-seen order within their block, not globally"
    (mt/with-temp [:model/Card metric {:type :metric :dataset_query (count-metric-query)}
                   :model/Exploration e {:name "x"}
                   :model/ExplorationThread t {:exploration_id (:id e)}]
      (let [cid (:id metric)
            a   (first (t2/insert-returning-instances!
                        :model/ExplorationBlock
                        {:exploration_thread_id (:id t)
                         :metrics    [{:card_id cid
                                       :dimension_mappings
                                       [{:dimension_id "d1" :table_id (mt/id :venues)
                                         :target ["field" {} (mt/id :venues :price)]}
                                        {:dimension_id "d2" :table_id (mt/id :venues)
                                         :target ["field" {} (mt/id :venues :name)]}]}]
                         :dimensions [{:dimension_id "d1" :display_name "Price" :effective_type "type/Number"}
                                      {:dimension_id "d2" :display_name "Name" :effective_type "type/Text"}]
                         :position   0}))
            b   (mk-block! (:id t) cid "d1" "Price" "type/Number")]
        (is (= :ok (query-plan/generate-query-plan! (:id t))))
        (doseq [block [a b]]
          (let [positions (t2/select-fn-vec :position :model/ExplorationPage
                                            :exploration_block_id (:id block))]
            (is (= (range (count positions)) (sort positions))
                (str "block " (:id block) " pages are numbered 0.." (dec (count positions))))))))))
