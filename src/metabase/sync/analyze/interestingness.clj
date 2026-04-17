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
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(mu/defn- score-and-save!
  "Score a single field's dimension role and persist the composite score."
  [field :- i/FieldInstance]
  (sync-util/with-error-handling (format "Error scoring interestingness for %s" (sync-util/name-for-logging field))
    (let [dim-score (:score (interestingness/score-raw-field
                             interestingness/canonical-dimension-weights
                             field))]
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

(mu/defn score-fields-for-db!
  "Score interestingness for all qualifying Fields in `database`."
  [database        :- i/DatabaseInstance
   log-progress-fn]
  (let [tables (sync-util/reducible-sync-tables database)]
    (transduce (map (fn [table]
                      (let [result (score-fields! table)]
                        (log-progress-fn "score-interestingness" table)
                        result)))
               (partial merge-with +)
               {:fields-scored 0 :fields-failed 0}
               tables)))
