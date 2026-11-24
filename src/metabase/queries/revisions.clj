(ns metabase.queries.revisions
  "What the revision spec of a Card needs beyond its columns: which changes of its result metadata a revision records."
  (:require
   [metabase.lib.core :as lib]
   [metabase.util :as u]))

(defn- model-overrides
  "The overrides that a user can set in the columns of `metadata` that `other` has too, by column name."
  [metadata other]
  (let [names (into #{} (map :name) other)
        keys* (into #{:name} (map u/->snake_case_en) (lib/model-preserved-keys false))]
    (into {}
          (comp (filter (comp names :name))
                (map (juxt :name #(select-keys % keys*))))
          metadata)))

(defn always-same?
  "Whether a column that no change of makes a revision is unchanged, which it always is."
  [_before _after]
  true)

(defn same-result-metadata?
  "Whether the result metadata of the card `before` is that of the card `after`, as far as a revision records: of a
  model it is what a user sets in it, of any other card nothing, for the product recomputes it."
  [before after]
  (let [previous (:result_metadata before)
        current  (:result_metadata after)]
    (not (and (= :model (keyword (:type after)))
              (seq previous)
              (not= (model-overrides previous current) (model-overrides current previous))))))

(defn snapshot-metadata
  "The `snapshots` of the card `rows`, a model's with its result metadata, which a user edits, any other card's without
  it."
  [rows snapshots]
  (mapv (fn [row snapshot]
          (cond-> snapshot
            (and (some? (:type row)) (not= :model (keyword (:type row)))) (dissoc :result_metadata)))
        rows
        snapshots))
