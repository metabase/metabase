(ns metabase-enterprise.data-apps.resource-export
  "What a data app's `resources/` files are written from, as serialization writes it: the query Metabase builds from
  each `defineQuery` definition, and each action the app runs together with its model and the metrics its queries
  aggregate. Nothing here references an entity by numeric ID, so the author copies it into the app's resources as it
  is, apart from what makes it a copy.

  Permissions are the typed schema's: the caller must be able to read each source, and what a routing destination
  backs is left out, as the schema leaves it out. A table the caller can't read answers as if it didn't exist, before
  its columns are looked at, so the export reveals nothing the schema wouldn't."
  (:require
   [clojure.string :as str]
   [metabase-enterprise.data-apps.db :as data-apps.db]
   [metabase.actions.core :as actions]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.models.interface :as mi]
   [metabase.models.serialization :as serdes]
   [metabase.util.i18n :refer [tru]]))

(set! *warn-on-reflection* true)

(defn- fail [message]
  (throw (ex-info message {})))

(defn- with-item-error
  "Calls `export`, or answers `item` with the `:error` that stopped it, so one item that can't be exported doesn't
  fail the rest."
  [item export]
  (try
    (export)
    (catch Exception e
      (assoc item :error (or (ex-message e) (tru "Could not export it."))))))

(defn- extract-by-entity-id
  "The entities of `model-name` with `ids`, as serialization exports them, keyed by entity ID: one extraction for
  them all. Serialization leaves out what it can't export (an exploration's card) or answers with the error, so an
  entity missing from the result couldn't be exported."
  [model-name ids]
  (if (seq ids)
    (into {}
          (comp (filter map?)
                (map (juxt (comp :id last :serdes/meta) identity)))
          (serdes/extract-all model-name {:filter-column :id :filter-ids (vec ids)}))
    {}))

(defn- cards-read
  "The IDs, as a comma-separated string, of the cards the `model-name` entity `source` references everywhere
  serialization looks (its query, its visualization settings, its parameters' value sources, ...), except
  `own-cards`, or nil when it references none. A data app's resources can't hold them, so a copy referencing one
  would fail to load."
  [model-name {:keys [parameters] :as source} own-cards]
  (some->> (concat (serdes/serialization-dependencies model-name source)
                   ;; An action's dependencies leave out its parameters, which a card's include.
                   (serdes/parameters-deps true parameters))
           (keep (fn [path]
                   (let [{:keys [model id]} (last path)]
                     (when (and (= "Card" model) (not (contains? own-cards id)))
                       id))))
           distinct
           not-empty
           sort
           (str/join ", ")))

(defn- check-copyable
  "Throws when the `model-name` entity `source`, labelled `label` and exported as `exported`, can't be copied into a
  data app's resources: it's archived (the pull refuses it), a routing destination backs it, it references a card other
  than `own-cards`, or serialization couldn't export it."
  [label model-name {:keys [archived database_id] :as source} exported own-cards]
  (when archived
    (fail (tru "{0} is archived." label)))
  (when (seq (data-apps.db/destination-database-ids #{database_id}))
    (fail (tru "{0} is backed by a routing destination database." label)))
  (when-let [card-ids (cards-read model-name source own-cards)]
    (fail (tru "{0} reads card {1}, which a data app''s resources can''t hold." label card-ids)))
  (when-not exported
    (fail (tru "Serialization could not export {0}." label))))

(defn- built-query
  "The query Metabase builds from `query-definition`, as the dev preview does. The table has to be one the typed
  schema would show the caller: one they can read. (A routing destination has no tables of its own, only cards.)"
  [query-definition]
  (let [table-id (get-in query-definition [:stages 0 :source :id])
        table    (data-apps.db/table table-id)]
    (when-not (and table (mi/can-read? table))
      (fail (tru "Table {0} does not exist, or you can''t read it." (str table-id))))
    (lib/test-query (lib-be/application-database-metadata-provider (:db_id table)) query-definition)))

(defn- export-query
  "A `defineQuery` definition as `{:export :dataset_query :metric_ids}`, or `{:export :error}`."
  [{:keys [export query]}]
  (with-item-error
    {:export export}
    (fn []
      (let [built (built-query query)]
        {:export        export
         :dataset_query (serdes/export-mbql built)
         :metric_ids    (vec (sort (lib/all-source-card-ids built)))}))))

(defn- export-card
  "The model or metric `card` as `{:id :entity}`, or `{:id :error}` when the app can't copy it. `exported` is its
  serialization export, if it has one."
  [card-type card-id card exported]
  (with-item-error
    {:id card-id}
    (fn []
      (let [label (case card-type
                    :model  (tru "Model {0}" (str card-id))
                    :metric (tru "Metric {0}" (str card-id)))]
        (when-not (and card (= card-type (keyword (:type card))) (mi/can-read? card))
          (fail (tru "{0} does not exist, or you can''t read it." label)))
        (check-copyable label "Card" card exported #{})
        {:id card-id, :entity exported}))))

(defn- export-action
  "The action with `action-id` as `{:id :entity}`, or `{:id :error}` when the app can't copy it, including when its
  model can't be copied: `model-error` is the error of the model's export, if it failed. `exported` is the action's
  serialization export, if it has one, which references its model by entity ID."
  [action-id action exported model-error]
  (with-item-error
    {:id action-id}
    (fn []
      (let [label (tru "Action {0}" (str action-id))]
        (when-not (and action (mi/can-read? action))
          (fail (tru "{0} does not exist, or you can''t read it." label)))
        (when (= :http (keyword (:type action)))
          (fail (tru "{0} is an HTTP action, which a data app can''t copy." label)))
        (check-copyable label "Action" action exported #{(:model_id action)})
        (when model-error
          (fail (tru "{0} can''t be copied because its model can''t: {1}" label model-error)))
        {:id action-id, :entity exported}))))

(defn export-resources
  "Export the query built from each of `queries` (`{:export <name> :query <definition>}`), the actions with
  `action-ids`, the models those actions belong to, and the metrics the queries aggregate. Each item comes back on
  its own, with what it exports or the error that stops it, so one item that can't be exported doesn't hide the
  rest. A query lists the entity IDs of the metrics it references, which the author points at the app's copies."
  [queries action-ids]
  (serdes/with-cache
    (let [queries       (mapv export-query queries)
          actions-by-id (into {} (map (juxt :id identity)) (actions/select-actions-for-ids nil action-ids))
          model-ids     (into (sorted-set) (keep :model_id) (vals actions-by-id))
          metric-ids    (into (sorted-set) (mapcat :metric_ids) queries)
          cards-by-id   (into {} (map (juxt :id identity)) (data-apps.db/cards-by-ids (concat model-ids metric-ids)))
          exported-card (comp (extract-by-entity-id "Card" (keys cards-by-id)) :entity_id cards-by-id)
          exported-act  (comp (extract-by-entity-id "Action" (keys actions-by-id)) :entity_id actions-by-id)
          models        (mapv #(export-card :model % (cards-by-id %) (exported-card %)) model-ids)
          model-errors  (into {} (keep (fn [{:keys [id error]}] (when error [id error]))) models)]
      {:queries (mapv (fn [{:keys [metric_ids] :as query}]
                        (cond-> (dissoc query :metric_ids)
                          (not (:error query)) (assoc :metrics (mapv (comp :entity_id cards-by-id) metric_ids))))
                      queries)
       :actions (mapv (fn [action-id]
                        (let [action (actions-by-id action-id)]
                          (export-action action-id action (exported-act action-id) (model-errors (:model_id action)))))
                      action-ids)
       :models  models
       :metrics (mapv #(export-card :metric % (cards-by-id %) (exported-card %)) metric-ids)})))
