(ns metabase-enterprise.data-apps.generate.resources
  "The files of a data app's collection: the saved question each `defineQuery` definition builds, and the copies of the
  actions the app runs and of the metrics its queries aggregate, each named and written as a remote-sync export writes
  it in the collection's folder.

  The endpoint is for superusers, who write an app's repository, so nothing here is checked against the caller.
  Opening it to anyone else needs that put back: every source, and every table a query reads at any depth. What a
  routing destination backs is left out, as the typed schema leaves it out."
  (:require
   [clojure.string :as str]
   [clojure.walk :as walk]
   [metabase-enterprise.data-apps.db :as data-apps.db]
   [metabase-enterprise.data-apps.query-definition :as query-definition]
   [metabase-enterprise.data-apps.schema :as data-apps.schema]
   [metabase-enterprise.serialization.core :as serialization]
   [metabase.actions.core :as actions]
   [metabase.api.common :as api]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.schema :as lib.schema]
   [metabase.models.serialization :as serdes]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms])
  (:import
   (java.nio.charset StandardCharsets)
   (java.security MessageDigest)
   (java.util Base64)))

(set! *warn-on-reflection* true)

(defn- fail
  "Throws the refusal of an item: a reason the author has to act on, which is not a failure of the serialization."
  [message]
  (throw (ex-info message {::refusal true})))

(defn- with-item-error
  "Calls `thunk`, or answers the `:error` that stopped it, so one item that can't be serialized doesn't fail the
  rest. Anything other than a refusal is logged, so a bug in the serialization leaves a trace on the server."
  [item thunk]
  (try
    (thunk)
    (catch Exception e
      (when-not (::refusal (ex-data e))
        (log/warn e "Could not serialize a data app resource" item))
      {:error (or (ex-message e) (tru "Could not serialize it."))})))

(defn- extract-by-entity-id
  "The entities of `model-name` with `ids`, as serialization extracts them, keyed by entity ID: one extraction for
  them all. Serialization leaves out what it can't extract, and goes on past one it fails on, so an entity missing
  from the result couldn't be extracted; [[extraction-error]] says why."
  [model-name ids]
  (if (seq ids)
    (into {}
          (comp (filter map?)
                (map (juxt (comp :id last :serdes/meta) identity)))
          (serdes/extract-all model-name {:filter-column :id :filter-ids (vec ids) :continue-on-error true}))
    {}))

(defn- extraction-error
  "Why serialization can't extract the `model-name` entity with `id`, or nil when it leaves the entity out without an
  error: the one entity is extracted on its own, with the error let through. The reason is the innermost cause."
  [model-name id]
  (try
    (run! identity (serdes/extract-all model-name {:filter-column :id :filter-ids [id]}))
    nil
    (catch Exception e
      (ex-message (last (take-while some? (iterate ex-cause e)))))))

(defn- cards-read
  "The IDs, as a comma-separated string, of the cards the `model-name` entity `source` references everywhere
  serialization looks, or nil when it references none. A data app's resources can't hold them, so a copy
  referencing one would fail to load."
  [model-name {:keys [parameters] :as source}]
  (some->> (concat (serdes/serialization-dependencies model-name source)
                   (serdes/parameters-deps true parameters))
           (keep (fn [path]
                   (let [{:keys [model id]} (last path)]
                     (when (= "Card" model)
                       id))))
           distinct
           not-empty
           sort
           (str/join ", ")))

(defn- check-copyable
  "Throws when the `model-name` entity `source`, labelled `label` and extracted as `serialized`, can't be copied into a
  data app's resources: it's archived, a routing destination backs it, it references a card, or serialization
  couldn't extract it."
  [label model-name {:keys [archived database_id] :as source} serialized]
  (when archived
    (fail (tru "{0} is archived." label)))
  (when (seq (data-apps.db/destination-database-ids #{database_id}))
    (fail (tru "{0} is backed by a routing destination database." label)))
  (when-let [card-ids (cards-read model-name source)]
    (fail (tru "{0} reads card {1}, which a data app''s resources can''t hold." label card-ids)))
  (when-not serialized
    (fail (if-let [cause (extraction-error model-name (:id source))]
            (tru "Could not serialize {0}: {1}" label cause)
            (tru "Could not serialize {0}." label)))))

(mu/defn- build-query :- ::lib.schema/query
  "The query Lib builds from `query-definition`, once its source table and every table it reads at any depth exist."
  [{[{{table-id :id} :source}] :stages, :as query-definition} :- ::query-definition/query-definition]
  (let [table (data-apps.db/table table-id)]
    (when-not table
      (fail (tru "Table {0} does not exist." (str table-id))))
    (let [query (lib/test-query (lib-be/application-database-metadata-provider (:db_id table)) query-definition)]
      (when-not (mr/validate ::lib.schema/query query)
        (fail (tru "The definition does not build a valid query.")))
      (doseq [read-id (sort (into (:table (lib/all-referenced-entity-ids-recursive query))
                                  (keep :table-id)
                                  (lib/returned-columns query -1 query {:include-remaps? true})))]
        (when-not (data-apps.db/table read-id)
          (fail (tru "Table {0} does not exist." (str read-id)))))
      query)))

(mu/defn- build-card :- :map
  "The unsaved question named `card-name` with entity ID `entity-id`, holding `query`."
  [card-name :- ms/NonBlankString
   entity-id :- ms/NanoIdString
   query     :- ::lib.schema/query]
  {:entity_id              entity-id
   :name                   card-name
   :type                   :question
   :display                :table
   :creator_id             api/*current-user-id*
   :database_id            (:database query)
   :dataset_query          (lib/prepare-for-serialization query)
   :visualization_settings {}
   :parameters             []
   :parameter_mappings     []})

(def ^:private public-keys
  "What makes a source public or embedded. A copy never is, and the pull refuses a file that says it is."
  [:public_uuid :made_public_by_id :enable_embedding :embedding_params :embedding_type])

(defn- as-copy
  "The extracted `entity` as its copy with `entity-id` in the collection with `collection-id`."
  [entity entity-id collection-id]
  (-> (apply dissoc entity public-keys)
      (assoc :entity_id entity-id :collection_id collection-id)
      (update :serdes/meta #(assoc-in % [(dec (count %)) :id] entity-id))))

(defn- copy-entity-id
  "The entity ID of the copy, in the collection with `collection-id`, of the entity with `source-entity-id`: the same
  every time, so the copy's file is the same every time."
  [collection-id source-entity-id]
  (let [digest (.digest (MessageDigest/getInstance "SHA-256")
                        (.getBytes (str collection-id "/" source-entity-id) StandardCharsets/UTF_8))]
    (subs (.encodeToString (.withoutPadding (Base64/getUrlEncoder)) digest) 0 21)))

(defn- metric-copies
  "The metric copies the built `queries` aggregate, as `{[collection-id card-id] {:file .. :entity-id ..}}`."
  [queries]
  (let [uses       (into (sorted-set)
                         (comp (remove :error)
                               (mapcat (fn [{:keys [collection_id built]}]
                                         (map #(vector collection_id %) (lib/all-source-card-ids built)))))
                         queries)
        cards      (into {} (map (juxt :id identity)) (data-apps.db/cards-by-ids (into #{} (map second) uses)))
        serialized (extract-by-entity-id "Card" (keys cards))]
    (into (sorted-map)
          (for [[collection-id card-id :as use] uses
                :let [card (cards card-id)]]
            [use {:card      card
                  :entity-id (some->> card :entity_id (copy-entity-id collection-id))
                  :copy      (with-item-error
                               {:metric card-id}
                               (fn []
                                 (let [label (tru "Metric {0}" (str card-id))]
                                   (when-not (and card (= :metric (keyword (:type card))))
                                     (fail (tru "{0} does not exist." label)))
                                   (check-copyable label "Card" card (serialized (:entity_id card)))
                                   (as-copy (serialized (:entity_id card))
                                            (copy-entity-id collection-id (:entity_id card))
                                            collection-id))))}]))))

(defn- read-metric-copies
  "The extracted question `entity` reading the copies of the metrics it aggregates, in its collection."
  [entity collection-id copies]
  (let [copy-ids (into {}
                       (keep (fn [[[copy-collection-id _] {:keys [card entity-id copy]}]]
                               (when (and (= copy-collection-id collection-id) (not (:error copy)))
                                 [(:entity_id card) entity-id])))
                       copies)]
    (walk/postwalk #(get copy-ids % %) entity)))

(mu/defn generate :- [:map {:closed true}
                      [:queries [:sequential ::data-apps.schema/file]]
                      [:actions [:sequential ::data-apps.schema/file]]
                      [:metrics [:sequential ::data-apps.schema/file]]]
  "The files of a data app's collection: the saved question of each of `queries`, the copy of each of `actions`, and
  the copies of the metrics the queries aggregate, each named as serialization names it in the collection's folder.
  Each item comes back on its own, with its file or the error that stops it."
  [{:keys [queries actions]} :- [:map {:closed true}
                                 [:queries {:optional true} [:maybe [:sequential ::data-apps.schema/query]]]
                                 [:actions {:optional true} [:maybe [:sequential ::data-apps.schema/action]]]]]
  (serdes/with-cache
    (let [unique-name    (lib/non-truncating-unique-name-generator)
          ->file         (fn [entity]
                           {:file (str (unique-name (:entity_id entity) (serialization/slugify-name (:name entity))) ".yaml")
                            :yaml (serialization/entity-yaml entity)})
          built          (mapv (fn [{:keys [query] :as item}]
                                 (merge item (with-item-error {:query (:entity_id item)} #(hash-map :built (build-query query)))))
                               queries)
          copies         (metric-copies built)
          actions-by-id  (into {} (map (juxt :id identity))
                               (actions/select-actions-for-ids nil (mapv :action_id actions)))
          serialized     (extract-by-entity-id "Action" (keys actions-by-id))]
      {:queries (mapv (fn [{:keys [name entity_id collection_id built error]}]
                        (if error
                          {:error error}
                          (with-item-error {:query entity_id}
                            (fn []
                              (-> (serdes/extract-one "Card" {} (build-card name entity_id built))
                                  (assoc :collection_id collection_id)
                                  (read-metric-copies collection_id copies)
                                  ->file)))))
                      built)
       :actions (mapv (fn [{:keys [action_id entity_id collection_id] :as item}]
                        (with-item-error item
                          (fn []
                            (let [label  (tru "Action {0}" (str action_id))
                                  action (actions-by-id action_id)]
                              (when-not action
                                (fail (tru "{0} does not exist." label)))
                              (when (:model_id action)
                                (fail (tru "{0} belongs to a model. A data app runs query actions that belong to no model."
                                           label)))
                              (check-copyable label "Action" action (serialized (:entity_id action)))
                              (->file (as-copy (serialized (:entity_id action)) entity_id collection_id))))))
                      actions)
       :metrics (mapv (fn [{:keys [copy]}]
                        (if (:error copy) copy (->file copy)))
                      (vals copies))})))
