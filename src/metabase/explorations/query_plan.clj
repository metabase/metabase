(ns metabase.explorations.query-plan
  "Orchestrator for the Explorations query planner.

  Concrete planners implement
  `metabase.explorations.query-plan.planner/QueryPlanner` — see that
  namespace for the contract. This orchestrator dispatches through the
  protocol, materializes the returned plan items into
  `ExplorationQuery` rows via the variant builders, persists the full
  transcript to `exploration_thread.query_plan_transcript`, and on a fatal
  failure terminally stamps the thread and replaces the AI Summary
  placeholder with a 'Planning failed' doc.

  Add a new planner by writing `metabase.explorations.query-plan.<name>`,
  defining a record that implements `QueryPlanner`, exposing a singleton
  instance, and teaching `pick-planner!` to dispatch to it."
  (:require
   [clojure.set :as set]
   [metabase.documents.prose-mirror :as prose-mirror]
   [metabase.explorations.ai-summary :as ai-summary]
   [metabase.explorations.query-plan.context :as qp.context]
   [metabase.explorations.query-plan.mechanical :as qp.mechanical]
   [metabase.explorations.query-plan.planner :as planner]
   [metabase.explorations.query-plan.variants :as qp.variants]
   [metabase.request.core :as request]
   [metabase.util.date-2 :as u.date]
   [metabase.util.log :as log]
   [toucan2.core :as t2])
  (:import
   (java.time Instant OffsetDateTime)))

(set! *warn-on-reflection* true)

;; ---------------------------------------------------------------------------
;; Planner selection
;; ---------------------------------------------------------------------------

(defn pick-planner!
  "Return the `QueryPlanner` instance to invoke — currently always the
  mechanical planner. Kept as a seam so tests can `with-redefs` it to inject
  a stub planner and so a future planner has an obvious dispatch point."
  []
  qp.mechanical/planner)

;; ---------------------------------------------------------------------------
;; Plan materialization (planner-agnostic)
;; ---------------------------------------------------------------------------

(defn- segment-for
  [metric segment-id]
  (when segment-id
    (some #(when (= segment-id (:id %)) %) (:segments metric))))

(defn- materialize-item
  "Translate one plan item into a vector of row *recipes* via the variant's
  `plan-rows` multimethod, then enrich each recipe with its localized
  `:name` via `qp.variants/plan-time-name`.

  The `:name` is computed here but may be modified later for variants that fan out
  (and note that the mechanical planner doesn't choose any of these variants)."
  [metric-by-key item]
  (let [metric    (get metric-by-key [(:block_id item) (:metric_id item)])
        appl      (get-in metric [:applicability (:dimension_id item)])
        dim       (:dim appl)
        dim-label (or (:display_name dim) (:dimension_id dim))
        item-seg  (segment-for metric (get-in item [:params :segment_id]))
        plan-ctx  {:segment item-seg :params (:params item)}]
    (mapv (fn [recipe]
            (assoc recipe :name
                   (qp.variants/plan-time-name
                    (:query_type recipe)
                    {:card      (:card metric)
                     :dim-label dim-label
                     :segment   (segment-for metric (:segment_id recipe))
                     :params    (:params recipe)})))
          (qp.variants/plan-rows (:variant item) plan-ctx))))

;; ---------------------------------------------------------------------------
;; Page reconciliation
;;
;; Each query belongs to a persisted `ExplorationPage`, which it shares with any other
;; queries that have the same block-id, card-id, dimension-id, and query-type. The page's
;; surrogate id is its identity (comments/stars anchor to it), so on a rerun — where
;; queries are deleted and recreated — we find-or-create the page from that grouping to
;; recover the same id, then GC pages whose selection was removed.
;; ---------------------------------------------------------------------------

(defn- page-key
  "The `[block-id card-id dimension-id query-type]` a query row reconciles to."
  [row]
  [(:block_id row) (:card_id row) (:dimension_id row) (:query_type row)])

(defn- find-or-create-page!
  "Return the id of the `ExplorationPage` for `k` (a [[page-key]]), creating it at
  `position` if it doesn't exist yet. An existing page keeps its id and position.

  Select-then-insert with no unique index backing it (`dimension_id` is a text column, which
  MySQL can't uniquely index): two planners in here at once would both miss and both insert. Safe
  only because [[lock-thread-for-planning!]] keeps them out — see there."
  [[block-id card-id dim-id query-type] position]
  (or (t2/select-one-pk :model/ExplorationPage
                        :exploration_block_id block-id
                        :card_id              card-id
                        :dimension_id         dim-id
                        :query_type           query-type)
      (t2/insert-returning-pk! :model/ExplorationPage
                               {:exploration_block_id block-id
                                :card_id              card-id
                                :dimension_id         dim-id
                                :query_type           query-type
                                :position             position})))

(defn- reconcile-pages!
  "Find-or-create a page per distinct [[page-key]] in `rows` (first-seen order within a
  page's block sets the `position` of newly-created pages); returns a `key -> page-id` map."
  [rows]
  (into {}
        (mapcat (fn [[_block-id ks]]
                  (map-indexed (fn [pos k] [k (find-or-create-page! k pos)]) ks)))
        (group-by first (distinct (map page-key rows)))))

(defn- pages-with-comments
  "Subset of `page-ids` that a live (not soft-deleted) exploration comment still anchors to.
  A comment stores its page's id (as a string) in `child_target_id`, so a page is
  \"commented\" when some `\"exploration\"`-targeted comment's `child_target_id` equals
  `(str page-id)`. This is a retention safety-net: such a page must survive a rerun that
  drops its selection so the comment keeps resolving."
  [page-ids]
  (if (seq page-ids)
    (let [by-str (into {} (map (juxt str identity)) page-ids)]
      (->> (t2/select-fn-set :child_target_id :model/Comment
                             :target_type     "exploration"
                             :child_target_id [:in (keys by-str)]
                             :deleted_at      nil)
           (into #{} (keep by-str))))
    #{}))

(defn- starred-pages
  "Subset of `page-ids` that are starred. A star, like a comment, anchors user intent to the
  page, so a starred page survives a rerun that drops its selection."
  [page-ids]
  (if (seq page-ids)
    ;; `(set ...)` since t2 set selectors return nil, not #{}, when nothing matches
    (set (t2/select-pks-set :model/ExplorationPage :id [:in page-ids] :starred true))
    #{}))

(defn- pages-with-queries
  "Subset of `page-ids` that some `ExplorationQuery` row still points at. The `page_id` FK
  cascades on delete, so GC'ing such a page would silently delete its queries; retaining
  them keeps [[gc-orphan-pages!]] safe even if it ever runs without queries having been
  wiped first."
  [page-ids]
  (if (seq page-ids)
    (set (t2/select-fn-set :page_id :model/ExplorationQuery :page_id [:in page-ids]))
    #{}))

(defn- gc-orphan-pages!
  "Delete pages of `thread-id`'s blocks whose selection the current plan dropped — e.g. one
  the user removed before a rerun. `used-page-ids` are the pages the current plan kept. An
  orphan survives when a live comment anchors to it or it is starred (out of the active
  selection but still user-valued), or when a query still points at it (deleting would
  cascade to the query)."
  [thread-id used-page-ids]
  (let [block-ids (t2/select-pks-vec :model/ExplorationBlock :exploration_thread_id thread-id)
        orphans   (when (seq block-ids)
                    (->> (t2/select-pks-vec :model/ExplorationPage :exploration_block_id [:in block-ids])
                         (remove (set used-page-ids))))
        retained  (set/union (pages-with-comments orphans)
                             (starred-pages orphans)
                             (pages-with-queries orphans))
        deletable (remove retained orphans)]
    (when (seq deletable)
      (t2/delete! :model/ExplorationPage :id [:in deletable]))))

(defn- lock-thread-for-planning!
  "Take a row lock on `thread-id`'s `exploration_thread` row (call inside a transaction) so at most
  one planner persists a plan for a thread at a time.

  Queue delivery is at-least-once, so a thread can reach the planner twice — a redelivery, or a
  duplicate delivery that overlaps the first. Neither the planner nor its caller can gate that alone:
  `runner/plan-thread!`'s `exists?` check only sees committed rows, and two overlapping planners have
  each seen an empty query table. So the persist step takes this lock and re-checks under it, and the
  loser discards. [[find-or-create-page!]] is what makes it load-bearing rather than merely tidy: it
  has no unique index to fall back on, so two planners would each create the thread's pages — and a
  page's id is its identity, so the duplicate strands every comment and star anchored to the loser."
  [thread-id]
  (t2/query {:select [:id]
             :from   [:exploration_thread]
             :where  [:= :id thread-id]
             :for    [:update]}))

(defn- insert-plan-rows!
  "Materialize each plan item into row recipes, reconcile each to its persisted
  `ExplorationPage`, insert them as `ExplorationQuery` rows, and GC pages left with no
  queries. Returns the number of rows inserted, or 0 when another planner got there first
  (see [[lock-thread-for-planning!]]). A rerun deletes a thread's queries first, so it still plans."
  [thread-id metric-by-key plan]
  (let [rows (vec
              (for [item   plan
                    :let   [metric (get metric-by-key [(:block_id item) (:metric_id item)])]
                    recipe (try
                             (materialize-item metric-by-key item)
                             (catch Throwable e
                               (log/warnf e "Skipping plan item that failed to materialize: %s"
                                          (pr-str item))
                               []))]
                {:exploration_thread_id thread-id
                 :block_id              (:block_id item)
                 :card_id               (:metric_id item)
                 :database_id           (:database_id (:card metric))
                 :segment_id            (:segment_id recipe)
                 :dimension_id          (:dimension_id item)
                 :query_type            (:query_type recipe)
                 :display               (:display recipe)
                 :name                  (:name recipe)
                 :params                (:params recipe)
                 :status                "pending"}))]
    ;; GC only after a plan that actually materialized rows: zero rows means every item
    ;; failed to materialize (or the plan was empty), and treating that as "every selection
    ;; was removed" would destroy page-id stability for a later retry.
    (if (empty? rows)
      0
      (t2/with-transaction [_conn]
        (lock-thread-for-planning! thread-id)
        (if (t2/exists? :model/ExplorationQuery :exploration_thread_id thread-id)
          (do
            (log/infof "Thread %d was planned by a concurrent delivery; discarding this planner's %d row(s)"
                       thread-id (count rows))
            0)
          (let [key->page (reconcile-pages! rows)
                ;; `:block_id` is only here to compute the page key; the queries reach their block
                ;; through their page now, so it isn't persisted on the query row.
                rows*     (mapv #(-> %
                                     (assoc :page_id (key->page (page-key %)))
                                     (dissoc :block_id))
                                rows)]
            (t2/insert! :model/ExplorationQuery
                        (map-indexed (fn [i r] (assoc r :position i)) rows*))
            (gc-orphan-pages! thread-id (vals key->page))
            (count rows*)))))))

;; ---------------------------------------------------------------------------
;; Failure path
;; ---------------------------------------------------------------------------

(defn- write-planning-failed-doc!
  "Replace the AI Summary placeholder with an error doc describing the
  planning failure. Best-effort: any secondary failure here is logged but
  never thrown."
  [thread-id creator-id final-errors]
  (try
    (when-let [doc (t2/select-one :model/Document
                                  :exploration_thread_id thread-id
                                  :name                  "AI Summary"
                                  :archived              false)]
      (when creator-id
        (request/with-current-user creator-id
          (t2/update! :model/Document (:id doc)
                      {:document     (ai-summary/error-doc
                                      {:phase        :query-plan
                                       :thread-id    thread-id
                                       :final-errors final-errors
                                       :detail       "Query planning failed. No queries were materialized; the exploration is empty."})
                       :content_type prose-mirror/prose-mirror-content-type}))))
    (catch Throwable e
      (log/warnf e "Failed to write Planning-failed doc for thread %d" thread-id))))

(defn- mark-thread-terminally-failed!
  "Stamp `analysis_started_at` and `completed_at` so the thread doesn't
  deadlock the AI Summary completion machinery (which waits for queries
  to finish — but there are no queries)."
  [thread-id]
  (let [now (OffsetDateTime/now)]
    (t2/update! :model/ExplorationThread thread-id
                {:analysis_started_at now
                 :completed_at        now})))

;; ---------------------------------------------------------------------------
;; Transcript persistence
;; ---------------------------------------------------------------------------

(defn- save-transcript!
  [thread-id transcript]
  (try
    (t2/update! :model/ExplorationThread thread-id
                {:query_plan_transcript transcript})
    (catch Throwable e
      (log/warnf e "Failed to save query-plan transcript for thread %d" thread-id))))

(defn- record-outcome!
  "Persist a transcript with `:outcome` (and any extra kv pairs) merged onto `pre`."
  [thread-id pre outcome & {:as extras}]
  (save-transcript! thread-id (assoc (merge pre extras) :outcome outcome)))

(defn- preamble
  "Common transcript preamble: which thread, when, with which planner."
  [thread-id planner-name]
  {:generated-at (u.date/format (Instant/now))
   :thread-id    thread-id
   :planner      planner-name})

;; ---------------------------------------------------------------------------
;; Ctx building
;; ---------------------------------------------------------------------------

(defn- thread-prompt-for
  [thread-id]
  (t2/select-one-fn :prompt :model/ExplorationThread :id thread-id))

(defn- creator-id-for-thread
  [thread-id]
  (t2/select-one-fn :creator_id :model/Exploration
                    {:join  [:exploration_thread
                             [:= :exploration_thread.exploration_id :exploration.id]]
                     :where [:= :exploration_thread.id thread-id]}))

(defn- build-planner-ctx
  "Build the planner-contract ctx the chosen planner consumes. Pure compute
  modulo the t2 selects for thread / metrics / dims."
  [thread-id]
  (let [thread-blocks  (t2/select :model/ExplorationBlock
                                  :exploration_thread_id thread-id
                                  {:order-by [[:position :asc] [:id :asc]]})
        metric-dim-ctx (qp.context/metric-and-dim-context thread-blocks)
        ;; [block-id metric-id] -> metric-context, so materialization resolves a plan
        ;; item against the same block the planner emitted it under (a metric can live
        ;; in several blocks).
        metric-by-key  (into {}
                             (for [g (:blocks metric-dim-ctx)
                                   m (:metrics g)]
                               [[(:block-id g) (:metric-id m)] m]))]
    {:thread-id      thread-id
     :thread-prompt  (thread-prompt-for thread-id)
     :metric-dim-ctx metric-dim-ctx
     :metric-by-key  metric-by-key
     :creator-id     (creator-id-for-thread thread-id)
     :thread-blocks  thread-blocks}))

;; ---------------------------------------------------------------------------
;; Public entry point — called from the worker
;; ---------------------------------------------------------------------------

(defn- run-planner!
  "Invoke the picked planner, persist rows / mark terminal as appropriate, and
  return the outcome keyword (`:ok`, `:skip-empty`, or `:failed`)."
  [{:keys [thread-id metric-by-key creator-id] :as ctx} picked planner-id pre]
  (let [{:keys [outcome plan rationale transcript final-errors]} (planner/plan! picked ctx)
        transcript-body {:outcome      outcome
                         :rationale    rationale
                         :plan         plan
                         :final-errors final-errors
                         :planner      transcript}]
    (case outcome
      :ok
      (let [n (insert-plan-rows! thread-id metric-by-key plan)]
        (record-outcome! thread-id pre :ok :rows-count n :transcript transcript-body)
        (log/infof "Query plan for thread %d (%s): inserted %d ExplorationQuery rows"
                   thread-id (name planner-id) n)
        :ok)

      :skip-not-applicable
      (do (log/infof "Query plan for thread %d (%s): planner reported nothing to do"
                     thread-id (name planner-id))
          (record-outcome! thread-id pre :skip-empty :transcript transcript-body)
          (mark-thread-terminally-failed! thread-id)
          :skip-empty)

      :failed
      (do (log/warnf "Query plan for thread %d (%s): planner failed; terminally marking thread"
                     thread-id (name planner-id))
          (record-outcome! thread-id pre :failed :transcript transcript-body)
          (write-planning-failed-doc! thread-id creator-id final-errors)
          (mark-thread-terminally-failed! thread-id)
          :failed))))

(defn generate-query-plan!
  "Build a query plan for `thread-id` and materialize ExplorationQuery rows.

  Returns one of:
    `:ok`                — plan succeeded, rows inserted, transcript written
    `:skip-empty`        — thread has no metrics or no dimensions
    `:failed`            — planner reported failure; thread terminally
                           stamped, placeholder doc replaced with error
    `nil`                — uncaught throwable (logged, transcript best-effort)"
  [thread-id]
  (try
    (let [{:keys [thread-blocks] :as ctx} (build-planner-ctx thread-id)
          picked     (pick-planner!)
          planner-id (planner/planner-name picked)
          pre        (preamble thread-id planner-id)]
      (if (not-any? #(and (seq (:metrics %)) (seq (:dimensions %))) thread-blocks)
        (do (log/infof "Thread %d: no block has both a metric and a dimension; skipping query plan" thread-id)
            (record-outcome! thread-id pre :skip-empty)
            :skip-empty)
        (run-planner! ctx picked planner-id pre)))
    (catch Throwable e
      (log/errorf e "generate-query-plan! failed for thread %d" thread-id)
      (record-outcome! thread-id (preamble thread-id :unknown) :error
                       :error (.getMessage e))
      (try
        (write-planning-failed-doc! thread-id
                                    (creator-id-for-thread thread-id)
                                    [(or (.getMessage e) (.toString e))])
        (mark-thread-terminally-failed! thread-id)
        (catch Throwable e2
          (log/warnf e2 "Secondary failure after generate-query-plan! threw for thread %d" thread-id)))
      nil)))

(defn record-terminal-planning-failure!
  "Durably record that planning for `thread-id` was given up on before it produced any rows —
  the same terminal state [[generate-query-plan!]] writes when the planner itself fails:
  transcript, planning-failed doc, and the terminal stamp that stops the client polling."
  [thread-id message]
  (when-not (t2/exists? :model/ExplorationQuery :exploration_thread_id thread-id)
    (let [message (or message "planning gave up after exhausting retries")]
      (record-outcome! thread-id (preamble thread-id :unknown) :error :error message)
      (write-planning-failed-doc! thread-id (creator-id-for-thread thread-id) [message])
      (mark-thread-terminally-failed! thread-id))))

;; ---------------------------------------------------------------------------
;; Debug helpers
;; ---------------------------------------------------------------------------

(defn debug-transcript
  "Return the persisted query-plan transcript for `thread-id`."
  [thread-id]
  (t2/select-one-fn :query_plan_transcript :model/ExplorationThread :id thread-id))
