(ns metabase-enterprise.osi-generation.core
  "The OSI metadata generation loop: select candidates, generate ai_context through the
  [[metabase-enterprise.osi-generation.generate]] seam, write back with the basis stamp, then one
  coalesced index reconcile for the whole batch.

  Gating lives in the callers (the Quartz job body and the manual API), not here:
  `osi-generation-enabled` -> [[available?]] -> `settings/configured?`.

  Locking: [[run-generation!]] itself never opens a pgvector connection, so it can never hold one of
  entity-retrieval's advisory locks (20011/20012) while wanting the other — the trailing
  `force-reconcile!` acquires them in the one direction reconcile always does, on its own connection.
  A stuck reconcile therefore stalls (extends this run; `DisallowConcurrentExecution` queues later
  firings behind it) but cannot deadlock from anything this namespace does."
  (:require
   [clojurewerkz.quartzite.jobs :as jobs]
   [java-time.api :as t]
   [metabase-enterprise.osi-generation.candidates :as candidates]
   [metabase-enterprise.osi-generation.generate :as generate]
   [metabase-enterprise.osi-generation.metrics :as metrics]
   [metabase-enterprise.osi-generation.settings :as settings]
   [metabase-enterprise.osi-generation.throttle :as throttle]
   [metabase-enterprise.semantic-search.embedding :as embedding]
   [metabase.app-db.core :as app-db]
   [metabase.entity-retrieval.core :as entity-retrieval]
   [metabase.entity-retrieval.spec :as spec]
   [metabase.premium-features.core :as premium-features]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def generation-job-key
  "Quartz `JobKey` of the weekly generation job, here (rather than in the task ns) so the manual API
  can pre-check `job-exists?` and trigger it without requiring the task ns — mirroring
  `entity-retrieval.core/sync-job-key`."
  (jobs/key "metabase-enterprise.osi-generation.generate.job"))

(defn available?
  "Whether OSI generation is licensed: `:library` and `:library-retrieval`, re-evaluated per use.
  Licenses only, deliberately not pgvector/embedder: generation writes the appdb and is useful without
  the index, and the trailing reconcile self-gates on the stricter entity-retrieval availability."
  []
  (and (premium-features/has-feature? :library)
       (premium-features/has-feature? :library-retrieval)))

(defn- interrupted-exception?
  "Whether `e` or one of its causes is an interruption. Provider adapters can wrap the original
  `InterruptedException`, so candidate isolation must walk the cause chain."
  [e]
  (boolean
   (some #(instance? InterruptedException %)
         (take 10 (take-while some? (iterate #(some-> ^Throwable % .getCause) e))))))

(defn- fatal-error
  [e]
  (some #(when (instance? Error %) %)
        (take 10 (take-while some? (iterate #(some-> ^Throwable % .getCause) e)))))

(defn- rethrow-nonordinary!
  [e]
  (cond
    (interrupted-exception? e)
    (do
      (.interrupt (Thread/currentThread))
      (throw e))

    (fatal-error e)
    (throw (fatal-error e))))

(defn- restamp!
  "Converge a tier-2 row whose diff was empty: set `basis_invalidated_at` to the `invalidated_at`
  captured at selection. Unguarded — nothing content-bearing is touched, and a racing human edit just
  leaves the row a candidate for the next run. `basis` is not rewritten: the stored and fresh values
  are equal by definition when the diff is nil."
  [{:keys [entity_type entity_local_id invalidated_at]}]
  (t2/update! :model/OsiAiContext
              {:entity_type entity_type, :entity_local_id entity_local_id}
              {:basis_invalidated_at invalidated_at}))

(defn- insert-new!
  "Insert a new generated row, returning `:generated` for this writer or `:skipped` after a race."
  [entity-type entity-local-id stamp]
  ;; The savepoint keeps a duplicate-key race from aborting an outer PostgreSQL transaction;
  ;; `with-conflict-retry` then rechecks existence once. Returning from the insert branch is an
  ;; explicit win—no timestamp round-trip comparison across database precisions.
  (app-db/with-conflict-retry
    (if (t2/exists? :model/OsiAiContext
                    :entity_type entity-type :entity_local_id entity-local-id)
      :skipped
      (do
        (t2/with-transaction [_conn]
          (t2/insert! :model/OsiAiContext (merge stamp
                                                 {:entity_type entity-type
                                                  :entity_local_id entity-local-id})))
        :generated))))

(defn- source-basis-current?
  "Whether the source entity still projects to the basis captured before the LLM call. A missing source
  is stale too. This narrows the source-versus-write race to the final appdb write itself."
  [{:keys [entity basis]}]
  (let [{:keys [entity_type entity_local_id]} entity
        fresh (some->> (spec/member-entity :osi-context entity_type entity_local_id)
                       vector
                       (spec/hydrate :osi-context)
                       first)]
    (= basis (some->> fresh (spec/entity-basis :osi-context)))))

(defn- write-generated-context!
  "Guarded upsert of one generation `result` for `candidate`. Returns `:generated` when the row was
  written, `:skipped` when a concurrent human write took the row mid-flight (the guard matched
  nothing) — the raced row stays a candidate for the next run rather than discarding the result's
  target."
  [{:keys [entity existing-context basis] :as candidate} {:keys [ai_context generator-version]}]
  (let [[entity-type entity-local-id] (entity-retrieval/entity-class
                                       (:entity_type entity) (:entity_local_id entity))
        stamp {:ai_context           ai_context
               :data_source          :metabot
               :generated_at         (t/offset-date-time)
               :basis                basis
               :basis_invalidated_at (:invalidated_at existing-context)
               :generator_version    generator-version
               :rewrite_requested_at nil}]
    (cond
      (not (source-basis-current? candidate))
      :skipped

      existing-context
      ;; `updated_at` is the selection token. It guards every intervening write, including a human
      ;; approval and a second generator, rather than merely checking the content basis.
      (if (pos? (t2/update! :model/OsiAiContext
                            {:entity_type     (:entity_type existing-context)
                             :entity_local_id (:entity_local_id existing-context)
                             :updated_at      (:updated_at existing-context)
                             :data_source     :metabot}
                            stamp))
        :generated
        :skipped)

      :else
      (insert-new! entity-type entity-local-id stamp))))

(defn- candidate-entity-type
  "The source-model keyword (`:table`, `:card`, …) for one `candidate`'s prometheus label — low
  cardinality, safe as a label. From the stored row when there is one, else the entity's own class."
  [{:keys [entity existing-context]}]
  (keyword (or (:entity_type existing-context)
               (first (entity-retrieval/entity-class (:entity_type entity) (:entity_local_id entity))))))

(defn- process-candidate
  "One loop step: restamp a converged tier-2 row, otherwise generate and write back. Records the
  candidate's terminal outcome to `metrics` and charges `tracker`, then returns `totals` with the
  outcome counted. Throws propagate to the caller's per-candidate isolation, carrying any billed usage
  in their `ex-data`; the caller charges the tracker on that path so spend is counted exactly once."
  [tracker totals {:keys [tier diff existing-context] :as candidate}]
  (let [entity-type (candidate-entity-type candidate)]
    (if (and (= 2 tier) (nil? diff))
      ;; empty diff: the entity did not change in any way the projection cares about — restamp, skip
      ;; the LLM (tier 1 goes to the generator regardless of its diff; tier 3 candidacy required one).
      (do (restamp! existing-context)
          (metrics/record-candidate! entity-type :restamped)
          (throttle/consume! tracker {:entities 1})
          (update totals :restamped inc))
      (if-let [result (generate/generate-context candidate)]
        ;; The call is billed the moment it returns: sum its usage into the run total before
        ;; write-back, and carry it on a write-back throw so a failure after a
        ;; billed call cannot lose the spend. The tracker is charged only when the candidate settles
        ;; without throwing — a throw carries the usage to the caller, which charges the tracker there.
        (let [usage  (:usage result)
              totals (update totals :usage #(merge-with + % usage))]
          (try
            (let [outcome (write-generated-context! candidate result)]
              (metrics/record-candidate! entity-type outcome)
              (throttle/consume! tracker (assoc usage :entities 1))
              (update totals outcome inc))
            (catch Exception e
              (throw (ex-info "OSI generation write-back failed" {:usage usage} e)))))
        ;; nil means skip without writing — the shipped stub's only answer until the LLM seam lands.
        (do (metrics/record-candidate! entity-type :skipped)
            (throttle/consume! tracker {:entities 1})
            (update totals :skipped inc))))))

(defn- blocked-summary
  "The no-op summary a run returns when a configured persistent window quota has already been
  spent. `:pending` is unknown because selection deliberately did not run; metrics preserve the previous
  backlog gauge rather than replacing it with a false zero."
  [window]
  {:candidates 0, :generated 0, :restamped 0, :skipped 0, :errors 0, :pending nil
   :usage {:input-tokens 0, :output-tokens 0}, :reconcile nil, :window-quota-exhausted window})

(def ^:private max-errors-per-run
  "Bound on errored candidates in one run, in addition to the entity cap. Candidate-construction errors
  happen before generation can start and do not consume an entity slot, so this budget lets selection
  move past corrupt stored rows. Once a candidate reaches processing, its attempt consumes an entity
  slot even if generation or write-back throws; billed failures cannot bypass the work/cost safeguard."
  50)

(defn run-generation!
  "Run one generation pass: ordered `candidates` (at most `limit` processable attempts, nil = unbounded), each
  isolated in its own try/catch (`:errors` counts throws, the run continues), then ONE coalesced
  reconcile iff at least one row was written — the batch's only index touch, since `osi_ai_context`
  writes have no side effects.

  Returns `{:candidates n :generated n :restamped n :skipped n :errors n :pending n
            :usage {:input-tokens n :output-tokens n} :reconcile <force-reconcile! result | nil>}`.
  `:usage` is actual spend — each candidate's usage is summed as its call returns, whether or not the
  write-back after it succeeded. `:reconcile` nil means the index wasn't touched — nothing was
  written, or entity-retrieval is unavailable (rows sit unindexed until the 15-minute backstop).
  `:pending` is total selected-but-unprocessed backlog when a run stops early, 0 otherwise.

  A per-run `tracker` holds the soft entity/token/duration budget. The entity cap bounds expensive
  per-candidate projection and LLM work, but selection still scans and hydrates the full library before
  applying the cap. `allow?` stops the loop between candidates on token or duration limits. Every
  processing attempt consumes an entity slot, including failed LLM calls and write-backs; only failures
  constructing a candidate are exempt and spend the separate [[max-errors-per-run]] budget. A persistent
  flattened rotating offset advances by the candidates examined and interleaves the tiers fairly. Write-back rechecks the source
  basis and the context-row selection token. Configured hourly/daily
  quotas are checked first and no-op a run when exhausted; they intentionally default to unset pending
  production measurements. The reported duration includes the trailing reconcile, whose embedding calls
  are labelled with the OSI source."
  ([]
   (run-generation! {}))
  ([{:keys [limit]}]
   (try
     (let [{:keys [window remaining-tokens exhausted?]} (throttle/window-budget)]
       (if exhausted?
         (do (log/info "OSI generation skipped: persistent token window quota exhausted" {:window window})
             (metrics/record-run! {:duration-ms 0, :stopped-by window} nil)
             (blocked-summary window))
         (let [budget   (cond-> (throttle/run-budget)
                          (some? remaining-tokens)
                          (update :max-tokens #(if (some? %) (min % remaining-tokens) remaining-tokens)))
               tracker  (throttle/new-tracker budget)
               ;; nil-safe min of the explicit :limit and the entity cap; nil = unbounded.
               cap      (some->> [limit (throttle/entity-cap tracker)] (remove nil?) seq (apply min))
               ;; The selection bound is the processing cap widened by the error budget — construction
               ;; errors happen before processing and do not consume cap slots, so a capped run needs
               ;; headroom to reach `cap` processable candidates behind corrupt rows — plus one sentinel: bounded basis/projection work, honest
               ;; backlog metric (a lower bound of one, not a false zero).
               select-cap (some-> cap (+ max-errors-per-run))
               offset   (max 0 (or (settings/osi-generation-candidate-offset) 0))
               selected (candidates/candidates (some-> select-cap inc) offset)
               more?    (boolean (and select-cap (> (count selected) select-cap)))
               cands    (if select-cap (vec (take select-cap selected)) selected)
               result   (reduce (fn [{:keys [totals processed attempted] :as acc} candidate]
                                  (cond
                                    ;; a token/duration/entity cap bound — stop; the rest stay
                                    ;; candidates and are counted :pending for the backlog gauge and
                                    ;; the next run.
                                    (throttle/allow? tracker)
                                    (reduced acc)

                                    ;; The caller's :limit can undercut the tracker's entity cap. Enforce
                                    ;; it against every candidate that reached processing, whether or not
                                    ;; that attempt succeeded.
                                    (and cap (>= attempted cap))
                                    (reduced acc)

                                    ;; the error budget is spent — stop rather than churn through an
                                    ;; arbitrarily long field of corrupt rows; the rest count :pending.
                                    (>= (:errors totals) max-errors-per-run)
                                    (reduced acc)

                                    :else
                                    (try
                                      (when-let [e (:candidate-error candidate)]
                                        (throw e))
                                      (-> acc
                                          (update :totals #(process-candidate tracker % candidate))
                                          (assoc :processed (inc processed))
                                          (update :attempted inc))
                                      (catch Exception e
                                        (rethrow-nonordinary! e)
                                        ;; A malformed candidate never reached generation and is exempt
                                        ;; from the entity cap. Every later failure consumes one attempt,
                                        ;; plus any provider usage it carried.
                                        (let [construction-error? (some? (:candidate-error candidate))
                                              usage              (or (:usage (ex-data e)) {})]
                                          (log/error e "OSI generation failed for candidate"
                                                     (select-keys (:entity candidate) [:entity_type :entity_local_id]))
                                          (metrics/record-candidate! (candidate-entity-type candidate) :error)
                                          (throttle/consume! tracker (cond-> usage
                                                                       (not construction-error?)
                                                                       (assoc :entities 1)))
                                          (cond-> (-> acc
                                                      (update-in [:totals :errors] inc)
                                                      (update-in [:totals :usage] #(merge-with + % usage))
                                                      (assoc :processed (inc processed)))
                                            (not construction-error?) (update :attempted inc)))))))
                                {:totals    {:generated 0
                                             :restamped 0
                                             :skipped   0
                                             :errors    0
                                             :usage     {:input-tokens 0, :output-tokens 0}}
                                 :processed 0
                                 :attempted 0}
                                cands)
               totals    (:totals result)
               ;; Advance through the single flattened tier cursor by the raw position of the last
               ;; processed candidate. This includes converged tier-3 rows filtered during selection,
               ;; so a later failing candidate cannot be replayed while the cursor catches up.
               _         (when (pos? (:processed result))
                           (let [last-processed (nth cands (dec (:processed result)))
                                 advance       (or (:cursor-advance last-processed) (:processed result))]
                             (settings/osi-generation-candidate-offset! (+ offset advance))))
               ;; the sentinel proves the entity cap, not exhaustion, ended selection — record it
               ;; against the tracker so the summary's :stopped-by reflects the true early stop.
               _         (when more? (throttle/allow? tracker))
               pending   (+ (- (count cands) (:processed result)) (if more? 1 0))
               ;; force-reconcile! is inside the deadline the summary reports; its embedding requests
               ;; carry the OSI source so their volume is separable.
               ;; TODO (Chris 2026-07-24) -- The "osi-generation" embedding-source label is best-effort: when this
               ;; reconcile coalesces onto an already-queued future, that future captured its creator's
               ;; *embedding-request-source*, so a fraction of OSI-driven embedding requests may retain the
               ;; already-queued run's source rather than "osi-generation". It's a volume metric, so
               ;; approximate attribution is acceptable;
               ;; threading source through the reconcile scheduler would make it exact.
               reconcile (when (pos? (:generated totals))
                           (binding [embedding/*embedding-request-source* settings/usage-source]
                             (entity-retrieval/force-reconcile!)))]
           (metrics/record-run! (throttle/summary tracker) pending)
           (assoc totals
                  :candidates (count cands)
                  :pending    pending
                  :reconcile  reconcile))))
     (catch Exception e
       (rethrow-nonordinary! e)
       ;; Cover quota evaluation, budget construction and selection too; failures before the old inner
       ;; try were logged by Quartz but invisible to the run-errors metric.
       (metrics/record-error! :run-failed)
       (throw e)))))
