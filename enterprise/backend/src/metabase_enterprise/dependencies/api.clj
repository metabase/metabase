(ns metabase-enterprise.dependencies.api
  (:require
   [medley.core :as m]
   [metabase-enterprise.dependencies.core :as dependencies]
   [metabase-enterprise.dependencies.models.dependency :as dependency]
   [metabase.analyze.core :as analyze]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.api.util.handlers :as handlers]
   [metabase.collections.models.collection.root :as collection.root]
   [metabase.graph.core :as graph]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.models.interface :as mi]
   [metabase.native-query-snippets.core :as native-query-snippets]
   [metabase.queries.schema :as queries.schema]
   [metabase.revisions.core :as revisions]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(mr/def ::card-body
  [:merge
   ::queries.schema/card
   ;; TODO (Cam 10/1/25) -- merge this into `::queries.schema/card` itself
   [:map
    [:result_metadata {:optional true} [:maybe analyze/ResultsMetadata]]]])

(defn- broken-cards-response
  [{:keys [card transform]}]
  (let [broken-card-ids (keys card)
        broken-cards (when (seq broken-card-ids)
                       (-> (t2/select :model/Card :id [:in broken-card-ids])
                           (t2/hydrate [:collection :effective_ancestors] :dashboard)))
        broken-transform-ids (keys transform)
        broken-transforms (when (seq broken-transform-ids)
                            (t2/select :model/Transform :id [:in broken-transform-ids]))]
    {:success (and (empty? broken-card-ids)
                   (empty? broken-transform-ids))
     :bad_cards (into [] (comp (filter (fn [card]
                                         (if (mi/can-read? card)
                                           card
                                           (do (log/debugf "Eliding broken card %d - not readable by the user" (:id card))
                                               nil))))
                               (map (fn [card]
                                      (-> card
                                          collection.root/hydrate-root-collection
                                          (update :dashboard #(some-> % (select-keys [:id :name])))))))
                      broken-cards)
     :bad_transforms (into [] broken-transforms)}))

(api.macros/defendpoint :post "/check_card"
  "Check a proposed edit to a card, and return the card IDs for those cards this edit will break."
  [_route-params
   _query-params
   body :- ::card-body]
  (api/read-check :model/Card (:id body))
  (let [database-id (-> body :dataset_query :database)
        base-provider (lib-be/application-database-metadata-provider database-id)
        original (lib.metadata/card base-provider (:id body))
        card (-> original
                 (assoc :dataset-query (:dataset_query body)
                        :type (:type body (:type original)))
                           ;; Remove the old `:result-metadata` from the card, it's likely wrong now.
                 (dissoc :result-metadata)
                           ;; But if the request includes `:result_metadata`, use that. It may be from a native card
                           ;; that's been run before saving the card.
                 (cond-> #_card
                  (:result_metadata body) (assoc :result-metadata (:result_metadata body))))
        edits {:card [card]}
        breakages (dependencies/errors-from-proposed-edits base-provider edits)]
    (broken-cards-response breakages)))

(mr/def ::transform-body
  [:map
   [:id {:optional false} ms/PositiveInt]
   [:name {:optional true} :string]
   ;; TODO (Cam 10/8/25) -- no idea what the correct schema for these is supposed to be -- it was just `map` before --
   ;; this is my attempt to guess it
   [:source {:optional true} [:maybe [:map
                                      [:type {:optional true} :keyword]
                                      [:query {:optional true} ::queries.schema/query]]]]
   [:target {:optional true} [:maybe ms/Map]]])

(api.macros/defendpoint :post "/check_transform"
  "Check a proposed edit to a transform, and return the card, transform, etc. IDs for things that will break."
  [_route-params
   _query-params
   {:keys [id source target]} :- ::transform-body]
  (api/read-check :model/Transform id)
  (if (= (keyword (:type source)) :query)
    (let [database-id (-> source :query :database)
          base-provider (lib-be/application-database-metadata-provider database-id)
          original (lib.metadata/transform base-provider id)
          transform (-> original
                        (cond-> #_transform source (assoc :source source))
                        (cond-> #_transform target (assoc :target target)))
          edits {:transform [transform]}
          breakages (dependencies/errors-from-proposed-edits base-provider edits)]
      (broken-cards-response breakages))
    ;; if this isn't a sql query, just claim it works
    {:success true}))

(api.macros/defendpoint :post "/check_snippet"
  "Check a proposed edit to a native snippet, and return the cards, etc. which will be broken."
  [_route-params
   _query-params
   {:keys [id content], snippet-name :name}
   :- [:map
       [:id {:optional false} ms/PositiveInt]
       [:name {:optional true} native-query-snippets/NativeQuerySnippetName]
       [:content {:optional true} :string]]]
  (api/read-check :model/NativeQuerySnippet id)
  (let [original (t2/select-one :model/NativeQuerySnippet id)
        _ (when (and snippet-name
                     (not= snippet-name (:name original))
                     (t2/exists? :model/NativeQuerySnippet :name snippet-name))
            (throw (ex-info (tru "A snippet with that name already exists. Please pick a different name.")
                            {:status-code 400})))
        snippet (cond-> (m/assoc-some original
                                      :lib/type :metadata/native-query-snippet
                                      :name snippet-name
                                      :content content)
                  content native-query-snippets/add-template-tags)
        breakages (dependencies/errors-from-proposed-edits {:snippet [snippet]})]
    (broken-cards-response breakages)))

(def ^:private entity-keys
  {:table [:name :description :display_name :db_id :db :schema :fields]
   :card [:name :type :display :database_id :view_count
          :created_at :creator :creator_id :description
          :result_metadata :last-edit-info
          :collection :collection_id :dashboard :dashboard_id
          :moderation_reviews]
   :snippet [:name :description]
   :transform [:name :description :table]
   :dashboard [:name :description :view_count
               :created_at :creator :creator_id :last-edit-info
               :collection :collection_id
               :moderation_reviews]
   :document [:name :description :view_count
              :created_at :creator
              :collection :collection_id]
   :sandbox [:table :table_id]})

(defn- format-subentity [entity]
  (case (t2/model entity)
    :model/Collection (select-keys entity [:id :name :authority_level :is_personal])
    :model/Dashboard (select-keys entity [:id :name])
    entity))

(defn- entity-value [entity-type {:keys [id] :as entity} usages]
  {:id id
   :type entity-type
   :data (->> (select-keys entity (entity-keys entity-type))
              (m/map-vals format-subentity))
   :dependents_count (usages [entity-type id])})

(def ^:private entity-model
  {:table :model/Table
   :card :model/Card
   :snippet :model/NativeQuerySnippet
   :transform :model/Transform
   :dashboard :model/Dashboard
   :document :model/Document
   :sandbox :model/Sandbox})

(defn- readable-node?
  "Check if the user can read the entity represented by `[entity-type entity-id]`."
  [[entity-type entity-id]]
  (if-let [model (entity-model entity-type)]
    (try
      (mi/can-read? model entity-id)
      (catch Exception e
        (log/debugf e "Couldn't determine if %s with id %s is readble"
                    (some-> entity-type name) entity-id)
        false))
    (do
      (log/warn "Cannot determine the model of" (some-> entity-type name))
      false)))

(defn- readable-graph-dependencies
  "Return a permission-aware dependency graph that only includes readable entities."
  []
  (dependency/filtered-graph-dependencies readable-node?))

(defn- readable-graph-dependents
  "Return a permission-aware dependent graph that only includes readable entities."
  []
  (dependency/filtered-graph-dependents readable-node?))

(defn- calc-usages
  "Calculates the count of direct dependents for all nodes in `nodes`, based on `graph`. "
  [graph nodes]
  (let [children-map (graph/children-of graph nodes)
        all-cards (->> (vals children-map)
                       (apply concat)
                       distinct
                       (keep #(when (= (first %) :card)
                                (second %))))
        card->type (when (seq all-cards)
                     (t2/select-fn->fn :id :type [:model/Card :id :type :card_schema] :id [:in all-cards]))]
    (m/map-vals (fn [children]
                  (->> children
                       (map (fn [[entity-type entity-id]]
                              (let [dependency-type (if (= entity-type :card)
                                                      (card->type entity-id)
                                                      entity-type)]
                                {dependency-type 1})))
                       (apply merge-with +)))
                children-map)))

(defn- expanded-nodes [downstream-graph nodes]
  (let [usages (calc-usages downstream-graph nodes)
        nodes-by-type (->> (group-by first nodes)
                           (m/map-vals #(map second %)))]
    (mapcat (fn [[entity-type entity-ids]]
              (->> (cond-> (t2/select (entity-model entity-type)
                                      :id [:in entity-ids])
                     (= entity-type :card)      (-> (t2/hydrate :creator :dashboard [:collection :is_personal] :moderation_reviews)
                                                    (->> (map collection.root/hydrate-root-collection))
                                                    (revisions/with-last-edit-info :card))
                     (= entity-type :table)     (t2/hydrate :fields :db)
                     (= entity-type :transform) (t2/hydrate :table-with-db-and-fields)
                     (= entity-type :dashboard) (-> (t2/hydrate :creator [:collection :is_personal] :moderation_reviews)
                                                    (->> (map collection.root/hydrate-root-collection))
                                                    (revisions/with-last-edit-info :dashboard))
                     (= entity-type :document)  (-> (t2/hydrate :creator [:collection :is_personal])
                                                    (->> (map collection.root/hydrate-root-collection)))
                     (= entity-type :sandbox)   (t2/hydrate [:table :db :fields]))
                   (mapv #(entity-value entity-type % usages))))
            nodes-by-type)))

(api.macros/defendpoint :get "/graph"
  "This endpoint takes an :id and a supported entity :type, and returns a graph of all its upstream dependencies.
  The graph is represented by a list of :nodes and a list of :edges. Each node has an :id, :type, :data (which
  depends on the node type), and a map of :dependent_counts per entity type. Each edge is a :model/Dependency"
  [_route-params
   {:keys [id type]} :- [:map
                         [:id {:optional true} ms/PositiveInt]
                         [:type {:optional true} (ms/enum-decode-keyword (vec (keys entity-model)))]]]
  (api/read-check (entity-model type) id)
  (let [starting-nodes [[type id]]
        upstream-graph (readable-graph-dependencies)
        ;; cache the downstream graph specifically, because between calculating transitive children and calculating
        ;; edges, we'll call this multiple times on the same nodes.
        downstream-graph (graph/cached-graph (readable-graph-dependents))
        nodes (into (set starting-nodes)
                    (graph/transitive upstream-graph starting-nodes))
        edges (graph/calc-edges-between downstream-graph nodes)]
    {:nodes (expanded-nodes downstream-graph nodes)
     :edges edges}))

(def ^:private dependents-args
  [:map
   [:id ms/PositiveInt]
   [:type (ms/enum-decode-keyword (vec (keys entity-model)))]
   [:dependent_type (ms/enum-decode-keyword (vec (keys entity-model)))]
   [:dependent_card_type {:optional true} (ms/enum-decode-keyword
                                           [:question :model :metric])]])

(api.macros/defendpoint :get "/graph/dependents"
  "This endpoint takes an :id, :type, :dependent_type, and an optional :dependent_card_type, and returns a list of
   all that entity's dependents with :dependent_type. If the :dependent_type is :card, the dependents are further
   filtered by :dependent_card_type."
  [_route-params
   {:keys [id type dependent_type dependent_card_type]} :- dependents-args]
  (api/read-check (entity-model type) id)
  (let [downstream-graph (graph/cached-graph (readable-graph-dependents))
        nodes (-> (graph/children-of downstream-graph [[type id]])
                  (get [type id]))]
    (->> (expanded-nodes downstream-graph nodes)
         (filter #(and (= (:type %) dependent_type)
                       (or (not= dependent_type :card)
                           (= (-> % :data :type) dependent_card_type)))))))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/dependencies` routes."
  (handlers/routes
   (api.macros/ns-handler *ns* +auth)))
