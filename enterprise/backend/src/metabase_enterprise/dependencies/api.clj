(ns metabase-enterprise.dependencies.api
  (:require
   [medley.core :as m]
   [metabase-enterprise.dependencies.core :as dependencies]
   [metabase-enterprise.dependencies.dependency-types :as deps.dependency-types]
   [metabase-enterprise.dependencies.models.dependency :as dependency]
   [metabase-enterprise.transforms.schema :as transforms.schema]
   [metabase.analyze.core :as analyze]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.api.util.handlers :as handlers]
   [metabase.app-db.core :as mdb]
   [metabase.collections.models.collection :as collection]
   [metabase.collections.models.collection.root :as collection.root]
   [metabase.documents.schema :as documents.schema]
   [metabase.graph.core :as graph]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.lib.schema.validate :as lib.schema.validate]
   [metabase.models.interface :as mi]
   [metabase.native-query-snippets.core :as native-query-snippets]
   [metabase.permissions.core :as perms]
   [metabase.queries.schema :as queries.schema]
   [metabase.request.current :as request]
   [metabase.revisions.core :as revisions]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]
   [toucan2.util :as u]))

(mr/def ::card-body
  [:merge
   ::queries.schema/card
   ;; TODO (Cam 10/1/25) -- merge this into `::queries.schema/card` itself
   [:map
    [:result_metadata {:optional true} [:maybe analyze/ResultsMetadata]]]])

(mr/def ::broken-cards-response
  [:map
   [:success :boolean]
   [:bad_cards {:optional true} [:sequential ::queries.schema/card]]
   [:bad_transforms {:optional true} [:sequential ::transforms.schema/transform]]])

(mu/defn- broken-cards-response :- ::broken-cards-response
  [{:keys [card transform]}]
  (let [broken-card-ids (keys card)
        broken-cards (when (seq broken-card-ids)
                       (-> (t2/select :model/Card :id [:in broken-card-ids])
                           (t2/hydrate [:collection :effective_ancestors] :dashboard :document)))
        broken-transform-ids (keys transform)
        broken-transforms (when (seq broken-transform-ids)
                            (t2/select :model/Transform :id [:in broken-transform-ids]))]
    {:success (and (empty? broken-card-ids)
                   (empty? broken-transform-ids))
     :bad_cards (into [] (comp (filter mi/can-read?)
                               (map (fn [card]
                                      (-> card
                                          collection.root/hydrate-root-collection
                                          (update :dashboard #(some-> % (select-keys [:id :name])))
                                          (update :document #(some-> % (select-keys [:id :name])))))))
                      broken-cards)
     :bad_transforms (into [] broken-transforms)}))

;; TODO (Cam 10/28/25) -- fix this endpoint route to use kebab-case for consistency with the rest of our REST API
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-route-uses-kebab-case]}
(api.macros/defendpoint :post "/check_card" :- ::broken-cards-response
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
   [:id     {:optional false} ::lib.schema.id/transform]
   [:name   {:optional true} :string]
   ;; TODO (Cam 10/8/25) -- no idea what the correct schema for these is supposed to be -- it was just `map` before --
   ;; this is my attempt to guess it
   [:source {:optional true} [:maybe [:map
                                      [:type {:optional true} :keyword]
                                      [:query {:optional true} ::queries.schema/query]]]]
   [:target {:optional true} [:maybe ms/Map]]])

;; TODO (Cam 10/28/25) -- fix this endpoint route to use kebab-case for consistency with the rest of our REST API
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-route-uses-kebab-case]}
(api.macros/defendpoint :post "/check_transform" :- ::broken-cards-response
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

;; TODO (Cam 10/28/25) -- fix this endpoint route to use kebab-case for consistency with the rest of our REST API
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-route-uses-kebab-case]}
(api.macros/defendpoint :post "/check_snippet" :- ::broken-cards-response
  "Check a proposed edit to a native snippet, and return the cards, etc. which will be broken."
  [_route-params
   _query-params
   {:keys [id content], snippet-name :name}
   :- [:map
       [:id      {:optional false} ::lib.schema.id/snippet]
       [:name    {:optional true} native-query-snippets/NativeQuerySnippetName]
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
  {:table     [:name :description :display_name :db_id :db :schema :fields]
   :card      [:name :type :display :database_id :view_count :query_type
               :created_at :creator :creator_id :description
               :result_metadata :last-edit-info
               :collection :collection_id :dashboard :dashboard_id :document :document_id]
   :snippet   [:name :description :created_at :creator :creator_id :collection :collection_id]
   :transform [:name :description :creator :table :last_run]
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

(mr/def ::entity-id pos-int?)

(mr/def ::usages
  [:map-of
   [:enum :table :snippet :transform :dashboard :document :sandbox :segment :question :model :metric :measure]
   ::entity-id])

(mr/def ::base-entity
  [:map
   [:id               pos-int?]
   [:type             :keyword]
   [:data             [:map]]
   [:dependents_count [:maybe [:ref ::usages]]]
   [:errors           {:optional true} [:set [:ref ::lib.schema.validate/error]]]])

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
           :data (->> (select-keys entity (entity-keys entity-type))
                      (m/map-vals format-subentity))
           :dependents_count (usages [entity-type id])}
    errors (assoc :errors (get errors [entity-type id]))))

;; IMPORTANT: This map defines which fields to select when fetching entities for the dependency graph.
;; These field lists MUST be kept in sync with the frontend type definitions in:
;; frontend/src/metabase-types/api/dependencies.ts
;; (See CardDependencyNodeData, DashboardDependencyNodeData, etc.)
;;
;; Note: Some fields (like :creator, :collection) are added via t2/hydrate,
;; and others (like :last-edit-info, :view_count) are computed/added separately.
;; This map only lists the base database columns to SELECT.
(def ^:private entity-select-fields
  {:card      [:id :name :description :type :display :database_id :query_type :collection_id :dashboard_id :document_id :result_metadata
               :created_at :creator_id
               ;; :card_schema always has to be selected
               :card_schema]
   :dashboard [:id :name :description :created_at :creator_id :collection_id]
   :document  [:id :name :created_at :creator_id :collection_id]
   :table     [:id :name :description :display_name :db_id :schema]
   :transform [:id :name :description :creator_id
               ;; :source has to be selected otherwise the BE won't know what DB it belongs to
               :source]
   :snippet   [:id :name :description :created_at :creator_id :collection_id]
   :sandbox   [:id :table_id]
   :segment   [:id :name :description :created_at :creator_id :table_id]
   :measure   [:id :name :description :created_at :creator_id :table_id]})

(defn- visible-entities-filter-clause
  "Returns a HoneySQL WHERE clause for filtering dependency graph entities by user visibility.

  Accepts three arguments:
  - `entity-type-field`: Database column name for entity type (e.g., :to_entity_type)
  - `entity-id-field`: Database column name for entity ID (e.g., :to_entity_id)
  - `include-archived-items`: How to handle archived items (:exclude, :all, :only). Defaults to :exclude.
    This applies to both archived collections AND archived entities (cards/dashboards/documents/snippets/tables).

  Returns a compound [:or ...] clause checking whether entities at those columns are readable.

  Handles different entity types:
  - Superuser-only (:model/Transform, :model/Sandbox): Only if api/*is-superuser?* is true
  - Collection-based (:model/Card, :model/Dashboard, :model/Document, :model/NativeQuerySnippet):
    Uses collection/visible-collection-filter-clause for collection filtering and adds archived entity filtering.
    Native query snippets have additional restrictions for sandboxed users.
  - Table: Uses perms/visible-table-filter-select with appropriate permissions and filters by active/visibility_type.
    Follows search API conventions: active=true AND visibility_type=nil for non-archived tables.
    Note: archived_at is not checked separately as archived tables always have active=false."
  ([entity-type-field entity-id-field]
   (visible-entities-filter-clause entity-type-field entity-id-field nil))
  ([entity-type-field entity-id-field {:keys [include-archived-items] :or {include-archived-items :exclude}}]
   (into [:or]
         (keep (fn [[entity-type model]]
                 (let [table-name (t2/table-name model)
                       id-column (keyword (name table-name) "id")]
                   (case model
                     ;; Superuser-only entities
                     (:model/Transform :model/Sandbox)
                     (when api/*is-superuser?*
                       [:and
                        [:= entity-type-field (name entity-type)]
                        [:in entity-id-field {:select [:id] :from [table-name]}]])

                     ;; Collection-based entities with archived field
                     (:model/Card :model/Dashboard :model/Document :model/NativeQuerySnippet)
                     (let [archived-column (keyword (name table-name) "archived")]
                       (when-not (and (= model :model/NativeQuerySnippet)
                                      (or (perms/sandboxed-user?)
                                          (not (perms/user-has-any-perms-of-type?
                                                api/*current-user-id* :perms/create-queries))))
                         [:and
                          [:= entity-type-field (name entity-type)]
                          [:in entity-id-field {:select [:id]
                                                :from [table-name]
                                                :where [:and
                                                        ;; Filter by collection visibility
                                                        (collection/visible-collection-filter-clause
                                                         (keyword (name table-name) "collection_id")
                                                         {:include-archived-items include-archived-items}
                                                         {:current-user-id api/*current-user-id*
                                                          :is-superuser? api/*is-superuser?*})
                                                        ;; Filter by entity archived status
                                                        (case include-archived-items
                                                          :exclude [:= archived-column false]
                                                          :only    [:= archived-column true]
                                                          :all     nil)]}]]))

                     ;; Table with visible-filter-clause and active/visibility_type filtering
                     :model/Table
                     (let [active-column (keyword (name table-name) "active")
                           visibility-type-column (keyword (name table-name) "visibility_type")]
                       [:and
                        [:= entity-type-field (name entity-type)]
                        [:in entity-id-field {:select [:id]
                                              :from [table-name]
                                              :where [:and
                                                      [:in id-column
                                                       (perms/visible-table-filter-select
                                                        :id
                                                        {:user-id api/*current-user-id*
                                                         :is-superuser? api/*is-superuser?*}
                                                        {:perms/view-data :unrestricted
                                                         :perms/create-queries :query-builder})]
                                                      (case include-archived-items
                                                        :exclude [:and
                                                                  [:= active-column true]
                                                                  [:= visibility-type-column nil]]
                                                        (:only :all) nil)]}]])

                     ;; Segment/Measure with table permissions and archived filtering
                     (:model/Segment :model/Measure)
                     (let [archived-column (keyword (name table-name) "archived")
                           table-id-column (keyword (name table-name) "table_id")]
                       [:and
                        [:= entity-type-field (name entity-type)]
                        [:in entity-id-field {:select [:id]
                                              :from [table-name]
                                              :where [:and
                                                      ;; Check that user can see the table this entity belongs to
                                                      [:in table-id-column
                                                       {:select [:metabase_table.id]
                                                        :from [:metabase_table]
                                                        ;; using this clause because we had to change the mi/visible-filter-clause
                                                        ;; to allow returning CTE based filters
                                                        ;; TODO(ed 2025-12-16: support using CTES in filters in dependency graph)
                                                        :where [:in :metabase_table.id
                                                                (perms/visible-table-filter-select
                                                                 :id
                                                                 {:user-id api/*current-user-id*
                                                                  :is-superuser? api/*is-superuser?*}
                                                                 {:perms/view-data :unrestricted
                                                                  :perms/create-queries :query-builder})]}]
                                                      ;; Filter by archived status
                                                      (case include-archived-items
                                                        :exclude [:= archived-column false]
                                                        :only [:= archived-column true]
                                                        :all nil)]}]])))))
         deps.dependency-types/dependency-type->model)))

(defn- readable-graph-dependencies
  ([]
   (readable-graph-dependencies nil))
  ([opts]
   (dependency/filtered-graph-dependencies
    (fn [entity-type-field entity-id-field]
      (visible-entities-filter-clause entity-type-field entity-id-field opts)))))

(defn- readable-graph-dependents
  ([]
   (readable-graph-dependents nil))
  ([opts]
   (dependency/filtered-graph-dependents
    (fn [entity-type-field entity-id-field]
      (visible-entities-filter-clause entity-type-field entity-id-field opts)))))

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

(defn- node-errors [nodes-by-type]
  (-> (into {}
            (mapcat (fn [[type ids]]
                      (->> (t2/select [:model/AnalysisFinding :analyzed_entity_id :finding_details]
                                      :analyzed_entity_type type
                                      :analyzed_entity_id [:in ids])
                           (map (fn [{:keys [analyzed_entity_id finding_details]}]
                                  [[type analyzed_entity_id] finding_details])))))
            nodes-by-type)
      not-empty))

(defn- hydrate-entities [entity-type entities]
  (case entity-type
    :card (-> entities
              (t2/hydrate :creator :dashboard :document [:collection :is_personal])
              (->> (map collection.root/hydrate-root-collection))
              (revisions/with-last-edit-info :card))
    :table (t2/hydrate entities :fields :db)
    :transform (t2/hydrate entities :creator :table-with-db-and-fields :last_run)
    :dashboard (-> entities
                   (t2/hydrate :creator [:collection :is_personal])
                   (->> (map collection.root/hydrate-root-collection))
                   (revisions/with-last-edit-info :dashboard))
    :document (-> entities
                  (t2/hydrate :creator [:collection :is_personal])
                  (->> (map collection.root/hydrate-root-collection)))
    :sandbox (t2/hydrate entities [:table :db :fields])
    :snippet (-> entities
                 (t2/hydrate :creator)
                 (->> (map #(collection.root/hydrate-root-collection % (collection.root/hydrated-root-collection :snippets)))))
    (:segment :measure) (t2/hydrate entities :creator [:table :db])))

(defn- expanded-nodes [downstream-graph nodes {:keys [include-errors?]}]
  (let [usages (node-usages downstream-graph nodes)
        nodes-by-type (->> (group-by first nodes)
                           (m/map-vals #(map second %)))
        errors (when include-errors?
                 (node-errors nodes-by-type))
        nodes-by-type-and-id
        (into {}
              (mapcat (fn [[entity-type entity-ids]]
                        (let [model (deps.dependency-types/dependency-type->model entity-type)
                              fields (entity-select-fields entity-type)]
                          (->> (t2/select (into [model] fields) :id [:in entity-ids])
                               (hydrate-entities entity-type)
                               (map (fn [entity]
                                      [[entity-type (:id entity)]
                                       (entity-value entity-type entity usages errors)]))))))
              nodes-by-type)]
    (keep nodes-by-type-and-id nodes)))

(mr/def ::graph-response
  [:map
   [:nodes [:sequential ::entity]]
   [:edges [:sequential [:map
                         [:from_entity_type ::deps.dependency-types/dependency-types]
                         [:from_entity_id ::entity-id]
                         [:to_entity_type ::deps.dependency-types/dependency-types]
                         [:to_entity_id ::entity-id]]]]])

(api.macros/defendpoint :get "/graph" :- ::graph-response
  "This endpoint takes an :id and a supported entity :type, and returns a graph of all its upstream dependencies.
  The graph is represented by a list of :nodes and a list of :edges. Each node has an :id, :type, :data (which
  depends on the node type), and a map of :dependent_counts per entity type. Each edge is a :model/Dependency.

  Optional :archived parameter controls whether entities in archived collections are included:
  - false (default): Excludes entities in archived collections
  - true: Includes entities in archived collections"
  [_route-params
   {:keys [id type archived]} :- [:map
                                  [:id {:optional true} ms/PositiveInt]
                                  [:type {:optional true} ::deps.dependency-types/dependency-types]
                                  [:archived {:optional true} :boolean]]]
  (api/read-check (deps.dependency-types/dependency-type->model type) id)
  (lib-be/with-metadata-provider-cache
    (let [graph-opts {:include-archived-items (if archived :all :exclude)}
          starting-nodes [[type id]]
          upstream-graph (readable-graph-dependencies graph-opts)
          ;; cache the downstream graph specifically, because between calculating transitive children and calculating
          ;; edges, we'll call this multiple times on the same nodes.
          downstream-graph (graph/cached-graph (readable-graph-dependents graph-opts))
          nodes (into (set starting-nodes)
                      (graph/transitive upstream-graph starting-nodes))
          edges (graph/edges-between downstream-graph nodes)]
      {:nodes (expanded-nodes downstream-graph nodes {:include-errors? false})
       :edges edges})))

(def ^:private dependents-args
  [:map
   [:id                  ms/PositiveInt]
   [:type                ::deps.dependency-types/dependency-types]
   [:dependent_type      ::deps.dependency-types/dependency-types]
   [:dependent_card_type {:optional true} (ms/enum-decode-keyword lib.schema.metadata/card-types)]
   [:archived            {:optional true} :boolean]])

(api.macros/defendpoint :get "/graph/dependents" :- [:sequential ::entity]
  "This endpoint takes an :id, :type, :dependent_type, and an optional :dependent_card_type, and returns a list of
   all that entity's dependents with :dependent_type. If the :dependent_type is :card, the dependents are further
   filtered by :dependent_card_type.

   Optional :archived parameter controls whether entities in archived collections are included:
   - false (default): Excludes entities in archived collections
   - true: Includes entities in archived collections"
  [_route-params
   {:keys [id type dependent_type dependent_card_type archived]} :- dependents-args]
  (api/read-check (deps.dependency-types/dependency-type->model type) id)
  (lib-be/with-metadata-provider-cache
    (let [graph-opts {:include-archived-items (if archived :all :exclude)}
          downstream-graph (graph/cached-graph (readable-graph-dependents graph-opts))
          nodes (-> (graph/children-of downstream-graph [[type id]])
                    (get [type id]))]
      (->> (expanded-nodes downstream-graph nodes {:include-errors? false})
           (filter #(and (= (:type %) dependent_type)
                         (or (not= dependent_type :card)
                             (= (-> % :data :type) dependent_card_type))))))))

(defn- personal-collection-filter
  "Returns a HoneySQL WHERE clause to exclude items in personal collections.
   Only applies to collection-based entities (card, dashboard, document, snippet).
   Returns nil for non-collection entities or when include-personal-collections is true."
  [entity-type include-personal-collections]
  (when-not include-personal-collections
    (case entity-type
      (:card :dashboard :document :snippet)
      (let [personal-ids (t2/select-pks-vec :model/Collection
                                            :personal_owner_id [:not= nil]
                                            :location "/")]
        (when (seq personal-ids)
          [:or
           [:= :entity.collection_id nil]
           [:and
            [:= :collection.personal_owner_id nil]
            (into [:and]
                  (for [pid personal-ids]
                    [:not-like :collection.location (str "/" pid "/%")]))]]))
      nil)))

(defn- unreferenced-query [entity-type card-types query include-archived-items include-personal-collections]
  (let [table-name (case entity-type
                     :card :report_card
                     :table :metabase_table
                     :transform :transform
                     :snippet :native_query_snippet
                     :dashboard :report_dashboard
                     :document :document
                     :sandbox :sandboxes
                     :segment :segment
                     :measure :measure)
        name-column (case entity-type
                      :table :entity.display_name
                      :sandbox [:cast :entity.id (if (= :mysql (mdb/db-type)) :char :text)]
                      :entity.name)
        archived-filter (when (= include-archived-items :exclude)
                          (case entity-type
                            (:card :dashboard :document :snippet :segment :measure)
                            [:= :entity.archived false]
                            :table
                            [:and
                             [:= :entity.active true]
                             [:= :entity.visibility_type nil]]
                            nil))
        personal-filter (personal-collection-filter entity-type include-personal-collections)
        needs-collection-join? (and (not include-personal-collections)
                                    (#{:card :dashboard :document :snippet} entity-type))]
    {:select [[[:inline (name entity-type)] :entity_type]
              [:entity.id :entity_id]
              [name-column :sort_key]]
     :from [[table-name :entity]]
     :left-join (cond-> [:dependency [:and
                                      [:= :dependency.to_entity_id :entity.id]
                                      [:= :dependency.to_entity_type [:inline (name entity-type)]]]]
                  needs-collection-join?
                  (conj :collection [:= :entity.collection_id :collection.id]))
     :where (cond->> [:= :dependency.id nil]
              (and (= entity-type :card)
                   (seq card-types))
              (conj [:and [:in :entity.type (mapv name card-types)]])

              (and query (not= entity-type :sandbox))
              (conj [:and [:like [:lower name-column] (str "%" (u/lower-case-en query) "%")]])

              archived-filter
              (conj [:and archived-filter])

              personal-filter
              (conj [:and personal-filter]))}))

(def ^:private unreferenced-items-args
  [:map
   [:types {:optional true} [:or
                             ::deps.dependency-types/dependency-types
                             [:sequential ::deps.dependency-types/dependency-types]]]
   [:card_types {:optional true} [:or
                                  (ms/enum-decode-keyword lib.schema.metadata/card-types)
                                  [:sequential (ms/enum-decode-keyword lib.schema.metadata/card-types)]]]
   [:query {:optional true} :string]
   [:archived {:optional true} :boolean]
   [:include_personal_collections {:optional true} :boolean]
   [:limit {:optional true} ms/PositiveInt]
   [:offset {:optional true} nat-int?]])

(def ^:private unreferenced-items-response
  [:map
   [:data [:sequential ::entity]]
   [:total nat-int?]
   [:limit ms/PositiveInt]
   [:offset nat-int?]])

(api.macros/defendpoint :get "/graph/unreferenced" :- unreferenced-items-response
  "Returns a list of all unreferenced items in the instance.
   An unreferenced item is one that is not a dependency of any other item.

   Accepts optional parameters for filtering:
   - types: List of entity types to include (e.g., [:card :transform :snippet :dashboard])
   - card_types: List of card types to include when filtering cards (e.g., [:question :model :metric])
   - query: Search string to filter by name or location
   - archived: Controls whether archived entities are included
   - include_personal_collections: Controls whether items in personal collections are included (default: false)

   Returns a list of unreferenced items, each with :id, :type, and :data fields."
  [_route-params
   {:keys [types card_types query archived include_personal_collections]
    :or {types (vec deps.dependency-types/dependency-types)
         card_types (vec lib.schema.metadata/card-types)
         include_personal_collections false}} :- unreferenced-items-args]
  (let [limit (request/limit)
        offset (request/offset)
        include-archived-items (if archived :all :exclude)
        graph-opts {:include-archived-items include-archived-items}
        selected-types (cond->> (if (sequential? types) types [types])
                         ;; Sandboxes don't support query filtering, so exclude them when a query is provided
                         query (remove #{:sandbox}))
        card-types (if (sequential? card_types) card_types [card_types])
        union-queries (map #(unreferenced-query % card-types query include-archived-items include_personal_collections)
                           selected-types)
        union-query {:union-all union-queries}
        all-ids (->> (t2/query (assoc union-query :order-by [[:sort_key :asc]]
                                      :limit limit
                                      :offset offset))
                     (map (fn [{:keys [entity_id entity_type]}]
                            [(keyword entity_type) entity_id])))
        downstream-graph (graph/cached-graph (readable-graph-dependents graph-opts))
        total (-> (t2/query {:select [[:%count.* :total]]
                             :from [[union-query :subquery]]})
                  first
                  :total)]
    {:data   (expanded-nodes downstream-graph all-ids {:include-errors? false})
     :limit  limit
     :offset offset
     :total  total}))

(def ^:private broken-items-args
  [:map
   [:types {:optional true} [:or
                             ::deps.dependency-types/dependency-types
                             [:sequential ::deps.dependency-types/dependency-types]]]
   [:card_types {:optional true} [:or
                                  (ms/enum-decode-keyword lib.schema.metadata/card-types)
                                  [:sequential (ms/enum-decode-keyword lib.schema.metadata/card-types)]]]
   [:query {:optional true} :string]
   [:archived {:optional true} :boolean]
   [:include_personal_collections {:optional true} :boolean]
   [:limit {:optional true} ms/PositiveInt]
   [:offset {:optional true} nat-int?]])

(def ^:private broken-items-response
  [:map
   [:data [:sequential ::entity]]
   [:total nat-int?]
   [:limit ms/PositiveInt]
   [:offset nat-int?]])

(defn- broken-query [entity-type card-types query include-archived-items include-personal-collections]
  (let [table-name (case entity-type
                     :card :report_card
                     :table :metabase_table
                     :transform :transform
                     :snippet :native_query_snippet
                     :dashboard :report_dashboard
                     :document :document
                     :sandbox :sandboxes
                     :segment :segment
                     :measure :measure)
        name-column (case entity-type
                      :table :entity.display_name
                      :sandbox [:cast :entity.id (if (= :mysql (mdb/db-type)) :char :text)]
                      :entity.name)
        archived-filter (when (= include-archived-items :exclude)
                          (case entity-type
                            (:card :dashboard :document :snippet :segment :measure)
                            [:= :entity.archived false]
                            :table
                            [:and
                             [:= :entity.active true]
                             [:= :entity.visibility_type nil]]
                            nil))
        personal-filter (personal-collection-filter entity-type include-personal-collections)
        needs-collection-join? (and (not include-personal-collections)
                                    (#{:card :dashboard :document :snippet} entity-type))]
    {:select [[[:inline (name entity-type)] :entity_type]
              [:entity.id :entity_id]
              [name-column :sort_key]]
     :from [[table-name :entity]]
     :left-join (cond-> [:analysis_finding [:and
                                            [:= :analysis_finding.analyzed_entity_id :entity.id]
                                            [:= :analysis_finding.analyzed_entity_type (name entity-type)]]]
                  needs-collection-join?
                  (conj :collection [:= :entity.collection_id :collection.id]))
     :where (cond->> [:= :analysis_finding.result false]
              (and (= entity-type :card)
                   (seq card-types))
              (conj [:and [:in :entity.type (mapv name card-types)]])

              (and query (not= entity-type :sandbox))
              (conj [:and [:like [:lower name-column] (str "%" (u/lower-case-en query) "%")]])

              archived-filter
              (conj [:and archived-filter])

              personal-filter
              (conj [:and personal-filter]))}))

(api.macros/defendpoint :get "/graph/broken" :- broken-items-response
  "Returns a list of all items with broken queries.

   Accepts optional parameters for filtering:
   - `types`: List of entity types to include (e.g., `[:card :transform :snippet :dashboard]`)
   - `card_types`: List of card types to include when filtering cards (e.g., `[:question :model :metric]`)
   - `query`: Search string to filter by name or location
   - `archived`: Controls whether archived entities are included
   - `include_personal_collections`: Controls whether items in personal collections are included (default: false)

   Returns a list of broken items, each with `:id`, `:type`, `:data`, and `:error`s fields."
  [_route-params
   {:keys [types card_types query archived include_personal_collections]
    :or {types (vec deps.dependency-types/dependency-types)
         card_types (vec lib.schema.metadata/card-types)
         include_personal_collections false}} :- broken-items-args]
  (let [limit (request/limit)
        offset (request/offset)
        include-archived-items (if archived :all :exclude)
        graph-opts {:include-archived-items include-archived-items}
        selected-types (cond->> (if (sequential? types) types [types])
                         ;; Sandboxes don't support query filtering, so exclude them when a query is provided
                         query (remove #{:sandbox}))
        card-types (if (sequential? card_types) card_types [card_types])
        union-queries (map #(broken-query % card-types query include-archived-items include_personal_collections)
                           selected-types)
        union-query {:union-all union-queries}
        all-ids (->> (t2/query (assoc union-query :order-by [[:sort_key :asc]]
                                      :limit limit
                                      :offset offset))
                     (map (fn [{:keys [entity_id entity_type]}]
                            [(keyword entity_type) entity_id])))
        downstream-graph (graph/cached-graph (readable-graph-dependents graph-opts))
        total (-> (t2/query {:select [[:%count.* :total]]
                             :from [[union-query :subquery]]})
                  first
                  :total)]
    {:data   (expanded-nodes downstream-graph all-ids {:include-errors? true})
     :limit  limit
     :offset offset
     :total  total}))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/dependencies` routes."
  (handlers/routes
   (api.macros/ns-handler *ns* +auth)))
