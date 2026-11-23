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
   [metabase.analyze.core :as analyze]
   [metabase.interestingness.core :as interestingness]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.sync.analyze.table-chunks :as table-chunks]
   [metabase.sync.db :as sync.db]
   [metabase.sync.interface :as i]
   [metabase.sync.settings :as sync.settings]
   [metabase.sync.util :as sync-util]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.warehouse-schema.models.field :as field]))

(set! *warn-on-reflection* true)

(mu/defn- score
  "The dimension interestingness score of `field`, or the Exception scoring it threw, which is logged."
  [field :- i/FieldInstance]
  (sync-util/with-error-handling (format "Error scoring interestingness for %s" (sync-util/name-for-logging field))
    (interestingness/dimension-interestingness field)))

(mu/defn- score-and-save! :- [:sequential i/FieldInstance]
  "Score `fields` and write their scores in one update, returning the Fields whose scoring threw."
  [fields :- [:sequential i/FieldInstance]]
  (let [scored (mapv (juxt identity score) fields)
        rows   (into [] (keep (fn [[field s]] (when-not (instance? Exception s) {:id (:id field) :dimension_interestingness s}))) scored)]
    (when (seq rows)
      (field/update-fields! rows {:fields (vec fields)}))
    (into [] (keep (fn [[field s]] (when (instance? Exception s) field))) scored)))

(mu/defn- score-fields-of-tables! :- [:map {:closed true} [:fields-scored :int] [:fields-failed :int]]
  "Score interestingness for the Fields of `tables` with fresh fingerprints that haven't completed analysis yet, reading
  and saving them a page at a time."
  [tables :- [:sequential i/TableInstance]]
  (let [table-ids (mapv :id tables)]
    (loop [after-id 0
           stats    {:fields-scored 0 :fields-failed 0}]
      (if-let [fields (not-empty (analyze/incomplete-analysis-fields table-ids i/*latest-fingerprint-version*
                                                                     after-id table-chunks/fields-per-read))]
        (let [failed (score-and-save! fields)]
          (log/debugf "Scored interestingness for %d fields" (count fields))
          (recur (:id (last fields))
                 (-> stats
                     (update :fields-scored + (- (count fields) (count failed)))
                     (update :fields-failed + (count failed)))))
        stats))))

(mu/defn score-fields!
  "Score interestingness for all qualifying Fields in `table`."
  [table :- i/TableInstance]
  (score-fields-of-tables! [table]))

(mr/def ::leftover-stats
  "Stats the leftovers pass accumulates. `:fields-remaining` appears only when the per-sync limit truncated the run."
  [:map {:closed true}
   [:fields-scored :int]
   [:fields-failed :int]
   [:fields-remaining {:optional true} :int]])

(defonce ^:private failed-leftover-field-ids
  ;; Field IDs whose leftover scoring attempt failed earlier in this process. The leftovers pass
  ;; selects on `dimension_interestingness IS NULL`, so without a marker a deterministically-failing
  ;; field would be re-attempted on every sync forever. Process-local by design (no schema change,
  ;; no sentinel score leaking into product surfaces): a restart makes the field eligible again, so
  ;; transient failures still get retried eventually.
  (atom #{}))

(def ^:private leftovers-group-size
  "How many Fields [[score-missing-leftovers!]] holds in memory at once. This is the pass's memory bound: whole Field
  rows carry a fingerprint each, so reading the whole NULL set at once exhausts the heap on a large database (a
  release that invalidates existing scores makes that set every field in the database). Not a setting -- it protects
  memory, which nobody needs to tune."
  1000)

(mu/defn- score-group!
  "Score and persist the Fields with `field-ids`, skipping any that already failed in this process."
  [field-ids :- [:sequential {:min 1} ::lib.schema.id/field]
   stats     :- ::leftover-stats]
  (let [skipped @failed-leftover-field-ids
        fields  (into [] (remove #(contains? skipped (u/the-id %))) (sync.db/fields-for-interestingness-scoring field-ids))
        failed  (score-and-save! fields)]
    (swap! failed-leftover-field-ids into (map u/the-id) failed)
    (-> stats
        (update :fields-scored + (- (count fields) (count failed)))
        (update :fields-failed + (count failed)))))

(defn- warn-skipped-failures!
  "Say so when Fields failed scoring earlier in this process and are being skipped."
  []
  (when-let [failed (not-empty @failed-leftover-field-ids)]
    (log/warnf (str "%d field(s) have failed interestingness scoring in this process and are being skipped;"
                    " they keep no score until this process restarts.")
               (count failed))))

(mu/defn- truncated-stats :- ::leftover-stats
  "`stats` for a run the per-sync limit cut short, reporting how many Fields of `database` still have no score."
  [database :- i/DatabaseInstance
   budget   :- :int
   stats    :- ::leftover-stats]
  (let [remaining (sync.db/unscored-field-count-for-database (u/the-id database))]
    (log/warnf (str "Interestingness scoring stopped after %d fields for %s; %d still have no score and will be"
                    " attempted by the next sync. Raise interestingness-max-fields-per-sync to converge sooner.")
               budget (sync-util/name-for-logging database) remaining)
    (assoc stats :fields-remaining remaining)))

(mu/defn- score-missing-leftovers! :- ::leftover-stats
  "Backup pass after the per-table sweep: any Field in `database` whose persisted
  `dimension_interestingness` is still `NULL` gets one more compute attempt. This catches Fields
  on tables that aren't in `reducible-sync-tables` plus any fields the normal pipeline missed
  (initial backfill, prior compute failure, null'ed interestingness to force a recompute).
  Independent of fingerprint state; doesn't touch `last_analyzed`. Fields whose attempt already
  failed in this process are skipped (see [[failed-leftover-field-ids]]).

  Writes each group's scores before reading the next, so a run cut short keeps what it has already written. One run
  attempts at most [[sync.settings/interestingness-max-fields-per-sync]] Fields; whatever is left stays `NULL` and so
  is picked up by the next sync, and such a run reports `:fields-remaining`."
  [database :- i/DatabaseInstance]
  (let [database-id (u/the-id database)
        budget      (sync.settings/interestingness-max-fields-per-sync)
        stats       (loop [after-id  0
                           attempted 0
                           stats     {:fields-scored 0 :fields-failed 0}]
                      (let [room (- budget attempted)]
                        (if-not (pos? room)
                          (truncated-stats database budget stats)
                          ;; ids arrive lowest first, so the cursor moves past every id this group looked at,
                          ;; failures included -- a Field that cannot be scored costs one attempt per run rather
                          ;; than stalling the pass on itself
                          (if-let [field-ids (not-empty (sync.db/unscored-field-ids-for-database
                                                         database-id after-id (min room leftovers-group-size)))]
                            (recur (apply max field-ids)
                                   (+ attempted (count field-ids))
                                   (score-group! field-ids stats))
                            stats))))]
    (warn-skipped-failures!)
    stats))

(def ^:private LogProgressFn
  [:=> [:cat :string [:schema i/TableInstance]] :nil])

(mu/defn score-fields-for-db!
  "Score interestingness for all qualifying Fields in `database`."
  [database        :- i/DatabaseInstance
   log-progress-fn :- LogProgressFn]
  (let [per-table-stats (reduce (fn [acc tables]
                                  (let [stats (score-fields-of-tables! tables)]
                                    (run! #(log-progress-fn "score-interestingness" %) tables)
                                    (merge-with + acc stats)))
                                {:fields-scored 0 :fields-failed 0}
                                (table-chunks/chunks (sync-util/reducible-sync-tables database)))]
    (merge-with + per-table-stats (score-missing-leftovers! database))))
