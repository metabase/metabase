(ns metabase-enterprise.data-apps.resource-export
  "What a data app's `resources/` files are written from, as serialization writes it: the saved question that holds
  the query Metabase builds from each `defineQuery` definition, each action the app runs, and the metrics its queries
  aggregate. Nothing here references an entity by numeric ID, so the author copies it into the app's resources as it
  is, apart from what makes it a copy.

  The endpoint is for superusers, who write an app's repository, so nothing here is checked against the caller.
  Opening it to anyone else needs that put back: every source, and every table a query's column reaches through a
  foreign key. What a routing destination backs is left out, as the typed schema leaves it out."
  (:require
   [clojure.string :as str]
   [clojure.walk :as walk]
   [metabase-enterprise.data-apps.db :as data-apps.db]
   [metabase-enterprise.data-apps.query-definition :as query-definition]
   [metabase-enterprise.serialization.dump :as serialization.dump]
   [metabase.actions.core :as actions]
   [metabase.api.common :as api]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.schema :as lib.schema]
   [metabase.models.serialization :as serdes]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(set! *warn-on-reflection* true)

(defn- fail
  "Throws the refusal of an item: a reason the author has to act on, which is not a failure of the export."
  [message]
  (throw (ex-info message {::refusal true})))

(defn- with-item-error
  "Calls `export`, or answers `item` with the `:error` that stopped it, so one item that can't be exported doesn't
  fail the rest. Anything other than a refusal is logged, so a bug in an export leaves a trace on the server."
  [item export]
  (try
    (export)
    (catch Exception e
      (when-not (::refusal (ex-data e))
        (log/warn e "Could not export a data app resource" item))
      (assoc item :error (or (ex-message e) (tru "Could not export it."))))))

(defn- extract-by-entity-id
  "The entities of `model-name` with `ids`, as serialization exports them, keyed by entity ID: one extraction for
  them all. Serialization leaves out what it can't export (an exploration's card), and goes on past one it fails
  on, so an entity missing from the result couldn't be exported; [[extraction-error]] says why."
  [model-name ids]
  (if (seq ids)
    (into {}
          (comp (filter map?)
                (map (juxt (comp :id last :serdes/meta) identity)))
          (serdes/extract-all model-name {:filter-column :id :filter-ids (vec ids) :continue-on-error true}))
    {}))

(defn- extraction-error
  "Why serialization can't export the `model-name` entity with `id`, or nil when it can: the one entity is extracted
  on its own, with the error let through."
  [model-name id]
  (try
    ;; reduced rather than seq'd: the extraction is a reducible, not a seq
    (run! identity (serdes/extract-all model-name {:filter-column :id :filter-ids [id]}))
    nil
    (catch Exception e
      (or (:cause (ex-data e)) (ex-message e)))))

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
    (fail (tru "Serialization could not export {0}: {1}" label (extraction-error model-name (:id source))))))

(def ^:private public-keys
  "What makes a source public or embedded. A copy never is, and the pull refuses a file that says it is."
  [:public_uuid :made_public_by_id :enable_embedding :embedding_params :embedding_type])

(defn- as-written
  "`entity` as the author writes it: in the key order serialization writes, without the keys it leaves unset, which
  the format omits, and without what makes the source public or embedded. The query is kept whole; nothing in it is
  unset."
  [entity]
  (let [query (:dataset_query entity)]
    (serialization.dump/serialization-deep-sort
     (cond-> (walk/postwalk (fn [x] (if (map? x) (into {} (remove (comp nil? val)) x) x))
                            (apply dissoc entity :dataset_query public-keys))
       query (assoc :dataset_query query)))))

(defn- export-name->card-name
  "The saved question's name from the definition's export name: its words, as `ProductsList` is `Products list`."
  [export]
  (-> export
      (str/replace #"([a-z0-9])([A-Z])" "$1 $2")
      (str/replace #"[\s_]+" " ")
      u/lower-case-en
      str/capitalize))

(defn- question-card
  "The saved question an author writes for a `defineQuery` definition, as a card for serialization to extract: the
  query Metabase `built`, created by the caller, with the definition's entity ID. The app's collection is set on the
  extracted entity, since serialization resolves a collection by numeric ID."
  [{:keys [export entity_id]} built]
  {:entity_id              entity_id
   :name                   (export-name->card-name export)
   :type                   :question
   :display                :table
   :creator_id             api/*current-user-id*
   :database_id            (:database built)
   :dataset_query          (lib/prepare-for-serialization built)
   :visualization_settings {}
   :parameters             []
   :parameter_mappings     []})

(mu/defn- built-query
  "The query Metabase builds from `query-definition`, as the dev preview does. (A routing destination has no tables
  of its own, only cards.)"
  [{[{{table-id :id} :source}] :stages, :as query-definition} :- ::query-definition/query-definition]
  (let [table (data-apps.db/table table-id)]
    (when-not table
      (fail (tru "Table {0} does not exist." (str table-id))))
    (let [built (lib/test-query (lib-be/application-database-metadata-provider (:db_id table)) query-definition)]
      ;; The request schema accepts what a type lets through, such as a fractional limit, and the checks in lib
      ;; that would refuse it are off in production: an invalid query must not export and then fail when it runs.
      (when-not (mr/validate ::lib.schema/query built)
        (fail (tru "The definition does not build a valid query.")))
      built)))

(mu/defn- export-query
  "A `defineQuery` definition as `{:export :entity :metric_ids}`, the entity being the saved question that holds the
  query Metabase builds from it, in the collection with `collection-entity-id`, or `{:export :error}`."
  [collection-entity-id        :- [:maybe ms/NanoIdString]
   {:keys [export query] :as definition} :- [:map {:closed true}
                                             [:export ms/NonBlankString]
                                             [:entity_id {:optional true} [:maybe ms/NanoIdString]]
                                             [:query ::query-definition/query-definition]]]
  (with-item-error
    {:export export}
    (fn []
      (let [built (built-query query)]
        {:export     export
         :entity     (as-written (cond-> (serdes/extract-one "Card" {} (question-card definition built))
                                   collection-entity-id (assoc :collection_id collection-entity-id)))
         :metric_ids (vec (sort (lib/all-source-card-ids built)))}))))

(defn- export-metric
  "The metric `card` as `{:id :entity}`, or `{:id :error}` when the app can't copy it. `exported` is its
  serialization export, if it has one."
  [card-id card exported]
  (with-item-error
    {:id card-id}
    (fn []
      (let [label (tru "Metric {0}" (str card-id))]
        (when-not (and card (= :metric (keyword (:type card))))
          (fail (tru "{0} does not exist." label)))
        (check-copyable label "Card" card exported #{})
        {:id card-id, :entity (as-written exported)}))))

(defn- export-action
  "The action with `action-id` as `{:id :entity}`, or `{:id :error}` when the app can't copy it. `exported` is the
  action's serialization export, if it has one. A data app runs only actions that belong to no model, as the typed
  schema lists only those."
  [action-id action exported]
  (with-item-error
    {:id action-id}
    (fn []
      (let [label (tru "Action {0}" (str action-id))]
        (when-not action
          (fail (tru "{0} does not exist." label)))
        (when (:model_id action)
          (fail (tru "{0} belongs to a model. A data app runs query actions that belong to no model." label)))
        (check-copyable label "Action" action exported #{})
        {:id action-id, :entity (as-written exported)}))))

(defn export-resources
  "Export the saved question built from each of `queries` (`{:export <name> :query <definition> :entity_id <id>}`),
  in the app's collection with `collection-entity-id`, the actions with `action-ids`, and the metrics the queries
  aggregate. Each item comes back on its own, with what it exports or the error that stops it, so one item that
  can't be exported doesn't hide the rest. A query lists the entity IDs of the metrics it references, which the
  author points at the app's copies."
  [queries action-ids & {:keys [collection-entity-id]}]
  (serdes/with-cache
    (let [queries       (mapv (partial export-query collection-entity-id) queries)
          actions-by-id (into {} (map (juxt :id identity)) (actions/select-actions-for-ids nil action-ids))
          metric-ids    (into (sorted-set) (mapcat :metric_ids) queries)
          cards-by-id   (into {} (map (juxt :id identity)) (data-apps.db/cards-by-ids metric-ids))
          exported-card (comp (extract-by-entity-id "Card" (keys cards-by-id)) :entity_id cards-by-id)
          exported-act  (comp (extract-by-entity-id "Action" (keys actions-by-id)) :entity_id actions-by-id)]
      {:queries (mapv (fn [{:keys [metric_ids] :as query}]
                        (cond-> (dissoc query :metric_ids)
                          (not (:error query)) (assoc :metrics (mapv (comp :entity_id cards-by-id) metric_ids))))
                      queries)
       :actions (mapv #(export-action % (actions-by-id %) (exported-act %)) action-ids)
       :metrics (mapv #(export-metric % (cards-by-id %) (exported-card %)) metric-ids)})))
