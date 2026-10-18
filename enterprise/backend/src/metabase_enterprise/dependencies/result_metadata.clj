(ns metabase-enterprise.dependencies.result-metadata
  "Re-derives the result metadata of the MBQL cards that depend on entities whose result columns changed, marking each
  card or measure whose columns change in turn so the change reaches its own dependents, without re-deriving or passing
  native cards, whose result metadata comes from running them."
  (:require
   [clojure.walk :as walk]
   [malli.error :as me]
   [metabase-enterprise.dependencies.db :as dependencies.db]
   [metabase-enterprise.dependencies.models.dependency :as models.dependency]
   [metabase-enterprise.dependencies.models.result-metadata-status :as deps.result-metadata-status]
   [metabase.graph.core :as graph]
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

(def ^:private max-retries 5)

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
  "Whether the stored column `stored-col` holds what a run measured for the inferred column `col`: they have types of
  the same root, and the column's source type is unchanged or unknown."
  [stored-col col]
  (and (same-root-type? (:base_type stored-col) (:base_type col))
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

(defn- mbql-dependents
  "The MBQL cards and measures that directly depend on the entity `entity-type` `entity-id`, as
  `[[entity-type entity-id]]`."
  [entity-type entity-id]
  (let [node     [entity-type entity-id]
        graph    (models.dependency/filtered-graph-dependents {:types deps.result-metadata-status/derived-types})
        nodes    (get (graph/children-of graph [node]) node)
        card-ids (into #{} (keep (fn [[node-type id]] (when (= node-type :card) id))) nodes)
        native   (set (when (seq card-ids) (dependencies.db/native-card-ids card-ids)))]
    (remove (fn [[node-type id]] (and (= node-type :card) (native id))) nodes)))

(defn- rederived-result-metadata
  "The re-derived result metadata of the MBQL `card`, inferred like a save through the Card model, or nil when what the
  queries using it see is unchanged, apart from the remapped columns a run adds and inference leaves out."
  [{query :dataset_query, stored :result_metadata, :keys [id], :as card}]
  (let [stored   (mapv normalize-column stored)
        metadata (patch-result-metadata
                  stored
                  (or (queries/infer-metadata-with-model-overrides query card)
                      (throw (ex-info "Could not infer the result metadata of the card" {:card-id id}))))]
    (when (not= (comparable-metadata (remove :remapped_from stored)) (comparable-metadata metadata))
      (when-let [error (me/humanize (mr/explain ::lib.schema.metadata/card.result-metadata metadata))]
        (throw (ex-info "Invalid re-derived result metadata" {:card-id id :error error})))
      metadata)))

(defn- store-result-metadata!
  "Store the re-derived result metadata `metadata` of `card`, updating the parameters taking values from the columns it
  drops first, as a save of the card does, unless the card's `updated_at` and stored result metadata are no longer
  `stored`, returning whether it stored it."
  [{:keys [id] :as card} stored metadata]
  (try
    (t2/with-transaction [_]
      (queries/update-parameters-using-card-result-metadata! card metadata)
      (when (zero? (dependencies.db/set-unchanged-card-result-metadata! id stored metadata))
        (throw (ex-info "The card changed since it was read" {::conflict true})))
      true)
    (catch clojure.lang.ExceptionInfo e
      (if (::conflict (ex-data e))
        false
        (throw e)))))

(defn- rederive-card!
  "Re-derive and store the result metadata of the Card with `card-id` when it is an MBQL card, returning `:changed`,
  `:unchanged`, or `:conflict` without storing it when the card changed since it was read."
  [card-id]
  (let [stored   (dependencies.db/card-stored-result-metadata card-id)
        card     (dependencies.db/card card-id)
        metadata (when (and stored card (not= :native (:query_type card)) (seq (:dataset_query card)))
                   (rederived-result-metadata card))]
    (cond
      (nil? metadata)                               :unchanged
      (store-result-metadata! card stored metadata) :changed
      :else                                         :conflict)))

(def ^:private conflict-attempts
  "How many times a card that changed while it was re-derived is re-derived again right away."
  3)

(defn- process-dependent!
  "Re-derive the MBQL card or pass on the change of the measure `entity-type` `entity-id`, marking it stale when what
  its own dependents see changed, and returning `:changed`, `:unchanged`, `:conflict` or `:failed`, logging a failure."
  [[entity-type entity-id]]
  (try
    (let [result (if (= entity-type :card)
                   (or (some #(when (not= :conflict %) %) (repeatedly conflict-attempts #(rederive-card! entity-id)))
                       :conflict)
                   :changed)]
      (when (= :changed result)
        (deps.result-metadata-status/mark-stale! {entity-type #{entity-id}}))
      result)
    (catch Exception e
      (log/warnf "Failed to re-derive the result metadata of %s %s: %s" (name entity-type) entity-id (ex-message e))
      :failed)))

(defn- process-status!
  "Re-derive the MBQL cards that directly depend on the entity of the stale `status`, then clear the status unless it
  was marked again, returning `:processed`, `:conflict` when one of those cards kept changing while it was re-derived,
  or throwing when one of them failed, leaving the status stale either way."
  [{:keys [entity_type entity_id] :as status}]
  (let [results (into #{} (map process-dependent!) (mbql-dependents entity_type entity_id))]
    (cond
      (results :failed)   (throw (ex-info "Could not re-derive the result metadata of every card depending on it"
                                          {:entity-type entity_type :entity-id entity_id}))
      (results :conflict) :conflict
      :else               (do (deps.result-metadata-status/clear-stale-if-unchanged! status)
                              :processed))))

(defn- process-status-or-record-failure!
  "Process the stale entity `status`, recording an Exception as a failure and rethrowing any other Throwable after
  recording it, returning `:conflict`, `:processed` or `:failed`."
  [status retry-delay-minutes]
  (try
    (process-status! status)
    (catch Throwable e
      (log/warnf "Failed to re-derive the result metadata of the cards depending on %s %s: %s"
                 (name (:entity_type status)) (:entity_id status) (ex-message e))
      (try
        (deps.result-metadata-status/record-failure! status max-retries retry-delay-minutes)
        (catch Exception record-e
          (log/warnf "Failed to record the failure for %s %s: %s"
                     (name (:entity_type status)) (:entity_id status) (ex-message record-e))))
      (when-not (instance? Exception e)
        (throw e))
      :failed)))

(defn update-result-metadata!
  "Process up to `batch-size` stale entities, re-deriving the result metadata of the MBQL cards depending on them,
  returning how many it took and whether any of those cards changed meanwhile, as `{:taken n :conflicts? bool}`."
  [batch-size retry-delay-minutes]
  (deps.result-metadata-status/remove-deleted!)
  (loop [remaining batch-size, conflicts #{}]
    (let [statuses (when (pos? remaining)
                     (deps.result-metadata-status/statuses-to-process remaining conflicts))]
      (if (empty? statuses)
        {:taken (- batch-size remaining) :conflicts? (boolean (seq conflicts))}
        (let [results (lib-be/with-metadata-provider-cache
                        (mapv #(process-status-or-record-failure! % retry-delay-minutes) statuses))]
          (recur (- remaining (count statuses))
                 (into conflicts
                       (keep (fn [[status result]] (when (= :conflict result) (:id status))))
                       (map vector statuses results))))))))
