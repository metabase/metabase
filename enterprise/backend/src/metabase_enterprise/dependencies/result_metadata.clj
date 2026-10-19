(ns metabase-enterprise.dependencies.result-metadata
  "Re-derives the result metadata of the MBQL cards whose version, or the version of an entity they transitively
  depend on, changed since it was last re-derived; native cards are left alone, since their result metadata comes from
  running them."
  (:require
   [clojure.walk :as walk]
   [malli.error :as me]
   [metabase-enterprise.dependencies.db :as dependencies.db]
   [metabase-enterprise.dependencies.dependency-types :as deps.dependency-types]
   [metabase-enterprise.dependencies.models.dependency :as models.dependency]
   [metabase-enterprise.dependencies.models.result-metadata-status :as models.result-metadata-status]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.queries.core :as queries]
   [metabase.types.core :as types]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli.registry :as mr]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private compared-column-keys
  "The result metadata column keys that the queries using a card as a source see."
  [:name :display_name :description :semantic_type :fk_target_field_id :id :settings :visibility_type
   :base_type :effective_type :unit :inherited_temporal_unit])

(def ^:private measured-column-keys
  "The result metadata column keys a run of the card measures, within the type that inference gets right."
  [:base_type :effective_type :database_type :fingerprint])

(defn- normalize-column
  "The result metadata column `col` with its unqualified keys in snake_case."
  [col]
  (update-keys col #(cond-> % (not (qualified-keyword? %)) u/->snake_case_en)))

(defn- comparable-metadata
  "The [[compared-column-keys]] of the result metadata `cols` with a value, with keyword values as strings."
  [cols]
  (mapv (fn [col]
          (into {}
                (keep (fn [k]
                        (when-some [v (get col k)]
                          [k (walk/postwalk #(cond-> % (keyword? %) u/qualified-name) v)])))
                compared-column-keys))
        cols))

(defn- same-root-type?
  "Whether the types `x` and `y` share an ancestor below `:type/*`, like integers and decimals do."
  [x y]
  (and x y (not= :type/* (types/most-specific-common-ancestor (keyword x) (keyword y)))))

(defn- measured-by-a-run?
  "Whether the stored column `stored-col` holds what a run measured for the inferred column `col`: a run stored its
  source type, they have types of the same root, and the column's source type is unchanged or unknown."
  [stored-col col]
  (and (some? (:database_type stored-col))
       (same-root-type? (:base_type stored-col) (:base_type col))
       (or (nil? (:database_type col))
           (= (:database_type col) (:database_type stored-col)))))

(defn- patch-result-metadata
  "The inferred result metadata `inferred`, each column keeping the [[measured-column-keys]] of the stored column of
  `stored` it stands for when a run measured them."
  [stored inferred]
  (mapv (fn [col stored-col]
          (cond-> col
            (and stored-col (measured-by-a-run? stored-col col))
            (merge (select-keys stored-col measured-column-keys))))
        inferred
        (lib/match-stored-columns stored inferred)))

(defn- rederived-result-metadata
  "The re-derived result metadata of the MBQL `card`, inferred like a save through the Card model, or nil when what the
  queries using it see is unchanged."
  [{query :dataset_query, stored :result_metadata, :keys [id], :as card}]
  (let [stored   (mapv normalize-column stored)
        metadata (patch-result-metadata
                  stored
                  (or (queries/infer-metadata-with-model-overrides query card)
                      (throw (ex-info "Could not infer the result metadata of the card" {:card-id id}))))]
    (when (not= (comparable-metadata stored) (comparable-metadata metadata))
      (when-let [error (me/humanize (mr/explain ::lib.schema.metadata/card.result-metadata metadata))]
        (throw (ex-info "Invalid re-derived result metadata" {:card-id id :error error})))
      metadata)))

(defn- store-result-metadata!
  "Store the re-derived result metadata `metadata` of the Card with `card-id` through the Card model, whose hooks update
  the parameters taking values from the columns it drops, unless its version changed since `version` was read, which
  has it re-derived again later."
  [card-id version metadata]
  (when (= version (dependencies.db/locked-card-version card-id))
    (dependencies.db/update-card-result-metadata! card-id metadata)))

(defn- rederived-card-metadata
  "The re-derived result metadata of the Card with `card-id`, or nil when it is native, unchanged or gone, logging a
  failure."
  [card-id]
  (try
    (lib-be/with-metadata-provider-cache
      (when-let [card (dependencies.db/card card-id)]
        (when (and (not= :native (:query_type card)) (seq (:dataset_query card)))
          (rederived-result-metadata card))))
    (catch Exception e
      (log/warnf "Failed to re-derive the result metadata of card %s: %s" card-id (ex-message e))
      nil)))

(defn- pending-entities
  "Up to `batch-size` entities whose ResultMetadataStatus is missing or records another version, as
  `[entity-type {:id :version}]` pairs: cards, and the other entities some entity depends on."
  [batch-size]
  (reduce (fn [pending entity-type]
            (let [remaining (- batch-size (count pending))]
              (if (pos? remaining)
                (into pending
                      (map (partial vector entity-type))
                      (dependencies.db/result-metadata-pending-entities
                       entity-type remaining models.result-metadata-status/current-result-metadata-version
                       models.dependency/current-dependency-analysis-version))
                (reduced pending))))
          []
          (sort deps.dependency-types/dependency-types)))

(defn- remove-deleted-statuses!
  "Delete the ResultMetadataStatuses of up to `batch-size` deleted entities of each type, returning how many it
  deleted."
  [batch-size]
  (reduce + (for [entity-type (sort deps.dependency-types/dependency-types)
                  :let        [ids (dependencies.db/result-metadata-deleted-entity-ids entity-type batch-size)]]
              (if (seq ids)
                (dependencies.db/delete-result-metadata-statuses! entity-type ids)
                0))))

(defn update-result-metadata!
  "Process up to `batch-size` entities whose ResultMetadataStatus is missing or records another version or none: clear
  the versions of the transitive dependents of those that changed, so they are processed in turn, then re-derive the
  MBQL cards among them, storing each with its version in one transaction, and record the version of the others,
  returning how many it took."
  [batch-size]
  (let [removed (remove-deleted-statuses! batch-size)
        pending (pending-entities batch-size)]
    (when (seq pending)
      (dependencies.db/clear-result-metadata-versions!
       (models.dependency/transitive-dependents (u/group-by first second (filter (comp :changed second) pending)))))
    (doseq [[entity-type {:keys [id version]}] pending
            :let                               [metadata (when (= :card entity-type)
                                                           (rederived-card-metadata id))]]
      (t2/with-transaction [_]
        (when metadata
          (store-result-metadata! id version metadata))
        (dependencies.db/upsert-result-metadata-status!
         entity-type id models.result-metadata-status/current-result-metadata-version version)))
    (+ removed (count pending))))
