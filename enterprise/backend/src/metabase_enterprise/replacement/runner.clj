(ns metabase-enterprise.replacement.runner
  (:require
   [clojure.string :as str]
   [medley.core :as m]
   [metabase-enterprise.replacement.field-refs :as replacement.field-refs]
   [metabase-enterprise.replacement.protocols :as replacement.protocols]
   [metabase-enterprise.replacement.source-swap :as replacement.source-swap]
   [metabase-enterprise.replacement.usages :as replacement.usages]
   [metabase-enterprise.replacement.util :as replacement.util]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.model-persistence.core :as model-persistence]
   [metabase.source-swap.util :as source-swap.util]
   [metabase.transforms.core :as transforms]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.warehouse-schema.models.field-user-settings :as field-user-settings]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def noop-progress
  "No-op progress tracker for REPL / non-async usage."
  (reify replacement.protocols/IRunnerProgress
    (set-total! [_ _total])
    (advance! [_])
    (advance! [_ _n])
    (canceled? [_] false)
    (start-run! [_])
    (succeed-run! [_])
    (fail-run! [_ _throwable])))

(defn bulk-load-metadata-for-entities!
  "Bulk load metadata for a batch of entities into the metadata provider cache.

  Fetches all card dataset queries in one query, converts them to lib queries, extracts all referenced entity IDs, and
  bulk loads all metadata. Entities are tuples from the dependency graph."
  [metadata-provider entities]
  (when-not (lib.metadata.protocols/cached-metadata-provider-with-cache? metadata-provider)
    (throw (ex-info "Must provided a cached metadata provider" {})))
  (letfn [(id->instances [m]
            (let [ids (into []
                            (comp (filter #(= m (first %)))
                                  (map second))
                            entities)]
              (when (seq ids)
                (into {}
                      (map (juxt (fn [o] [m (:id o)]) identity))
                      (t2/select (case m
                                   :card      :model/Card
                                   :table     :model/Table
                                   :dashboard :model/Dashboard
                                   :transform :model/Transform
                                   :segment   :model/Segment
                                   :measure   :model/Measure)
                                 {:where [:in :id ids]})))))]
    (let [cards      (id->instances :card)
          tables     (id->instances :table)
          dashboards (id->instances :dashboard)
          transforms (id->instances :transform)
          segments   (id->instances :segment)
          measures   (id->instances :measure)
          queries    (into []
                           (concat
                            ;; Card dataset queries
                            (eduction (comp (keep :dataset_query)
                                            (filter replacement.util/valid-query?)
                                            (map #(lib/query metadata-provider %)))
                                      (vals cards))
                            ;; Transform query sources
                            (eduction (comp (keep :source)
                                            (filter #(= :query (:type %)))
                                            (keep :query)
                                            (map #(lib/query metadata-provider %)))
                                      (vals transforms))
                            ;; Segment definitions
                            (eduction (comp (keep :definition)
                                            (map #(lib/query metadata-provider %)))
                                      (vals segments))
                            ;; Measure definitions
                            (eduction (comp (keep :definition)
                                            (map #(lib/query metadata-provider %)))
                                      (vals measures))))]

      (when (seq queries)
        ;; Extract all referenced entity IDs across all queries
        (let [referenced-ids (lib/all-referenced-entity-ids queries)]
          ;; Bulk load all metadata at once
          (lib-be/bulk-load-query-metadata! metadata-provider referenced-ids)))
      (merge {} cards tables dashboards transforms segments measures))))

(defn- failure-message
  "Build a human-readable message summarizing swap failures, showing at most 10 individual errors."
  [failures total]
  (let [n         (count failures)
        max-shown 10
        lines     (into []
                        (comp (take max-shown)
                              (map (fn [{:keys [entity error]}]
                                     (str "  " entity ": " error))))
                        failures)]
    (str n " of " total " entities failed\n"
         (str/join "\n" lines)
         (when (> n max-shown)
           (str "\n  ... and " (- n max-shown) " more")))))

(defn- run-swap* [{:keys [all-transitive-dependents]}
                  old-source new-source progress]
  (replacement.protocols/set-total! progress
                                    (+ (count all-transitive-dependents)  ;; phase 1: upgrade
                                       (count all-transitive-dependents))) ;; phase 2: swap

  (let [db-id      (case (first old-source)
                     :card  (t2/select-one-fn :database_id :model/Card :id (second old-source))
                     :table (t2/select-one-fn :db_id :model/Table :id (second old-source)))
        batch-size 500]

    ;; phase 1: Upgrade field refs for ALL transitive dependents
    (doseq [batch (partition-all batch-size all-transitive-dependents)]
      (lib-be/with-metadata-provider-cache
        (let [metadata-provider (lib-be/application-database-metadata-provider db-id)
              loaded            (bulk-load-metadata-for-entities! metadata-provider batch)]
          (doseq [entity batch
                  :let   [object (get loaded entity)]]
            ;; upgrade! knows how to handle all entity types including dashboards
            (replacement.field-refs/upgrade-field-refs! entity object)
            (replacement.protocols/advance! progress)))))

    ;; phase 2: Swap sources for ALL transitive dependents (with batched metadata warming)
    (let [failures (atom [])]
      (doseq [batch (partition-all batch-size all-transitive-dependents)]
        (lib-be/with-metadata-provider-cache
          (let [metadata-provider (lib-be/application-database-metadata-provider db-id)
                loaded            (bulk-load-metadata-for-entities! metadata-provider batch)]

            (doseq [entity batch
                    :let   [object (get loaded entity)]]
              (try
                (replacement.source-swap/swap-source! entity object old-source new-source)
                (catch Exception e
                  (log/warnf e "Failed to swap %s, continuing with next entity" entity)
                  (swap! failures conj {:entity entity :error (ex-message e)})))
              (replacement.protocols/advance! progress)))))

      (when-let [fs (seq @failures)]
        (throw (ex-info (failure-message fs (count all-transitive-dependents))
                        {:failures fs}))))))

(defn run-swap-source!
  "Replace all usages of `old-source` with `new-source` across all dependent entities.

   Both arguments are [type id] pairs like [:card 123] or [:table 45].
   `progress` implements `IRunnerProgress` for tracking and cancellation.

   Example:
     (run-swap-source! [:card 123] [:card 789])

   This finds all entities that depend on the old source and updates their queries
   to reference the new source instead. This includes ALL transitive dependents,
   which is necessary for implicit joins to work correctly (e.g., when card D filters
   on Products.Category but is based on card C → card B → card A → Orders)."
  ([old-source new-source]
   (run-swap-source! old-source new-source noop-progress))
  ([old-source
    new-source
    progress]
   (let [all-transitive (replacement.usages/transitive-usages old-source)]
     (run-swap* {:all-transitive-dependents all-transitive}
                old-source new-source progress))))

(def ^:private metadata-override-keys
  "Field columns that correspond to user-editable model metadata overrides.
   These are in snake_case matching both result_metadata storage and Field columns."
  [:description :display_name :semantic_type :fk_target_field_id :settings :visibility_type])

(defn- copy-model-metadata-overrides!
  "Copy user-edited metadata from a model's result_metadata onto the Fields of the
   output table. Writes to both Field and FieldUserSettings so overrides survive sync."
  [card-id table-id]
  (let [card            (t2/select-one :model/Card :id card-id)
        result-metadata (:result_metadata card)
        fields          (t2/select :model/Field :table_id table-id :active true)
        field-by-name   (m/index-by :name fields)]
    (doseq [col-meta result-metadata
            :let [field     (field-by-name (source-swap.util/column-match-key col-meta))
                  overrides (u/select-keys-when col-meta :non-nil metadata-override-keys)]
            :when (and field (seq overrides))]
      (t2/update! :model/Field (:id field) overrides)
      (field-user-settings/upsert-user-settings field overrides))))

(defn run-swap-model-with-transform!
  "Execute a transform, find the output table, then swap all dependents of the card
   to point at the new table. Finally un-persist and convert the card to a saved question.

   `card-id`      — the model card to replace
   `transform-id` — the transform to execute
   `progress`     — IRunnerProgress for tracking"
  ([card-id transform-id]
   (run-swap-model-with-transform! card-id transform-id noop-progress))
  ([card-id transform-id progress & {:keys [user-id]}]
   (let [transform (or (t2/select-one :model/Transform :id transform-id)
                       (throw (ex-info "Transform not found" {:transform-id transform-id})))]
     ;; phase 1: execute the transform
     (transforms/execute! transform (cond-> {:run-method :manual}
                                      user-id (assoc :user-id user-id)))

     ;; phase 2: find the output table, copy metadata overrides, and swap sources
     (let [table (or (transforms/output-table transform)
                     (throw (ex-info "Output table not found after transform execution"
                                     {:transform-id (:id transform)})))]
       (copy-model-metadata-overrides! card-id (:id table))
       (run-swap-source! [:card card-id] [:table (:id table)] progress))

     ;; phase 3: unpersist the model if it was persisted
     (when-let [persisted-info (t2/select-one :model/PersistedInfo :card_id card-id)]
       (model-persistence/mark-for-pruning! {:id (:id persisted-info)} "off"))

     ;; phase 4: convert the model to a saved question
     (t2/update! :model/Card card-id {:type :question}))))
