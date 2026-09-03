(ns metabase.sync.analyze.interestingness
  "Analysis sub-step that computes a canonical dimension-interestingness score for each
   field and persists it on `metabase_field.dimension_interestingness`.

   Runs after fingerprinting and classification so that scorers have both the statistical
   fingerprint and the inferred semantic type available. Scores are recomputed whenever a
   field is re-fingerprinted; there is no separate version tracking. Independently of
   fingerprint state, a per-database leftovers pass ([[score-missing-leftovers!]]) also
   attempts any active field whose persisted score is still `NULL` (initial backfill, tables
   outside the normal sync sweep, or scores null'ed to force a recompute)."
  (:require
   [metabase.interestingness.core :as interestingness]
   [metabase.sync.db :as sync.db]
   [metabase.sync.interface :as i]
   [metabase.sync.util :as sync-util]
   [metabase.usage-metadata.core :as usage-metadata]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [toucan2.realize :as t2.realize]))

(set! *warn-on-reflection* true)

(mu/defn- score-and-save!
  "Score a single field's dimension role and persist the composite score. `breakout-count` is the
   field's accumulated breakout usage (nil when usage-metadata has no rollup for it), injected so
   the sync-time score stays consistent with the daily usage rescore (both feed the usage signal
   through the same scorer) — re-fingerprinting refreshes the fingerprint-driven scorers without
   discarding the usage signal."
  [field                   :- i/FieldInstance
   breakout-count          :- [:maybe :int]
   baseline-breakout-count :- [:maybe :int]]
  (sync-util/with-error-handling (format "Error scoring interestingness for %s" (sync-util/name-for-logging field))
    (let [dim-score (interestingness/dimension-interestingness
                     (assoc field :usage {:breakout-count          breakout-count
                                          :baseline-breakout-count baseline-breakout-count}))]
      (sync.db/update-field! (u/the-id field) {:dimension_interestingness dim-score}))))

(mu/defn- fields-to-score :- [:maybe [:sequential i/FieldInstance]]
  "Return Fields in `table` with fresh fingerprints that haven't completed analysis yet."
  [table :- i/TableInstance]
  (seq (sync.db/incomplete-analysis-fields-for-table (u/the-id table) i/*latest-fingerprint-version*)))

(mu/defn score-fields!
  "Score interestingness for all qualifying Fields in `table`. `counts` is the instance-wide
  `{field-id breakout-count}` map and `baseline` its p95 — both scanned once per sync and threaded
  in (see [[score-fields-for-db!]]) so the global usage aggregate isn't re-queried per table."
  [table    :- i/TableInstance
   counts   :- [:map-of :int :int]
   baseline :- [:maybe :int]]
  (if-let [fields (fields-to-score table)]
    (do
      (log/debugf "Scoring interestingness for %d fields in %s" (count fields) (sync-util/name-for-logging table))
      (reduce (fn [stats field]
                (let [result (score-and-save! field (get counts (u/the-id field)) baseline)]
                  (if (instance? Exception result)
                    (update stats :fields-failed inc)
                    (update stats :fields-scored inc))))
              {:fields-scored 0 :fields-failed 0}
              fields))
    {:fields-scored 0 :fields-failed 0}))

(defonce ^:private failed-leftover-field-ids
  ;; Field IDs whose leftover scoring attempt failed earlier in this process. The leftovers pass
  ;; selects on `dimension_interestingness IS NULL`, so without a marker a deterministically-failing
  ;; field would be re-attempted on every sync forever. Process-local by design (no schema change,
  ;; no sentinel score leaking into product surfaces): a restart makes the field eligible again, so
  ;; transient failures still get retried eventually.
  (atom #{}))

(mu/defn- score-missing-leftovers!
  "Backup pass after the per-table sweep: any Field in `database` whose persisted
  `dimension_interestingness` is still `NULL` gets one more compute attempt. This catches Fields
  on tables that aren't in `reducible-sync-tables` plus any fields the normal pipeline missed
  (initial backfill, prior compute failure, null'ed interestingness to force a recompute).
  Independent of fingerprint state; doesn't touch `last_analyzed`. Fields whose attempt already
  failed in this process are skipped (see [[failed-leftover-field-ids]]). `counts`/`baseline` are
  the instance-wide breakout usage threaded in from [[score-fields-for-db!]], same as
  [[score-fields!]]."
  [database :- i/DatabaseInstance
   counts   :- [:map-of :int :int]
   baseline :- [:maybe :int]]
  (transduce (comp (remove #(contains? @failed-leftover-field-ids (u/the-id %)))
                   (map t2.realize/realize))
             (completing
              (fn [stats field]
                (let [result (score-and-save! field (get counts (u/the-id field)) baseline)]
                  (if (instance? Exception result)
                    (do
                      (swap! failed-leftover-field-ids conj (u/the-id field))
                      (update stats :fields-failed inc))
                    (update stats :fields-scored inc)))))
             {:fields-scored 0 :fields-failed 0}
             (sync.db/unscored-fields-for-database-reducible (u/the-id database))))

(mu/defn score-fields-for-db!
  "Score interestingness for all qualifying Fields in `database`."
  [database        :- i/DatabaseInstance
   log-progress-fn]
  (let [tables                    (sync-util/reducible-sync-tables database)
        {:keys [counts baseline]} (usage-metadata/breakout-usage)
        per-table-stats           (transduce (map (fn [table]
                                                    (let [result (score-fields! table counts baseline)]
                                                      (log-progress-fn "score-interestingness" table)
                                                      result)))
                                             (partial merge-with +)
                                             {:fields-scored 0 :fields-failed 0}
                                             tables)]
    (merge-with + per-table-stats (score-missing-leftovers! database counts baseline))))
