(ns metabase.explorations.models.exploration-query-result
  (:require
   [metabase.api.common :as api]
   [metabase.explorations.composite :as composite]
   [metabase.interestingness.core :as interestingness]
   [metabase.models.interface :as mi]
   [metabase.queries.core :as queries]
   [metabase.query-permissions.core :as query-perms]
   [metabase.query-processor.core :as qp]
   [metabase.util.encryption :as encryption]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [methodical.core :as methodical]
   [toucan2.core :as t2])
  (:import
   (java.io ByteArrayInputStream)))

(set! *warn-on-reflection* true)

(methodical/defmethod t2/table-name :model/ExplorationQueryResult [_model]
  :exploration_query_result)

(doto :model/ExplorationQueryResult
  (derive :metabase/model))

(defn- chart-stats-in
  "Encode a `compute-chart-stats` result as JSON.

  [[interestingness/chart-stats->json-safe]] does the shape work, driven by the stats schema, so
  these stats keep their keywords instead of the storage format dictating the data model."
  [v]
  (cond
    (nil? v)    nil
    (string? v) v
    :else       (json/encode (interestingness/chart-stats->json-safe v))))

(defn- chart-stats-out
  "Inverse of [[chart-stats-in]]: decode the JSON, then let the schema put the keywords back.

  Recovers `nil` (with a warning) on failure rather than crashing the whole `t2/select` — a
  malformed blob must never break a read."
  [s]
  (when (string? s)
    (try
      (interestingness/json-safe->chart-stats (json/decode+kw s))
      (catch Throwable e
        (log/warn e "Failed to parse an exploration_query_result chart_stats column; returning nil")
        nil))))

(def ^:private transform-chart-stats
  "[[metabase.models.interface/transform-encrypted-json]] with a schema-aware codec in place of the
  bare JSON one. Wrapped in [[mi/decrypt-error-context]] like the columns beside it, so a decrypt
  failure names the column in the message rather than surfacing as a bare \"Expected an encrypted
  value\" with no way back to the row."
  {:in  (comp encryption/maybe-encrypt chart-stats-in)
   :out (comp chart-stats-out
              (mi/decrypt-error-context "exploration_query_result.chart_stats" encryption/maybe-decrypt))})

;; Every column here is encrypted at rest, and for one reason: each holds warehouse values, or prose
;; derived from them, produced under the creator's data-access lens. That is the same material as the
;; row blob in `stored_result.result_data`, which is encrypted too. `chart_stats` is easy to read as
;; mere shape and is not — the categorical stats carry each top category's `:name` straight from the
;; result rows (see [[metabase.interestingness.chart.categorical]]).
(t2/deftransforms :model/ExplorationQueryResult
  {:chart_stats        transform-chart-stats
   :metric_description (mi/transform-encrypted-text "exploration_query_result.metric_description")
   :chart_description  (mi/transform-encrypted-text "exploration_query_result.chart_description")})

(defn stored-results
  "Resolve the cached stored_result for an exploration_query_id via the EQR FK. Returns the
  full stored_result row (creator/db/blob/query) or nil when no result row exists yet (query
  still pending/errored)."
  [eq-id]
  (when-let [sr-id (t2/select-one-fn :stored_result_id :model/ExplorationQueryResult
                                     :exploration_query_id eq-id)]
    (t2/select-one :model/StoredResult :id sr-id)))

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
     (let [eq        (api/check-404 (t2/hydrate (t2/select-one :model/ExplorationQuery :id eq-id)
                                                :segment_name))
           eqr       (api/check-404 (t2/select-one :model/ExplorationQueryResult
                                                   :exploration_query_id eq-id))
           sr        (api/check-404 (t2/select-one :model/StoredResult :id (:stored_result_id eqr)))
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
                        (t2/select-one [:model/Card :name :description :display :visualization_settings]
                                       :id card-id))
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
                                 (first (t2/insert-returning-pks!
                                         :model/StoredResult
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
                                          :data_access_token (composite-data-access-token eq-results)})))
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
          (t2/insert! :model/StoredResultUse {:stored_result_id stored-result-id :card_id card-id})
          (when-not single?
            (doseq [{:keys [sr]} eq-results]
              (t2/insert! :model/StoredResultUse {:stored_result_id (:id sr) :card_id card-id})))
          {:card-id card-id :stored-result-id stored-result-id :primary-eq first-eq})))))
