(ns metabase-enterprise.dependencies.api
  (:require
   [clojure.string :as str]
   [metabase-enterprise.dependencies.db :as dependencies.db]
   [metabase-enterprise.dependencies.dependency-types :as deps.dependency-types]
   [metabase-enterprise.dependencies.models.analysis-finding-error :as analysis-finding-error]
   [metabase-enterprise.dependencies.models.dependency :as dependency]
   [metabase-enterprise.dependencies.models.dependency-status :as deps.dependency-status]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.api.util.handlers :as handlers]
   [metabase.collections.models.collection.root :as collection.root]
   [metabase.documents.schema :as documents.schema]
   [metabase.graph.core :as graph]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.request.core :as request]
   [metabase.revisions.core :as revisions]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(def ^:private entity-keys
  {:table     [:name :description :display_name :db_id :db :schema :fields :transform
               :owner :owner_user_id :owner_email]
   :card      [:name :type :display :database_id :view_count :query_type
               :created_at :creator :creator_id :description
               :result_metadata :last-edit-info
               :collection :collection_id :dashboard :dashboard_id :document :document_id]
   :snippet   [:name :description :created_at :creator :creator_id :collection :collection_id]
   :transform [:name :description :creator :table :last_run
               :owner :owner_user_id :owner_email]
   :dashboard [:name :description :view_count
               :created_at :creator :creator_id :last-edit-info
               :collection :collection_id
               :moderation_reviews]
   :document  [:name :description :view_count
               :created_at :creator
               :collection :collection_id]
   :sandbox   [:table :table_id]
   :segment   [:name :description :created_at :creator :creator_id :table :table_id]
   :measure   [:name :description :created_at :creator :creator_id :table :table_id]})

(defn- format-subentity [entity]
  (case (t2/model entity)
    :model/Collection (select-keys entity [:id :name :authority_level :is_personal])
    :model/Dashboard  (select-keys entity [:id :name])
    :model/Document   (select-keys entity [:id :name])
    entity))

(mr/def ::usages
  [:map-of
   [:enum :table :snippet :transform :dashboard :document :sandbox :segment :question :model :metric :measure]
   ::deps.dependency-types/entity-id])

(mr/def ::base-entity
  [:map
   [:id                pos-int?]
   [:type              :keyword]
   [:data              [:map]]
   [:dependents_count  [:maybe [:ref ::usages]]]
   [:dependents_errors {:optional true} [:set [:ref ::analysis-finding-error/analysis-finding-error]]]])

(defn- fields-for [entity-key]
  ;; these specs should really use something like
  #_[:data [:select-keys [:ref :blah/table] (entity-keys :table)]]
  ;; but :select-keys seems to mess up open-api spec generation
  (into [:map]
        (map (fn [key] [key {:optional true} :any]))
        (entity-keys entity-key)))

(mr/def ::table-entity
  [:merge ::base-entity
   [:map
    [:id   ::lib.schema.id/table]
    [:type [:= :table]]
    [:data (fields-for :table)]]])

(mr/def ::card-entity
  [:merge ::base-entity
   [:map
    [:id   ::lib.schema.id/card]
    [:type [:= :card]]
    [:data (fields-for :card)]]])

(mr/def ::snippet-entity
  [:merge ::base-entity
   [:map
    [:id   ::lib.schema.id/snippet]
    [:type [:= :snippet]]
    [:data (fields-for :snippet)]]])

(mr/def ::transform-entity
  [:merge ::base-entity
   [:map
    [:id   ::lib.schema.id/transform]
    [:type [:= :transform]]
    [:data (fields-for :transform)]]])

(mr/def ::dashboard-entity
  [:merge ::base-entity
   [:map
    [:id ::lib.schema.id/dashboard]
    [:type [:= :dashboard]]
    [:data (fields-for :dashboard)]]])

(mr/def ::document-entity
  [:merge ::base-entity
   [:map
    [:id   ::documents.schema/document.id]
    [:type [:= :document]]
    [:data (fields-for :document)]]])

(mr/def ::sandbox-entity
  [:merge ::base-entity
   [:map
    [:id   ::lib.schema.id/sandbox]
    [:type [:= :sandbox]]
    [:data (fields-for :sandbox)]]])

(mr/def ::segment-entity
  [:merge ::base-entity
   [:map
    [:id   ::lib.schema.id/segment]
    [:type [:= :segment]]
    [:data (fields-for :card)]]])

(mr/def ::measure-entity
  [:merge ::base-entity
   [:map
    [:id   ::lib.schema.id/measure]
    [:type [:= :measure]]
    [:data (fields-for :measure)]]])

(mr/def ::entity
  [:multi {:dispatch :type}
   [:table     [:ref ::table-entity]]
   [:card      [:ref ::card-entity]]
   [:snippet   [:ref ::snippet-entity]]
   [:transform [:ref ::transform-entity]]
   [:dashboard [:ref ::dashboard-entity]]
   [:document  [:ref ::document-entity]]
   [:sandbox   [:ref ::sandbox-entity]]
   [:segment   [:ref ::segment-entity]]
   [:measure   [:ref ::measure-entity]]])

(mu/defn- entity-value :- ::entity
  [entity-type {:keys [id] :as entity} usages errors]
  (cond-> {:id id
           :type entity-type
           :data (-> (select-keys entity (entity-keys entity-type))
                     (update-vals format-subentity))
           :dependents_count (usages [entity-type id])}
    errors (assoc :dependents_errors (get errors [entity-type id]))))

;; IMPORTANT: This map defines which fields to select when fetching entities for the dependency graph.
;; These field lists MUST be kept in sync with the frontend type definitions in:
;; frontend/src/metabase-types/api/dependencies.ts
;; (See CardDependencyNodeData, DashboardDependencyNodeData, etc.)
;;
;; Note: Some fields (like :creator, :collection) are added via t2/hydrate,
;; and others (like :last-edit-info) are computed/added separately.
;; This map only lists the base database columns to SELECT.
(def ^:private entity-select-fields
  {:card      [:id :name :description :type :display :database_id :query_type :collection_id :dashboard_id :document_id :result_metadata
               :created_at :creator_id :view_count
               ;; :card_schema always has to be selected
               :card_schema]
   :dashboard [:id :name :description :created_at :creator_id :collection_id :view_count]
   :document  [:id :name :created_at :creator_id :collection_id :view_count]
   :table     [:id :name :description :display_name :db_id :schema
               :owner_user_id :owner_email :transform_id]
   :transform [:id :name :description :creator_id
               ;; :source has to be selected otherwise the BE won't know what DB it belongs to
               :source
               :owner_user_id :owner_email]
   :snippet   [:id :name :description :created_at :creator_id :collection_id]
   :sandbox   [:id :table_id]
   :segment   [:id :name :description :created_at :creator_id :table_id]
   :measure   [:id :name :description :created_at :creator_id :table_id]})

(defn- current-user-visibility
  "The current user, as the `:visible` filter-spec opts consumed by `metabase-enterprise.dependencies.db`."
  [{:keys [include-archived-items]}]
  (cond-> {:user-id api/*current-user-id* :is-superuser? api/*is-superuser?* :is-data-analyst? api/*is-data-analyst?*}
    include-archived-items (assoc :include-archived-items include-archived-items)))

(defn- readable-graph-dependencies
  ([]
   (readable-graph-dependencies nil))
  ([opts]
   (dependency/filtered-graph-dependencies {:visible (current-user-visibility opts)})))

(defn- readable-graph-dependents
  ([]
   (readable-graph-dependents nil))
  ([{:keys [include-archived-items broken] :or {include-archived-items :exclude}}]
   (dependency/filtered-graph-dependents
    (cond-> {:visible (current-user-visibility {:include-archived-items include-archived-items})}
      broken (assoc :broken? true)))))

(defn- node-usages
  "Calculates the count of direct dependents for all nodes in `nodes`, based on `graph`. "
  [graph nodes]
  (let [children-map (graph/children-of graph nodes)
        all-cards (->> (vals children-map)
                       (apply concat)
                       distinct
                       (keep #(when (= (first %) :card)
                                (second %))))
        card->type (when (seq all-cards)
                     (dependencies.db/card-types-by-id all-cards))]
    (update-vals children-map
                 (fn [children]
                   (->> children
                        (map (fn [[entity-type entity-id]]
                               (let [dependency-type (if (= entity-type :card)
                                                       (card->type entity-id)
                                                       entity-type)]
                                 {dependency-type 1})))
                        (apply merge-with +))))))

(defn- node-downstream-errors
  "Fetches errors caused by the given source entities (what downstream entities they're breaking).
   Filters out errors where the analyzed entity is not visible to the current user.
   Unlike `node-errors` which fetches errors on an entity, this fetches errors that
   the entity is causing in other entities that depend on it."
  [nodes-by-type]
  (letfn [(errors-by-source-type-and-id [[source-type ids]]
            (when (seq ids)
              (let [finding-errors (dependencies.db/finding-errors-from-sources
                                    source-type ids (current-user-visibility nil))]
                (u/group-by (juxt :source_entity_type :source_entity_id)
                            identity conj #{} finding-errors))))]
    (->> nodes-by-type
         (into {} (mapcat errors-by-source-type-and-id))
         not-empty)))

(defn- node-errors
  "Fetches and normalizes AnalysisFindingErrors for the given entities.
   Filters out errors where the source entity is not visible to the current user.
   Returns {[entity-type entity-id] #{error-maps...}}, or nil if none."
  [nodes-by-type]
  (letfn [(normalize-finding-error
            [{:keys [error_type error_detail]}]
            (cond-> {:type error_type}
              error_detail (assoc :detail error_detail)))
          (errors-by-entity-type-and-id [[type ids]]
            (when (seq ids)
              (let [finding-errors (dependencies.db/finding-errors-for-entities-with-visible-sources
                                    type ids (current-user-visibility nil))]
                (u/group-by (juxt :analyzed_entity_type :analyzed_entity_id)
                            normalize-finding-error conj #{} finding-errors))))]
    (->> nodes-by-type
         (into {} (mapcat errors-by-entity-type-and-id))
         not-empty)))

(defn- hydrate-entities [entity-type entities]
  (case entity-type
    :card (-> entities
              (t2/hydrate :creator :dashboard :document [:collection :is_personal])
              (->> (map collection.root/hydrate-root-collection))
              (revisions/with-last-edit-info :card))
    :table (t2/hydrate entities :fields :db :transform :owner)
    :transform (-> entities
                   (t2/hydrate :creator :table-with-db-and-fields :last_run :collection :owner)
                   (->> (map #(collection.root/hydrate-root-collection % (collection.root/hydrated-root-collection :transforms)))))
    :dashboard (-> entities
                   (t2/hydrate :creator [:collection :is_personal])
                   (->> (map collection.root/hydrate-root-collection))
                   (revisions/with-last-edit-info :dashboard))
    :document (-> entities
                  (t2/hydrate :creator [:collection :is_personal])
                  (->> (map collection.root/hydrate-root-collection)))
    :sandbox (t2/hydrate entities [:table :db :fields])
    :snippet (-> entities
                 (t2/hydrate :creator :collection)
                 (->> (map #(collection.root/hydrate-root-collection % (collection.root/hydrated-root-collection :snippets)))))
    (:segment :measure) (t2/hydrate entities :creator [:table :db])))

(defn- fetch-and-hydrate-nodes
  "Fetches and hydrates entities for the given nodes.
   Returns a map from [entity-type entity-id] -> hydrated entity."
  [nodes-by-type]
  (into {}
        (mapcat (fn [[entity-type entity-ids]]
                  (when (seq entity-ids)
                    (let [fields (entity-select-fields entity-type)]
                      (->> (dependencies.db/instances-with-columns entity-type fields entity-ids)
                           (hydrate-entities entity-type)
                           (map (fn [entity]
                                  [[entity-type (:id entity)] entity])))))))
        nodes-by-type))

(defn- expanded-nodes [downstream-graph nodes {:keys [include-errors?]}]
  (let [usages (node-usages downstream-graph nodes)
        nodes-by-type (-> (group-by first nodes)
                          (update-vals #(map second %)))
        errors (when include-errors?
                 (node-errors nodes-by-type))
        hydrated-entities (fetch-and-hydrate-nodes nodes-by-type)
        nodes-by-type-and-id
        (into {}
              (map (fn [[node-key entity]]
                     [node-key (entity-value (first node-key) entity usages errors)]))
              hydrated-entities)]
    (keep nodes-by-type-and-id nodes)))

(mr/def ::graph-response
  [:map
   [:nodes [:sequential ::entity]]
   [:edges [:sequential [:map
                         [:from_entity_type ::deps.dependency-types/dependency-types]
                         [:from_entity_id ::deps.dependency-types/entity-id]
                         [:to_entity_type ::deps.dependency-types/dependency-types]
                         [:to_entity_id ::deps.dependency-types/entity-id]]]]])

(api.macros/defendpoint :get "/graph" :- ::graph-response
  "This endpoint takes an :id and a supported entity :type, and returns a graph of all its upstream dependencies.
  The graph is represented by a list of :nodes and a list of :edges. Each node has an :id, :type, :data (which
  depends on the node type), and a map of :dependent_counts per entity type. Each edge is a :model/Dependency."
  [_route-params
   {:keys [id type]} :- [:map
                         [:id {:optional true} ms/PositiveInt]
                         [:type {:optional true} ::deps.dependency-types/dependency-types]]]
  (api/read-check (deps.dependency-types/dependency-type->model type) id)
  (let [starting-nodes [[type id]]
        upstream-graph (readable-graph-dependencies {:include-archived-items :all})
        downstream-graph (graph/cached-graph (readable-graph-dependents))
        edge-graph (graph/cached-graph (readable-graph-dependents {:include-archived-items :all}))
        nodes (into (set starting-nodes)
                    (graph/transitive upstream-graph starting-nodes))
        edges (graph/edges-between edge-graph nodes)]
    {:nodes (expanded-nodes downstream-graph nodes {:include-errors? false})
     :edges edges}))

(def ^:private sort-directions
  "Valid sort directions for dependency item endpoints."
  #{:asc :desc})

(def ^:private dependents-sort-columns
  "Valid sort columns for the /graph/dependents endpoint."
  #{:name :location :view-count})

(defn- entity-name
  "Returns the name string for an entity based on its type. Might return nil."
  [entity]
  (let [data (:data entity)]
    (case (:type entity)
      :table   (:display_name data)
      :sandbox nil
      (:name data))))

(defn- entity-location
  "Returns the location string for an entity based on its type. Might return nil."
  [entity]
  (let [data (:data entity)]
    (case (:type entity)
      :card                                      (or (-> data :dashboard :name)
                                                     (-> data :document :name)
                                                     (-> data :collection :name))
      :table                                     (-> data :db :name)
      (:transform :snippet :dashboard :document) (-> data :collection :name)
      :sandbox                                   nil
      (:segment :measure)                        (-> data :table :display_name)
      nil)))

(defn- string-matches-query?
  "Returns true if `s` is a string and its lower-case version contains the string `query`.
  `query` is expected to be lower-case."
  [s query]
  (some-> s u/lower-case-en (str/includes? query)))

(defn- entity-matches-query?
  "Returns true if `entity`'s name or location contains the string `query` (case-insensitive)."
  [entity query]
  (let [q (u/lower-case-en query)]
    (or (string-matches-query? (entity-name entity) q)
        (string-matches-query? (entity-location entity) q))))

(defn- in-personal-collection?
  "Returns true if `entity` is in a personal collection."
  [entity]
  (get-in entity [:data :collection :is_personal]))

(defn- sort-dependents
  "Sort `entities` by `sort-column` in `sort-direction`."
  [entities sort-column sort-direction]
  (let [key-fn  (case sort-column
                  :name       #(some-> (entity-name %) u/lower-case-en)
                  :location   #(some-> (entity-location %) u/lower-case-en)
                  :view-count #(or (-> % :data :view_count) 0))
        comp-fn (cond->> compare
                  (= sort-direction :desc) (comp -))]
    (sort-by key-fn comp-fn entities)))

(def ^:private dependents-args
  [:map
   [:id                            ms/PositiveInt]
   [:type                          ::deps.dependency-types/dependency-types]
   [:dependent-types               {:optional true}
    [:or
     ::deps.dependency-types/dependency-types
     [:sequential ::deps.dependency-types/dependency-types]]]
   [:dependent-card-types          {:optional true}
    [:or
     (ms/enum-decode-keyword lib.schema.metadata/card-types)
     [:sequential (ms/enum-decode-keyword lib.schema.metadata/card-types)]]]
   [:broken                        {:optional true} :boolean]
   [:query                         {:optional true} :string]
   [:include-personal-collections  {:optional true} :boolean]
   [:sort-column                   {:optional true} (ms/enum-decode-keyword dependents-sort-columns)]
   [:sort-direction                {:optional true} (ms/enum-decode-keyword sort-directions)]])

(api.macros/defendpoint :get "/graph/dependents" :- [:sequential ::entity]
  "Returns a list of dependents for the specified entity.

   Required parameters:
   - `id`: The ID of the entity
   - `type`: The type of the entity (card, table, dashboard, etc.)

   Optional parameters:
   - `dependent-types`: Dependency types to filter by. Can be single value or array.
     If not provided, returns all types. Example: ?dependent-types=card&dependent-types=dashboard
   - `dependent-card-types`: Card types to filter by when dependent-types includes :card.
     Ignored if dependent-types doesn't include :card. Example: ?dependent-card-types=question&dependent-card-types=model
   - `broken`: Return only broken entities (default: false)
   - `query`: Search string to filter results by name or location (case-insensitive)
   - `include-personal-collections`: Include items in personal collections (default: false)
   - `sort-column`: Column to sort by - name, location, or view-count (default: name)
   - `sort-direction`: Sort direction - asc or desc (default: asc)"
  [_route-params
   {:keys [id type dependent-types dependent-card-types broken
           query include-personal-collections sort-column sort-direction]
    :or {include-personal-collections false
         sort-column :name
         sort-direction :asc}} :- dependents-args]
  (api/read-check (deps.dependency-types/dependency-type->model type) id)
  (let [downstream-graph (graph/cached-graph (readable-graph-dependents {:broken broken}))
        nodes (-> (graph/children-of downstream-graph [[type id]])
                  (get [type id]))
        dep-types-set (cond
                        (nil? dependent-types) deps.dependency-types/dependency-types
                        (sequential? dependent-types) (set dependent-types)
                        :else #{dependent-types})
        card-types-set (cond
                         (nil? dependent-card-types) lib.schema.metadata/card-types
                         (sequential? dependent-card-types) (set dependent-card-types)
                         :else #{dependent-card-types})
        dependents-filter
        (comp
         ;; Filter by dependent types and card types
         (filter (fn [node]
                   (and (or (nil? dep-types-set)
                            (contains? dep-types-set (:type node)))
                        (or (not= (:type node) :card)
                            (nil? card-types-set)
                            (contains? card-types-set (-> node :data :type))))))
         ;; Filter out personal collections unless explicitly included
         (if include-personal-collections
           identity
           (remove in-personal-collection?))
         ;; Filter by query (sandboxes are excluded since they have no name or location)
         (if query
           (filter #(entity-matches-query? % query))
           identity))]
    (-> (into [] dependents-filter (expanded-nodes downstream-graph nodes {:include-errors? false}))
        (sort-dependents sort-column sort-direction))))

(def ^:private breaking-items-sort-columns
  "Valid sort columns for /graph/broken and /graph/unreferenced endpoints."
  #{:name :location :dependents-with-errors :dependents-errors})

(def ^:private dependency-items-args
  [:map
   [:types {:optional true} [:or
                             ::deps.dependency-types/dependency-types
                             [:sequential ::deps.dependency-types/dependency-types]]]
   [:card-types {:optional true} [:or
                                  (ms/enum-decode-keyword lib.schema.metadata/card-types)
                                  [:sequential (ms/enum-decode-keyword lib.schema.metadata/card-types)]]]
   [:query {:optional true} :string]
   [:include-personal-collections {:optional true} :boolean]
   [:sort-column {:optional true} (ms/enum-decode-keyword breaking-items-sort-columns)]
   [:sort-direction {:optional true} (ms/enum-decode-keyword sort-directions)]])

(def ^:private dependency-items-response
  [:map
   [:data [:sequential ::entity]]
   [:total nat-int?]
   [:offset nat-int?]
   [:limit ms/PositiveInt]])

(api.macros/defendpoint :get "/graph/unreferenced" :- dependency-items-response
  "Returns a list of all unreferenced items in the instance.
   An unreferenced item is one that is not a dependency of any other item.

   Accepts optional parameters for filtering:
   - `types`: List of entity types to include (e.g., [:card :transform :snippet :dashboard])
   - `card-types`: List of card types to include when filtering cards (e.g., [:question :model :metric])
   - `query`: Search string to filter by name or location
   - `include-personal-collections`: Controls whether items in personal collections are included (default: false)
   - `sort-column`: Sort column - `:name`, `:location`, `:dependents-errors`, or `:dependents-with-errors` (default: `:name`)
   - `sort-direction`: Sort direction - `:asc` or `:desc` (default: `:asc`)
   - `offset`: Default 0
   - `limit`: Default 50

   Returns a map with:
   - `data`: List of unreferenced items, each with `:id`, `:type`, and `:data` fields
   - `total`: Total count of matched items
   - `offset`: Applied offset
   - `limit`: Applied limit"
  [_route-params
   {:keys [types card-types query include-personal-collections sort-column sort-direction]
    :or {types (vec deps.dependency-types/dependency-types)
         card-types (vec lib.schema.metadata/card-types)
         include-personal-collections false
         sort-column :name
         sort-direction :asc}} :- dependency-items-args]
  (let [offset (or (request/offset) 0)
        limit (or (request/limit) 50)
        selected-types (cond->> (if (sequential? types) types [types])
                         ;; Sandboxes don't support query filtering, so exclude them when a query is provided
                         query (remove #{:sandbox}))
        card-types (if (sequential? card-types) card-types [card-types])
        item-params (merge (current-user-visibility nil)
                           {:query-type :unreferenced
                            :entity-types selected-types
                            :card-types card-types
                            :search-text query
                            :include-personal-collections? include-personal-collections
                            :sort-column sort-column
                            :sort-direction sort-direction
                            :offset offset
                            :limit limit})
        all-ids (dependencies.db/dependency-item-ids item-params)
        downstream-graph (graph/cached-graph (readable-graph-dependents))
        total (dependencies.db/dependency-item-count item-params)]
    {:data   (expanded-nodes downstream-graph all-ids {:include-errors? false})
     :limit  limit
     :offset offset
     :total  total}))

(api.macros/defendpoint :get "/graph/breaking" :- dependency-items-response
  "Returns a list of entities that are breaking other entities (sources of errors).
   These are tables or cards that other entities depend on, where those dependents
   have validation errors traced back to this source entity.

   Accepts optional parameters for filtering:
   - `types`: List of source entity types - only `:card` or `:table` (default: both)
   - `card-types`: List of card types to include when filtering cards (e.g., `[:question :model :metric]`)
   - `query`: Search string to filter by name or location
   - `include-personal-collections`: Controls whether items in personal collections are included (default: false)
   - `sort-column`: Sort column - `:name`, `:location`, `:dependents-errors`, or `:dependents-with-errors` (default: `:name`)
   - `sort-direction`: Sort direction - `:asc` or `:desc` (default: `:asc`)
   - `offset`: Default 0
   - `limit`: Default 50

   Returns a map with:
   - `data`: List of breaking source entities
   - `total`: Total count of matched items
   - `offset`: Applied offset
   - `limit`: Applied limit"
  [_route-params
   {:keys [types card-types query include-personal-collections sort-column sort-direction]
    :or {types [:card :table]
         card-types (vec lib.schema.metadata/card-types)
         include-personal-collections false
         sort-column :name
         sort-direction :asc}} :- dependency-items-args]
  (let [offset (or (request/offset) 0)
        limit (or (request/limit) 50)
        selected-types (cond->> (if (sequential? types) types [types])
                         ;; Sandboxes don't support query filtering, so exclude them when a query is provided
                         query (remove #{:sandbox}))
        card-types (if (sequential? card-types) card-types [card-types])
        item-params (merge (current-user-visibility nil)
                           {:query-type :breaking
                            :entity-types selected-types
                            :card-types card-types
                            :search-text query
                            :include-personal-collections? include-personal-collections
                            :sort-column sort-column
                            :sort-direction sort-direction
                            :offset offset
                            :limit limit})
        all-ids (dependencies.db/dependency-item-ids item-params)
        downstream-graph (graph/cached-graph (readable-graph-dependents))
        nodes-by-type (u/group-by first second all-ids)
        downstream-errors (node-downstream-errors nodes-by-type)
        total (dependencies.db/dependency-item-count item-params)
        usages (node-usages downstream-graph all-ids)
        fetch-entity (fn [entity-type entity-id]
                       (let [fields (entity-select-fields entity-type)]
                         (dependencies.db/instance-with-columns entity-type fields entity-id)))
        data (into []
                   (keep (fn [[entity-type entity-id]]
                           (when-let [entity (fetch-entity entity-type entity-id)]
                             (let [hydrated (first (hydrate-entities entity-type [entity]))]
                               (entity-value entity-type hydrated usages downstream-errors)))))
                   all-ids)]
    {:data   data
     :offset offset
     :limit  limit
     :total  total}))

(def ^:private broken-dependents-args
  [:map
   [:id                            ms/PositiveInt]
   [:type                          ::deps.dependency-types/dependency-types]
   [:dependent-types               {:optional true}
    [:or
     ::deps.dependency-types/dependency-types
     [:sequential ::deps.dependency-types/dependency-types]]]
   [:dependent-card-types          {:optional true}
    [:or
     (ms/enum-decode-keyword lib.schema.metadata/card-types)
     [:sequential (ms/enum-decode-keyword lib.schema.metadata/card-types)]]]
   [:include-personal-collections  {:optional true} :boolean]
   [:sort-column                   {:optional true} (ms/enum-decode-keyword dependents-sort-columns)]
   [:sort-direction                {:optional true} (ms/enum-decode-keyword sort-directions)]])

(mr/def ::broken-dependent-entity
  "Entity returned by /graph/broken endpoint - includes errors but no dependents_count."
  [:map
   [:id   pos-int?]
   [:type :keyword]
   [:data [:map]]])

(api.macros/defendpoint :get "/graph/broken" :- [:sequential ::broken-dependent-entity]
  "Returns the broken dependents for a specific source entity.
   These are entities that have validation errors traced back to the specified source.

   Required parameters:
   - `id`: The ID of the source entity
   - `type`: The type of the source entity (card, table)

   Optional parameters:
   - `dependent-types`: Dependency types to filter by. Can be single value or array.
   - `dependent-card-types`: Card types to filter by when dependent-types includes :card.
   - `include-personal-collections`: Include items in personal collections (default: false)
   - `sort-column`: Column to sort by - name, location, or view-count (default: name)
   - `sort-direction`: Sort direction - asc or desc (default: asc)"
  [_route-params
   {:keys [id dependent-types dependent-card-types include-personal-collections sort-column sort-direction]
    entity-type :type
    :or {include-personal-collections false
         sort-column :name
         sort-direction :asc}} :- broken-dependents-args]
  (api/read-check (deps.dependency-types/dependency-type->model entity-type) id)
  (let [normalize-types (fn normalize-types [types]
                          (if (keyword? types)
                            [(name types)]
                            (not-empty (map name types))))
        dep-types (normalize-types dependent-types)
        card-types (normalize-types dependent-card-types)
        broken-pairs (dependencies.db/broken-entity-pairs
                      (merge (current-user-visibility nil)
                             {:source-entity-type entity-type
                              :source-entity-id id
                              :dependent-types dep-types
                              :dependent-card-types card-types}))
        nodes (map (fn [{:keys [entity_type entity_id]}]
                     [(keyword entity_type) entity_id])
                   broken-pairs)
        nodes-by-type (-> (group-by first nodes)
                          (update-vals #(map second %)))]
    (-> (into [] (cond-> (map (fn [[[entity-type entity-id] entity]]
                                {:id entity-id
                                 :type entity-type
                                 :data (-> (select-keys entity (entity-keys entity-type))
                                           (update-vals format-subentity))}))
                   (not include-personal-collections) (comp (remove in-personal-collection?)))
              (fetch-and-hydrate-nodes nodes-by-type))
        (sort-dependents sort-column sort-direction))))

(api.macros/defendpoint :get "/backfill-status" :- [:map
                                                    [:complete :boolean]]
  "Returns whether the dependency backfill has pending work.
  `complete` is true when there are no stale or outdated entities awaiting processing."
  [_route-params _query-params]
  {:complete (not (deps.dependency-status/has-stale-or-outdated?))})

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/dependencies` routes."
  (handlers/routes
   (api.macros/ns-handler *ns* +auth)))
