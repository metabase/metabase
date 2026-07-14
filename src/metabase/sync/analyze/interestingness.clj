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
   [metabase.sync.analyze.fingerprint :as sync.fingerprint]
   [metabase.sync.interface :as i]
   [metabase.sync.util :as sync-util]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2]
   [toucan2.realize :as t2.realize]))

(set! *warn-on-reflection* true)

(mu/defn- score-and-save!
  "Score a single field's dimension role and persist the composite score."
  [field :- i/FieldInstance]
  (sync-util/with-error-handling (format "Error scoring interestingness for %s" (sync-util/name-for-logging field))
    (let [dim-score (interestingness/dimension-interestingness field)]
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
  "Score interestingness for all qualifying Fields in `table`."
  [table :- i/TableInstance]
  (if-let [fields (fields-to-score table)]
    (do
      (log/debugf "Scoring interestingness for %d fields in %s" (count fields) (sync-util/name-for-logging table))
      (reduce (fn [stats field]
                (let [result (score-and-save! field)]
                  (if (instance? Exception result)
                    (update stats :fields-failed inc)
                    (update stats :fields-scored inc))))
              {:fields-scored 0 :fields-failed 0}
              fields))
    {:fields-scored 0 :fields-failed 0}))


(mu/defn- score-missing-leftovers!
  "Backup pass after the per-table sweep: any Field in `database` whose persisted
  `dimension_interestingness` is still `NULL` gets one more compute attempt. This catches Fields
  on tables that aren't in `reducible-sync-tables` plus any fields the normal pipeline missed
  (initial backfill, prior compute failure, null'ed interestingness to force a recompute).
  Independent of fingerprint state; doesn't touch `last_analyzed`."
  [database :- i/DatabaseInstance]
  (transduce (map t2.realize/realize)
             (completing
              (fn [stats field]
                (let [result (score-and-save! field)]
                  (if (instance? Exception result)
                    (update stats :fields-failed inc)
                    (update stats :fields-scored inc)))))
             {:fields-scored 0 :fields-failed 0}
             (t2/reducible-select :model/Field
                                  {:where [:and
                                           [:= :active true]
                                           [:= :dimension_interestingness nil]
                                           [:not-in :visibility_type ["sensitive" "retired"]]
                                           [:in :table_id {:select [:id]
                                                           :from   [(t2/table-name :model/Table)]
                                                           :where  [:= :db_id (u/the-id database)]}]]})))

(mu/defn score-fields-for-db!
  "Score interestingness for all qualifying Fields in `database`."
  [database        :- i/DatabaseInstance
   log-progress-fn]
  (let [tables (sync-util/reducible-sync-tables database)
        per-table-stats (transduce (map (fn [table]
                                          (let [result (score-fields! table)]
                                            (log-progress-fn "score-interestingness" table)
                                            result)))
                                   (partial merge-with +)
                                   {:fields-scored 0 :fields-failed 0}
                                   tables)]
    (merge-with + per-table-stats (score-missing-leftovers! database))))
