(ns metabase.explorations.write
  "The full write of an Exploration with its threads, blocks, timelines and Summary Document, and of the cards embedded
  in the Summary, as the REST endpoints make it."
  (:require
   [clojure.string :as str]
   [java-time.api :as t]
   [metabase.api.common :as api]
   [metabase.documents.core :as documents]
   [metabase.explorations.composite :as composite]
   [metabase.explorations.db :as explorations.db]
   [metabase.explorations.derived-perms :as derived-perms]
   [metabase.explorations.query-plan.context :as qp.context]
   [metabase.explorations.queues :as explorations.queues]
   [metabase.lib-be.core :as lib-be]
   [metabase.permissions.core :as perms]
   [metabase.queries.core :as queries]
   [metabase.query-permissions.core :as query-perms]
   [metabase.query-processor.core :as qp]
   [metabase.request.core :as request]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [toucan2.core :as t2])
  (:import
   (java.io ByteArrayInputStream)))

(set! *warn-on-reflection* true)

(def ^:private summary-document-name
  "Name for the auto-created Summary document on each exploration."
  "Summary")

(defn- insert-summary-document!
  "Insert the auto-created Summary document for a newly created exploration. Explore-further
  must not call this — there is one Summary per exploration."
  [exploration-id coll-id]
  (explorations.db/insert-document!
   {:name            summary-document-name
    :document        {:type "doc" :content []}
    :content_type    documents/prose-mirror-content-type
    :creator_id      api/*current-user-id*
    :collection_id   coll-id
    :exploration_id  exploration-id
    :is_placeholder  true}))

(defn- positional-rows
  "Stamp `:exploration_thread_id` and a 0-based `:position` onto each row in `rows`."
  [thread-id rows]
  (map-indexed (fn [i row]
                 (assoc row :exploration_thread_id thread-id :position i))
               rows))

(defn- insert-blocks!
  "Persist the FE's Research-plan blocks — one `ExplorationBlock` row per block, in payload
   order. Dimension snapshots and mapping objects arrive already converted to the internal
   kebab-case shape (the request schemas carry the `:decode/api` rules `defendpoint` applies).
   Each block keeps its own `:metrics`/`:dimensions` selection; the planners cross metrics with
   dimensions only within a block. No dedup across blocks: a metric or dimension appearing
   in two blocks is stored on both."
  [thread-id blocks]
  (when (seq blocks)
    (explorations.db/insert-blocks! (positional-rows thread-id
                                                     (map #(select-keys % [:metrics :dimensions]) blocks)))))

(defn- insert-thread-timelines!
  "Attach `timeline-ids` to the thread, in payload order. Deduped (`distinct`, keeping first
   occurrence) — a repeated id would otherwise violate the table's unique
   `(exploration_thread_id, timeline_id)` constraint and 500 the create."
  [thread-id timeline-ids]
  (when (seq timeline-ids)
    (explorations.db/insert-thread-timelines! (positional-rows thread-id
                                                               (map (fn [tl-id] {:timeline_id tl-id}) (distinct timeline-ids))))))

(defn- reset-thread-for-rerun!
  "CAS-reset a *terminal* thread (`completed_at` set — natural completion, terminal failure, or
  cancel) back to the freshly-started state a new plan run expects: `started_at` set, every other
  lifecycle timestamp NULL, and zero `exploration_query` rows. On success it enqueues a fresh
  planning message (`explorations.queues/start-thread!`) inside the same transaction, so planning
  re-runs iff the reset committed. Returns true when the reset applied; false when the guarded
  UPDATE matched no row.

  `completed_at IS NOT NULL` keeps a thread that is still working from being restarted under itself."
  [thread-id]
  (t2/with-transaction [_conn]
    (when (pos? (explorations.db/reset-terminal-thread! thread-id (t/offset-date-time)))
      (explorations.db/delete-queries-for-thread! thread-id)
      ;; Enqueue planning inside the reset transaction so the plan message publishes iff the reset
      ;; commits (:queue/exploration-plan is :transactional :require).
      (explorations.queues/start-thread! thread-id)
      true)))

(defn- stringify-dim-types
  "Prepare a block's `:dimensions` for re-insertion. The model's read transform keywordizes
  `:effective-type`/`:semantic-type` (e.g. `:type/Date`); the JSON write transform would
  otherwise drop the namespace on a bare keyword, so stringify them first."
  [dimensions]
  (mapv (fn [dim]
          (cond-> dim
            (keyword? (:effective-type dim)) (update :effective-type u/qualified-name)
            (keyword? (:semantic-type dim))  (update :semantic-type u/qualified-name)))
        dimensions))

(defn- format-explore-filter-for-thread-name
  "Format one explore filter for a thread name. `:display_value` is FE-authored and is the
  sole source of truth for the value label."
  [{:keys [dimension_name display_value]}]
  (if dimension_name
    (str dimension_name ": " display_value)
    display_value))

(defn- explore-further-thread-name
  "Build the sidebar name for an \"Explore further\" thread from enriched `explore_filters`.
  Top-level follow-ups (drilled from the initial investigation) prefix the metric name;
  nested follow-ups use only the formatted filters."
  [card-name enriched-filters top-level-follow-up?]
  (let [formatted (->> enriched-filters
                       (map format-explore-filter-for-thread-name)
                       (str/join ", ")
                       not-empty)]
    (cond
      (and top-level-follow-up? formatted card-name)
      (str card-name " → " formatted)

      formatted
      formatted

      :else
      card-name)))

(defn- drill-thread-stamp
  "The lens stamp for the thread `explore-further` creates. Its `:resolved_source_ids` is the union of the block's
  metric cards', so the gate holds a viewer to every table the token was computed over.

  The token is computed under the *creator's* identity rather than the caller's. The values this thread is named
  for were read out of results the creator's lens produced, and its queries will execute under that
  same identity (see [[metabase.explorations.runner]]), which is the lens `finalize-row!` stamps them
  with."
  [exploration cards]
  (let [resolved-source-ids (query-perms/merge-resolved-source-ids
                             (map #(query-perms/query->resolved-source-ids (:dataset_query %)) cards))]
    {:data_access_token   (request/with-current-user (:creator_id exploration)
                            (perms/data-access-token
                             {:database-id (:database_id (first cards))
                              :table-ids   (:table-ids resolved-source-ids)}))
     ;; The content gate checks the thread against the first card's query.
     :resolved_source_ids (query-perms/stamped-resolved-source-ids (:dataset_query (first cards))
                                                                   resolved-source-ids)}))

(defn- deserialize-stored-result
  "Inverse of [[qp/do-with-serialization]] for a stored_result's
  single-frame nippy+gzip blob. Returns nil for missing/unreadable bytes."
  [^bytes result-bytes]
  (when result-bytes
    (with-open [is (ByteArrayInputStream. result-bytes)]
      (qp/with-reducible-deserialized-results [[qp-result _] is]
        qp-result))))

(defn- serialize-qp-result
  "Run `qp/do-with-serialization` on a single in-memory qp-result and return the
  gzipped+nippy byte array. The qp-result here comes from `composite/combine`, which
  builds on top of already-deserialised source snapshots — the `prepare-for-serialization`
  step the task runner does on a fresh QP result isn't needed (no metadata-provider atoms
  to strip), since whatever was strippable was already stripped at write time."
  ^bytes [qp-result]
  (qp/do-with-serialization
   (fn [in result-fn]
     (in qp-result)
     (result-fn))))

(defn- load-eq-results
  "For each `eq-id`, resolve the `{:eq … :eqr … :sr … :qp-result …}` map. Asserts the EQ
  exists and its stored_result_id is set + the snapshot bytes deserialise. Order is
  preserved from `eq-ids` — that ordering drives the composite snapshot row order."
  [eq-ids]
  (mapv
   (fn [eq-id]
     (let [eq        (api/check-404 (t2/hydrate (explorations.db/query eq-id) :segment_name))
           eqr       (api/check-404 (explorations.db/query-result eq-id))
           sr        (api/check-404 (explorations.db/stored-result (:stored_result_id eqr)))
           qp-result (api/check-404 (deserialize-stored-result (:result_data sr)))]
       {:eq eq :eqr eqr :sr sr :qp-result qp-result}))
   eq-ids))

(defn- composite-data-access-token
  "The lens stamp for a composite snapshot built from `eq-results`.

  A `stored_result`'s `data_access_token` records the sandbox / impersonation / routing lens its
  rows were computed under, and the read gate denies any non-superuser whose own lens differs.

  Only one token can describe the row, so every source has to agree on it. A blend of two
  different lenses has no single honest stamp: whichever one was picked, half the rows would be
  served under a lens they were not computed under. Refuse instead of persisting a snapshot the
  gate cannot adjudicate."
  [eq-results]
  (let [tokens (into #{} (map (comp :data_access_token :sr)) eq-results)]
    (when (contains? tokens nil)
      (throw (ex-info (tru "Cannot combine these results: a source result has no recorded data-access context.")
                      {:status-code 400})))
    (when (> (count tokens) 1)
      (throw (ex-info (tru "Cannot combine these results: they were computed under different data-access contexts.")
                      {:status-code 400})))
    (first tokens)))

(defn- composite-resolved-source-ids
  "The union of every source's resolved source ids, stamped from `dataset-query`, the query the composite row carries.
  A source with no verified stamp is resolved live."
  [dataset-query eq-results]
  (query-perms/stamped-resolved-source-ids
   dataset-query
   (query-perms/merge-resolved-source-ids
    (map (fn [{:keys [sr]}]
           (query-perms/query->resolved-source-ids (:dataset_query sr) (:resolved_source_ids sr)))
         eq-results))))

(defn create-ephemeral-card-for-exploration-queries!
  "Materialize an ephemeral `report_card` that represents a *composite chart* — possibly
  built from multiple `ExplorationQuery` snapshots combined into one — for a single document
  embed.

  - `eq-ids`         Non-empty seq of `ExplorationQuery` ids; their stored_result snapshots
                     are combined by `metabase.explorations.composite/combine` into one
                     composite qp-result. The first id supplies metadata fallbacks (source
                     card, dataset_query). A multi-id combine is persisted as a brand-new
                     `stored_result` row; a single id reuses the source snapshot as-is (no
                     duplicate row).
  - `document-id`    Target document — the materialized card is scoped to it (`document_id`
                     set + `collection_id` matched), which keeps it out of the regular
                     collection-browser / data-picker pickers.
  - `collection-id`  The document's collection (cards inherit perms).
  - `creator`        Current user.
  - opts             `:display` / `:visualization-settings` — required FE-computed values from
                     `buildSeries` / `getDisplay`, baked onto the card verbatim.

  For a multi-id combine, inserts a `StoredResultUse` row for the new composite snapshot plus
  one per source stored_result, so GC of any source cascades through and the read gate can
  compare the viewer against every source.
  For a single id, inserts the one row tying the card to the (reused) source snapshot.

  Returns a map `{:card-id … :stored-result-id … :primary-eq …}` — `stored-result-id` is the
  new composite row for a combine, or the source snapshot id for a single-query embed;
  `primary-eq` is the first source `ExplorationQuery` (hydrated `:segment_name`), handed back so
  callers can build the chart deep link without re-fetching it."
  [eq-ids document-id collection-id creator
   {:keys [display visualization-settings]}]
  (let [eq-ids        (distinct eq-ids)
        eq-results    (load-eq-results eq-ids)
        first-eq      (:eq (first eq-results))
        first-sr      (:sr (first eq-results))
        src-card      (when-let [card-id (:card_id first-eq)]
                        (explorations.db/card-presentation card-id))
        composite-qp  (composite/combine eq-results (or visualization-settings {}))
        dataset-query (:dataset_query first-eq)
        creator-id    (:id creator)]
    (doseq [dq (distinct (map (fn [{:keys [eq sr]}]
                                (or (:dataset_query eq) (:dataset_query sr)))
                              eq-results))]
      (query-perms/check-run-permissions-for-query dq))
    ;; Single-query embeds reuse the source snapshot as-is — `composite/combine` returned it
    ;; unchanged, so copying its bytes into a fresh stored_result would just duplicate them.
    ;; Only a genuine multi-snapshot combine produces new cols/rows that need their own row.
    (let [single?         (= 1 (count eq-results))
          composite-bytes (when-not single? (serialize-qp-result composite-qp))]
      (t2/with-transaction [_conn]
        (let [stored-result-id (if single?
                                 (:id first-sr)
                                 (explorations.db/insert-stored-result!
                                  {:result_data   composite-bytes
                                   :creator_id    creator-id
                                   :database_id   (or (:database_id first-sr)
                                                      (-> dataset-query :database))
                                   :dataset_query dataset-query
                                   ;; `composite/combine` refreshed :row_count to the
                                   ;; combined row set's size.
                                   :row_count     (:row_count composite-qp)
                                   ;; Without this the read gate denies the composite to
                                   ;; every non-superuser. See [[composite-data-access-token]].
                                   :data_access_token (composite-data-access-token eq-results)
                                   :resolved_source_ids (composite-resolved-source-ids dataset-query eq-results)}))
              card-id          (:id (queries/create-card!
                                     {:name                   (or (not-empty (:name first-eq))
                                                                  (not-empty (:name src-card))
                                                                  (tru "Chart"))
                                      :description            (:description src-card)
                                      :type                   :question
                                      :dashboard_id           nil
                                      :dataset_query          dataset-query
                                      :display                display
                                      :visualization_settings visualization-settings
                                      :document_id            document-id
                                      :collection_id          collection-id}
                                     creator))]
          ;; Record the (card -> stored_result) refs for lifecycle/GC tracking. For a combine we
          ;; reference the new composite snapshot plus every source, so a delete of any source
          ;; cascades; for a single-query embed the snapshot *is* the source, so one row covers it.
          (explorations.db/insert-stored-result-use! {:stored_result_id stored-result-id :card_id card-id})
          (when-not single?
            (doseq [{:keys [sr]} eq-results]
              (explorations.db/insert-stored-result-use! {:stored_result_id (:id sr) :card_id card-id})))
          {:card-id card-id :stored-result-id stored-result-id :primary-eq first-eq})))))

(defn create-exploration!
  "Create an Exploration with its first started thread, its blocks and timelines and its Summary Document, which the
  caller create-checked, and return it; every card and timeline the blocks reference must be readable."
  [{:keys [name description prompt collection_id blocks timeline_ids]}]
  (let [card-ids     (vec (distinct (mapcat #(map :card_id (:metrics %)) blocks)))
        timeline-ids (vec (distinct timeline_ids))
        id->card     (u/index-by :id (t2/hydrate (explorations.db/cards-by-ids (remove nil? card-ids)) :can_read))
        id->timeline (u/index-by :id (t2/hydrate (explorations.db/timelines (set timeline-ids)) :can_read))]
    (doseq [card-id card-ids]
      (api/read-check (get id->card card-id)))
    (doseq [timeline-id timeline-ids]
      (api/read-check (get id->timeline timeline-id))))
  (t2/with-transaction [_]
    (let [exploration (explorations.db/insert-exploration! {:name          name
                                                            :description   description
                                                            :collection_id collection_id
                                                            :creator_id    api/*current-user-id*})
          thread      (explorations.db/insert-thread! {:exploration_id (:id exploration)
                                                       :prompt         prompt
                                                       :position       0
                                                       :started_at     (t/offset-date-time)})
          tid         (:id thread)]
      (insert-blocks! tid blocks)
      (insert-thread-timelines! tid timeline_ids)
      (insert-summary-document! (:id exploration) collection_id)
      (explorations.queues/start-thread! tid)
      (explorations.db/exploration (:id exploration)))))

(defn explore-further!
  "Create the thread that drills the page `page_id` of `exploration`, which the caller write-checked, by `explore_filters`,
  and return the exploration."
  [exploration {:keys [page_id explore_filters]}]
  (let [id            (:id exploration)
        page          (api/check-404 (explorations.db/page page_id))
        block         (api/check-404 (explorations.db/block (:exploration_block_id page)))
        src-thread-id (:exploration_thread_id block)
        src-thread    (explorations.db/thread src-thread-id)
        ;; The clicked page must live in *this* exploration — a page keys off a block off a
        ;; thread off an exploration, and "Explore further" only ever drills a chart the caller
        ;; is already viewing here. Reject anything else with a 404: without this check a caller
        ;; could copy any page in the instance (metric selections, dimension snapshots, card ids,
        ;; and the queries the planner then runs) into an exploration they can write (IDOR).
        _             (api/check-404 (explorations.db/thread-in-exploration? src-thread-id id))
        _             (api/check-403
                       (contains? (derived-perms/thread-ids-with-visible-derived-data [src-thread-id])
                                  src-thread-id))
        metric-selections (:metrics block)
        metric-selection  (first metric-selections)
        id->card      (u/index-by :id (t2/hydrate (explorations.db/cards-by-ids (into [] (comp (keep :card_id) (distinct)) metric-selections))
                                                  :can_read))
        cards         (mapv (fn [{:keys [card_id]}]
                              (api/read-check
                               (api/check-404 (when card_id (get id->card card_id)))))
                            metric-selections)
        card          (api/check-404 (first cards))
        card-name     (:name card)
        mp            (lib-be/application-database-metadata-provider (:database_id card))
        enriched-filters (qp.context/enrich-explore-filters mp card block metric-selection explore_filters)
        top-level-follow-up? (nil? (:source_page_id src-thread))
        ;; Append, don't overwrite: a source block that itself came from a prior drill already
        ;; carries `:explore_filters`; `into` keeps that earlier segment scope and adds this one.
        metrics'      (mapv #(update % :explore_filters (fnil into []) enriched-filters)
                            (:metrics block))
        timeline-ids  (explorations.db/thread-timeline-ids src-thread-id)
        next-position (inc (or (explorations.db/last-thread-position id) 0))]
    (t2/with-transaction [_]
      (let [thread (explorations.db/insert-thread!
                    (merge {:exploration_id id
                            :name           (explore-further-thread-name card-name
                                                                         enriched-filters
                                                                         top-level-follow-up?)
                            :position       next-position
                            ;; drill lineage — lets the sidebar nest this thread
                            ;; under the one owning the drilled page
                            :source_page_id page_id}
                           (drill-thread-stamp exploration cards)))
            tid    (:id thread)]
        (explorations.db/insert-blocks! {:exploration_thread_id tid
                                         :metrics               metrics'
                                         :dimensions            (stringify-dim-types (:dimensions block))
                                         :position              0})
        (insert-thread-timelines! tid timeline-ids)
        ;; Stamp `started_at` last — it's the signal the planning worker claims on.
        (explorations.db/update-thread! tid {:started_at (t/offset-date-time)})
        (explorations.queues/start-thread! tid)
        (explorations.db/exploration id)))))

(defn restart-thread!
  "Restart the terminal thread with `thread-id`, or throw a 409 while it is still running."
  [thread-id]
  (when-not (reset-thread-for-rerun! thread-id)
    (throw (ex-info (tru "Exploration is still running; cancel it before restarting.")
                    {:status-code 409}))))

(defn cancel-thread!
  "Cancel the thread with `thread-id` and its pending queries, a no-op for a thread that is already terminal, selecting
  the pending queries before updating them since MySQL rejects updating a table a subquery of the same statement reads."
  [thread-id]
  (let [now (t/offset-date-time)]
    (t2/with-transaction [_conn]
      (explorations.db/cancel-thread! thread-id now)
      (let [pending-ids (explorations.db/lock-pending-query-ids-for-thread thread-id)]
        (when (seq pending-ids)
          (explorations.db/cancel-queries! pending-ids))))))
