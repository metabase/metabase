(ns metabase-enterprise.dependencies.api
  (:require
   [medley.core :as m]
   [metabase-enterprise.dependencies.core :as dependencies]
   [metabase-enterprise.dependencies.models.dependency :as dependency]
   [metabase.analyze.core :as analyze]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.api.util.handlers :as handlers]
   [metabase.collections.models.collection.root :as collection.root]
   [metabase.graph.core :as graph]
   [metabase.lib-be.metadata.jvm :as lib-be.metadata.jvm]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.models.interface :as mi]
   [metabase.native-query-snippets.core :as native-query-snippets]
   [metabase.queries.schema :as queries.schema]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(mr/def ::card-body
  [:map
   [:id              {:optional false} ms/PositiveInt]
   [:dataset_query   {:optional true}  [:maybe ms/Map]]
   [:type            {:optional true}  [:maybe ::queries.schema/card-type]]
   [:result_metadata {:optional true}  [:maybe analyze/ResultsMetadata]]])

(defn- broken-cards-response
  [{:keys [card transform]}]
  (let [broken-card-ids (keys card)
        broken-cards (when (seq broken-card-ids)
                       (-> (t2/select :model/Card :id [:in broken-card-ids])
                           (t2/hydrate [:collection :effective_ancestors] :dashboard)))
        broken-transform-ids (keys transform)
        broken-transforms (when (seq broken-transform-ids)
                            (t2/select :model/Transform :id [:in broken-transform-ids]))]
    {:success   (and (empty? broken-card-ids)
                     (empty? broken-transform-ids))
     :bad_cards (into [] (comp (filter (fn [card]
                                         (if (mi/can-read? card)
                                           card
                                           (do (log/warnf "Eliding broken card %d - not readable by the user" (:id card))
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
  (let [database-id    (-> body :dataset_query :database)
        base-provider  (lib-be.metadata.jvm/application-database-metadata-provider database-id)
        original       (lib.metadata/card base-provider (:id body))
        card           (-> original
                           (assoc :dataset-query (:dataset_query body)
                                  :type          (:type body (:type original)))
                           ;; Remove the old `:result-metadata` from the card, it's likely wrong now.
                           (dissoc :result-metadata)
                           ;; But if the request includes `:result_metadata`, use that. It may be from a native card
                           ;; that's been run before saving the card.
                           (cond-> #_card
                            (:result_metadata body) (assoc :result-metadata (:result_metadata body))))
        edits          {:card [card]}
        breakages      (dependencies/errors-from-proposed-edits base-provider edits)]
    (broken-cards-response breakages)))

(mr/def ::transform-body
  [:map
   [:id     {:optional false} ms/PositiveInt]
   [:name   {:optional true}  :string]
   [:source {:optional true}  [:maybe ms/Map]]
   [:target {:optional true}  [:maybe ms/Map]]])

(api.macros/defendpoint :post "/check_transform"
  "Check a proposed edit to a transform, and return the card, transform, etc. IDs for things that will break."
  [_route-params
   _query-params
   {:keys [id source target] :as _body} :- ::transform-body]
  (let [database-id   (-> source :query :database)
        base-provider (lib-be.metadata.jvm/application-database-metadata-provider database-id)
        original      (lib.metadata/transform base-provider id)
        transform     (-> original
                          (cond-> #_transform source (assoc :source source))
                          (cond-> #_transform target (assoc :target target)))
        edits         {:transform [transform]}
        breakages     (dependencies/errors-from-proposed-edits base-provider edits)]
    (broken-cards-response breakages)))

(api.macros/defendpoint :post "/check_snippet"
  "Check a proposed edit to a native snippet, and return the cards, etc. which will be broken."
  [_route-params
   _query-params
   {:keys [id content], snippet-name :name}
   :- [:map
       [:id      {:optional false} ms/PositiveInt]
       [:name    {:optional true}  native-query-snippets/NativeQuerySnippetName]
       [:content {:optional true}  :string]]]
  (let [original  (t2/select-one :model/NativeQuerySnippet id)
        _         (when (and snippet-name
                             (not= snippet-name (:name original))
                             (t2/exists? :model/NativeQuerySnippet :name snippet-name))
                    (throw (ex-info (tru "A snippet with that name already exists. Please pick a different name.")
                                    {:status-code 400})))
        snippet   (cond-> (m/assoc-some original
                                        :lib/type :metadata/native-query-snippet
                                        :name snippet-name
                                        :content content)
                    content native-query-snippets/add-template-tags)
        breakages (dependencies/errors-from-proposed-edits {:snippet [snippet]})]
    (broken-cards-response breakages)))

(defn- entity-keys [entity-type]
  (case entity-type
    :table [:name :display_name :db_id :schema]
    :card [:name :type :display :database_id]
    :snippet [:name]
    :transform [:name]
    []))

(defn- entity-value [entity-type {:keys [id] :as entity} usages]
  {:id id
   :type entity-type
   :data (select-keys entity (entity-keys entity-type))
   :dependents (usages [entity-type id])})

#_(defn- expanded-entity-keys [entity-type]
    (case entity-type
      :table [:id :name :display_name :description :db_id :schema]
      :card [:id :name :description :type :display :collection_id :dashboard_id]
      :snippet [:id :name :description]
      :transform [:id :name :description]
      []))

(defn- entity-model [entity-type]
  (case entity-type
    :table :model/Table
    :card :model/Card
    :snippet :model/NativeQuerySnippet
    :transform :model/Transform))

#_(defn- fetch-all-entities [entity-type & extra-conditions]
    (apply t2/select-fn-vec
           (fn [entity]
             [entity-type (:id entity)])
           [(entity-model entity-type) :id]
           extra-conditions))

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
              (t2/select-fn-vec #(entity-value entity-type % usages)
                                (entity-model entity-type)
                                :id [:in entity-ids]))
            nodes-by-type)))

(api.macros/defendpoint :get "/graph"
  "TODO: This endpoint is supposed to take an :id and :type of an entity (currently :table, :card, :snippet,
  or :transform) and return the entity with all its upstream and downstream dependencies that should be fetched
  recursively. :edges match our :model/Dependency format. Each node in :nodes has :id, :type, and :data, and :data
  depends on the node type. For :table, there should be :display_name. For :card, there should be :name
  and :type. For :snippet -> :name. For :transform -> :name."
  [_route-params
   {:keys [id type]} :- [:map
                         [:id {:optional true} ms/PositiveInt]
                         [:type {:optional true} (ms/enum-decode-keyword [:table :card :snippet :transform])]]]
  (let [starting-nodes [[type id]]
        upstream-graph (dependency/graph-dependencies)
        ;; cache the downstream graph specifically, because between calculating transitive children and calculating
        ;; edges, we'll call this multiple times on the same nodes.
        downstream-graph (graph/cached-graph (dependency/graph-dependents))
        nodes (-> (into #{} starting-nodes)
                  (into (graph/transitive upstream-graph starting-nodes)))
        edges (graph/calc-edges downstream-graph nodes)]
    {:nodes (expanded-nodes downstream-graph nodes)
     :edges edges}))

(def ^:private dependents-args
  [:map
   [:id ms/PositiveInt]
   [:type (ms/enum-decode-keyword [:table :card :snippet :transform])]
   [:dependent_type (ms/enum-decode-keyword [:table :card :snippet :transform])]
   [:dependent_card_type {:optional true} (ms/enum-decode-keyword
                                           [:question :model :metric])]])

(api.macros/defendpoint :get "/graph/dependents"
  "TODO: This endpoint is supposed to take an :id and :type of an entity (currently :table, :card, :snippet,
  or :transform) and return the entity with all its upstream and downstream dependencies that should be fetched
  recursively. :edges match our :model/Dependency format. Each node in :nodes has :id, :type, and :data, and :data
  depends on the node type. For :table, there should be :display_name. For :card, there should be :name
  and :type. For :snippet -> :name. For :transform -> :name."
  [_route-params
   {:keys [id type dependent_type dependent_card_type]} :- dependents-args]
  (let [downstream-graph (graph/cached-graph (dependency/graph-dependents))
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
