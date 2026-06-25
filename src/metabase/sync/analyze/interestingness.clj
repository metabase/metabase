(ns metabase.sync.analyze.interestingness
  "Analysis sub-step that computes a canonical dimension-interestingness score for each
   field and persists it on `metabase_field.dimension_interestingness`.

   Runs after fingerprinting and classification so that scorers have both the statistical
   fingerprint and the inferred semantic type available. Scores are recomputed whenever a
   field is re-fingerprinted; there is no separate version tracking."
  (:require
   [metabase.interestingness.core :as interestingness]
   [metabase.sync.analyze.fingerprint :as sync.fingerprint]
   [metabase.sync.interface :as i]
   [metabase.sync.util :as sync-util]
   [metabase.usage-metadata.core :as usage-metadata]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2]))

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
      (t2/update! :model/Field (u/the-id field)
                  {:dimension_interestingness dim-score}))))

(mu/defn- fields-to-score :- [:maybe [:sequential i/FieldInstance]]
  "Return Fields in `table` with fresh fingerprints that haven't completed analysis yet."
  [table :- i/TableInstance]
  (seq (apply t2/select :model/Field
              :table_id (u/the-id table)
              :active true
              :visibility_type [:not-in ["sensitive" "retired"]]
              (reduce concat [] (sync.fingerprint/incomplete-analysis-kvs)))))

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

(mu/defn score-fields-for-db!
  "Score interestingness for all qualifying Fields in `database`."
  [database        :- i/DatabaseInstance
   log-progress-fn]
  (let [tables                    (sync-util/reducible-sync-tables database)
        {:keys [counts baseline]} (usage-metadata/breakout-usage)]
    (transduce (map (fn [table]
                      (let [result (score-fields! table counts baseline)]
                        (log-progress-fn "score-interestingness" table)
                        result)))
               (partial merge-with +)
               {:fields-scored 0 :fields-failed 0}
               tables)))
