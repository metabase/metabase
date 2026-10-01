(ns metabase-enterprise.data-apps.resource-export
  "What a data app's `resources/` files are written from, as serialization writes it: the query Metabase builds from
  each `defineQuery` definition, and each action the app runs together with its model and the metrics its queries
  aggregate. Nothing here references an entity by numeric ID, so the author copies it into the app's resources as it
  is, apart from what makes it a copy.

  Permissions are the typed schema's: the caller must be able to read each source. A table the caller can't read
  answers as if it didn't exist, before its columns are looked at, so the export reveals nothing the schema
  wouldn't."
  (:require
   [clojure.string :as str]
   [metabase-enterprise.data-apps.db :as data-apps.db]
   [metabase.actions.core :as actions]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.models.interface :as mi]
   [metabase.models.serialization :as serdes]
   [metabase.query-permissions.core :as query-perms]
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

(defn- extract
  "The entity of `model-name` with `id` as serialization exports it. Serialization leaves out what it can't export
  (an exploration's card) or answers with the error, so anything but the entity is a failure here."
  [model-name id]
  (let [exported (first (into [] (serdes/extract-all model-name {:filter-column :id :filter-ids [id]})))]
    (when-not (map? exported)
      (fail (tru "Serialization could not export it.")))
    exported))

(defn- cards-read
  "The IDs, as a comma-separated string, of the cards `dataset-query` and `parameters` read, or nil when they read
  none. A data app's resources can't hold them, so a copy reading one would fail to load."
  [database-id dataset-query parameters]
  (some->> (into (set (when (seq dataset-query)
                        (lib/all-source-card-ids
                         (lib/query (lib-be/application-database-metadata-provider database-id) dataset-query))))
                 (keep #(get-in % [:values_source_config :card_id]))
                 parameters)
           not-empty
           sort
           (str/join ", ")))

(defn- check-copyable
  "Throws when `entity` (labelled `label`) can't be copied into a data app's resources: it's archived, which the
  pull refuses, or it reads a card the resources can't hold."
  [label {:keys [archived database_id dataset_query parameters]}]
  (when archived
    (fail (tru "{0} is archived." label)))
  (when-let [card-ids (cards-read database_id dataset_query parameters)]
    (fail (tru "{0} reads card {1}, which a data app''s resources can''t hold." label card-ids))))

(defn- built-query
  "The query Metabase builds from `query-definition`, as the dev preview does."
  [query-definition]
  (let [table-id (get-in query-definition [:stages 0 :source :id])
        table    (data-apps.db/table table-id)]
    (when-not (and table (mi/can-read? table))
      (fail (tru "Table {0} does not exist, or you can''t read it." (str table-id))))
    (let [query (lib/test-query (lib-be/application-database-metadata-provider (:db_id table)) query-definition)]
      (when-not (query-perms/can-run-query? query)
        (fail (tru "You don''t have permission to run this query.")))
      query)))

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
  "The model or metric `card` as `{:id :entity}`, or `{:id :error}` when the app can't copy it."
  [card-type card-id card]
  (with-item-error
    {:id card-id}
    (fn []
      (let [label (case card-type
                    :model  (tru "Model {0}" (str card-id))
                    :metric (tru "Metric {0}" (str card-id)))]
        (when-not (and card (= card-type (keyword (:type card))) (mi/can-read? card))
          (fail (tru "{0} does not exist, or you can''t read it." label)))
        (check-copyable label card)
        {:id card-id, :entity (extract "Card" card-id)}))))

(defn- export-action
  "The action with `action-id` as `{:id :entity}`, or `{:id :error}` when the app can't copy it, including when its
  model can't be copied: `model-error` is the error of the model's export, if it failed."
  [action-id action model-error]
  (with-item-error
    {:id action-id}
    (fn []
      (let [label (tru "Action {0}" (str action-id))]
        (when-not (and action (mi/can-read? action))
          (fail (tru "{0} does not exist, or you can''t read it." label)))
        (when (= :http (keyword (:type action)))
          (fail (tru "{0} is an HTTP action, which a data app can''t copy." label)))
        (check-copyable label action)
        (when model-error
          (fail (tru "{0} can''t be copied because its model can''t: {1}" label model-error)))
        {:id action-id, :entity (extract "Action" action-id)}))))

(defn export-resources
  "Export the query built from each of `queries` (`{:export <name> :query <definition>}`), the actions with
  `action-ids`, the models those actions belong to, and the metrics the queries aggregate. Each item comes back on
  its own, with what it exports or the error that stops it, so one item that can't be exported doesn't hide the
  rest. A query lists the entity IDs of the metrics it references, which the author points at the app's copies."
  [queries action-ids]
  (let [queries       (mapv export-query queries)
        actions-by-id (into {} (map (juxt :id identity)) (actions/select-actions-for-ids nil action-ids))
        model-ids     (into (sorted-set) (keep :model_id) (vals actions-by-id))
        metric-ids    (into (sorted-set) (mapcat :metric_ids) queries)
        cards-by-id   (into {} (map (juxt :id identity)) (data-apps.db/cards-by-ids (concat model-ids metric-ids)))
        models        (mapv #(export-card :model % (cards-by-id %)) model-ids)
        model-errors  (into {} (keep (fn [{:keys [id error]}] (when error [id error]))) models)]
    {:queries (mapv (fn [{:keys [metric_ids] :as query}]
                      (cond-> (dissoc query :metric_ids)
                        (not (:error query)) (assoc :metrics (mapv (comp :entity_id cards-by-id) metric_ids))))
                    queries)
     :actions (mapv (fn [action-id]
                      (let [action (actions-by-id action-id)]
                        (export-action action-id action (model-errors (:model_id action)))))
                    action-ids)
     :models  models
     :metrics (mapv #(export-card :metric % (cards-by-id %)) metric-ids)}))
