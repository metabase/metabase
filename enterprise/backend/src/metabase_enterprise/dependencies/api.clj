(ns metabase-enterprise.dependencies.api
  (:require
   [clojure.set :as set]
   [clojure.string :as str]
   [medley.core :as m]
   [metabase-enterprise.dependencies.core :as dependencies]
   [metabase-enterprise.dependencies.dependency-types :as deps.dependency-types]
   [metabase-enterprise.dependencies.models.analysis-finding-error :as analysis-finding-error]
   [metabase-enterprise.dependencies.models.dependency :as dependency]
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
   [metabase.models.interface :as mi]
   [metabase.native-query-snippets.core :as native-query-snippets]
   [metabase.permissions.core :as perms]
   [metabase.queries.schema :as queries.schema]
   [metabase.request.core :as request]
   [metabase.revisions.core :as revisions]
   [metabase.transforms.schema :as transforms.schema]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]
   [toucan2.util :as t2.util]))

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
        breakages (dependencies/errors-from-proposed-edits edits :base-provider base-provider)]
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
          breakages (dependencies/errors-from-proposed-edits edits :base-provider base-provider)]
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
   {:keys [id], snippet-name :name}
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
                            {:status-code 400})))]
    (broken-cards-response {})))

(def ^:private entity-keys
  {:table     [:name :description :display_name :db_id :db :schema :fields :transform]
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
           :data (->> (select-keys entity (entity-keys entity-type))
                      (m/map-vals format-subentity))
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
  - Superuser-only (:model/Sandbox): Only if api/*is-superuser?* is true
  - Collection-based (:model/Card, :model/Dashboard, :model/Document, :model/NativeQuerySnippet):
    Uses collection/visible-collection-filter-clause for collection filtering and adds archived entity filtering.
    Native query snippets have additional restrictions for sandboxed users.
  - Table: Uses perms/visible-table-filter-select with appropriate permissions and filters by active/visibility_type.
    Follows search API conventions: active=true AND visibility_type=nil for non-archived tables.
    Note: archived_at is not checked separately as archived tables always have active=false.
  - Transform: Analysts can view any transform they have source view permission to."
  ([entity-type-field entity-id-field]
   (visible-entities-filter-clause entity-type-field entity-id-field nil))
  ([entity-type-field entity-id-field {:keys [include-archived-items] :or {include-archived-items :exclude}}]
   (into [:or]
         (keep (fn [[entity-type model]]
                 (let [table-name (t2/table-name model)
                       id-column (keyword (name table-name) "id")]
                   (case model
                     ;; Sandbox is superuser-only
                     :model/Sandbox
                     (when api/*is-superuser?*
                       [:and
                        [:= entity-type-field (name entity-type)]
                        [:in entity-id-field {:select [:id] :from [table-name]}]])

                     :model/Transform
                     (cond
                       api/*is-superuser?*
                       [:and
                        [:= entity-type-field (name entity-type)]
                        [:in entity-id-field {:select [:id] :from [table-name]}]]

                       api/*is-data-analyst?*
                       [:and
                        [:= entity-type-field (name entity-type)]
                        [:in entity-id-field
                         {:select [:id]
                          :from   [table-name]
                          :where  [:in :source_database_id
                                   (perms/visible-database-filter-select
                                    {:user-id          api/*current-user-id*
                                     :is-superuser?    api/*is-superuser?*
                                     :is-data-analyst? api/*is-data-analyst?*}
                                    {:perms/create-queries [:query-builder :query-builder-and-native]})]}]])

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
                                                :from   [table-name]
                                                :where  [:and
                                                         ;; Filter by collection visibility
                                                         (collection/visible-collection-filter-clause
                                                          (keyword (name table-name) "collection_id")
                                                          {:include-archived-items include-archived-items}
                                                          {:current-user-id api/*current-user-id*
                                                           :is-superuser?   api/*is-superuser?*})
                                                         ;; Filter by entity archived status
                                                         (case include-archived-items
                                                           :exclude [:= archived-column false]
                                                           :only [:= archived-column true]
                                                           :all nil)]}]]))

                     ;; Table with visible-filter-clause and active/visibility_type filtering
                     :model/Table
                     (let [active-column          (keyword (name table-name) "active")
                           visibility-type-column (keyword (name table-name) "visibility_type")]
                       [:and
                        [:= entity-type-field (name entity-type)]
                        [:in entity-id-field {:select [:id]
                                              :from   [table-name]
                                              :where  [:and
                                                       [:in id-column
                                                        (perms/visible-table-filter-select
                                                         :id
                                                         {:user-id       api/*current-user-id*
                                                          :is-superuser? api/*is-superuser?*}
                                                         {:perms/view-data      :unrestricted
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
                                              :from   [table-name]
                                              :where  [:and
                                                       ;; Check that user can see the table this entity belongs to
                                                       [:in table-id-column
                                                        {:select [:metabase_table.id]
                                                         :from   [:metabase_table]
                                                         ;; using this clause because we had to change the mi/visible-filter-clause
                                                         ;; to allow returning CTE based filters
                                                         ;; TODO(ed 2025-12-16: support using CTES in filters in dependency graph)
                                                         :where  [:in :metabase_table.id
                                                                  (perms/visible-table-filter-select
                                                                   :id
                                                                   {:user-id       api/*current-user-id*
                                                                    :is-superuser? api/*is-superuser?*}
                                                                   {:perms/view-data      :unrestricted
                                                                    :perms/create-queries :query-builder})]}]
                                                       ;; Filter by archived status
                                                       (case include-archived-items
                                                         :exclude [:= archived-column false]
                                                         :only [:= archived-column true]
                                                         :all nil)]}]])))))
         deps.dependency-types/dependency-type->model)))

(defn- broken-entities-filter-clause
  "Returns a HoneySQL WHERE clause for filtering to only broken entities.

   Accepts two arguments:
   - `entity-type-field`: Database column name for entity type (e.g., :from_entity_type)
   - `entity-id-field`: Database column name for entity ID (e.g., :from_entity_id)

   Returns a clause that joins with the analysis_finding table to filter to entities
   that have failed analysis (analysis_finding.result = false)."
  [entity-type-field entity-id-field]
  (into [:or]
        (keep (fn [[entity-type _model]]
                [:and
                 [:= entity-type-field (name entity-type)]
                 [:in entity-id-field {:select [:analyzed_entity_id]
                                       :from [:analysis_finding]
                                       :where [:and
                                               [:= :analysis_finding.analyzed_entity_type (name entity-type)]
                                               [:= :analysis_finding.result false]]}]])
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
  ([{:keys [include-archived-items broken] :or {include-archived-items :exclude} :as _opts}]
   (dependency/filtered-graph-dependents
    (fn [entity-type-field entity-id-field]
      (let [visibility-clause (visible-entities-filter-clause entity-type-field entity-id-field
                                                              {:include-archived-items include-archived-items})]
        (if broken
          [:and visibility-clause (broken-entities-filter-clause entity-type-field entity-id-field)]
          visibility-clause))))))

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

(defn- node-downstream-errors
  "Fetches errors caused by the given source entities (what downstream entities they're breaking).
   Filters out errors where the analyzed entity is not visible to the current user.
   Unlike `node-errors` which fetches errors on an entity, this fetches errors that
   the entity is causing in other entities that depend on it."
  [nodes-by-type]
  (letfn [(errors-by-source-type-and-id [[source-type ids]]
            (when (seq ids)
              (let [finding-errors (t2/select :model/AnalysisFindingError
                                              {:where [:and
                                                       [:= :source_entity_type (name source-type)]
                                                       [:in :source_entity_id ids]
                                                       (visible-entities-filter-clause
                                                        :analyzed_entity_type :analyzed_entity_id)]})]
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
              (let [finding-errors (t2/select :model/AnalysisFindingError
                                              {:where [:and
                                                       [:= :analyzed_entity_type (name type)]
                                                       [:in :analyzed_entity_id ids]
                                                       [:or
                                                        [:= :source_entity_type nil]
                                                        (visible-entities-filter-clause
                                                         :source_entity_type :source_entity_id)]]})]
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
    :table (t2/hydrate entities :fields :db :transform)
    :transform (-> entities
                   (t2/hydrate :creator :table-with-db-and-fields :last_run :collection)
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
                         [:from_entity_id ::deps.dependency-types/entity-id]
                         [:to_entity_type ::deps.dependency-types/dependency-types]
                         [:to_entity_id ::deps.dependency-types/entity-id]]]]])

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
   [:dependent_types               {:optional true}
    [:or
     ::deps.dependency-types/dependency-types
     [:sequential ::deps.dependency-types/dependency-types]]]
   [:dependent_card_types          {:optional true}
    [:or
     (ms/enum-decode-keyword lib.schema.metadata/card-types)
     [:sequential (ms/enum-decode-keyword lib.schema.metadata/card-types)]]]
   [:archived                      {:optional true} :boolean]
   [:broken                        {:optional true} :boolean]
   [:query                         {:optional true} :string]
   [:include_personal_collections  {:optional true} :boolean]
   [:sort_column                   {:optional true} (ms/enum-decode-keyword dependents-sort-columns)]
   [:sort_direction                {:optional true} (ms/enum-decode-keyword sort-directions)]])

(api.macros/defendpoint :get "/graph/dependents" :- [:sequential ::entity]
  "Returns a list of dependents for the specified entity.

   Required parameters:
   - `id`: The ID of the entity
   - `type`: The type of the entity (card, table, dashboard, etc.)

   Optional parameters:
   - `dependent_types`: Dependency types to filter by. Can be single value or array.
     If not provided, returns all types. Example: ?dependent_types=card&dependent_types=dashboard
   - `dependent_card_types`: Card types to filter by when dependent_types includes :card.
     Ignored if dependent_types doesn't include :card. Example: ?dependent_card_types=question&dependent_card_types=model
   - `archived`: Include entities in archived collections (default: false)
   - `broken`: Return only broken entities (default: false)
   - `query`: Search string to filter results by name or location (case-insensitive)
   - `include_personal_collections`: Include items in personal collections (default: false)
   - `sort_column`: Column to sort by - name, location, or view-count (default: name)
   - `sort_direction`: Sort direction - asc or desc (default: asc)"
  [_route-params
   {:keys [id type dependent_types dependent_card_types archived broken
           query include_personal_collections sort_column sort_direction]
    :or {include_personal_collections false
         sort_column :name
         sort_direction :asc}} :- dependents-args]
  (api/read-check (deps.dependency-types/dependency-type->model type) id)
  (lib-be/with-metadata-provider-cache
    (let [graph-opts {:include-archived-items (if archived :all :exclude)
                      :broken broken}
          downstream-graph (graph/cached-graph (readable-graph-dependents graph-opts))
          nodes (-> (graph/children-of downstream-graph [[type id]])
                    (get [type id]))
          dep-types-set (cond
                          (nil? dependent_types) deps.dependency-types/dependency-types
                          (sequential? dependent_types) (set dependent_types)
                          :else #{dependent_types})
          card-types-set (cond
                           (nil? dependent_card_types) lib.schema.metadata/card-types
                           (sequential? dependent_card_types) (set dependent_card_types)
                           :else #{dependent_card_types})
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
           (if include_personal_collections
             identity
             (remove in-personal-collection?))
           ;; Filter by query (sandboxes are excluded since they have no name or location)
           (if query
             (filter #(entity-matches-query? % query))
             identity))]
      (-> (into [] dependents-filter (expanded-nodes downstream-graph nodes {:include-errors? false}))
          (sort-dependents sort_column sort_direction)))))

(defn- entity-type-config
  [entity-type]
  (let [root-collection (collection.root/root-collection-with-ui-details
                         (case entity-type
                           :transform :transforms
                           :snippet :snippets
                           nil))]
    {:table-name (case entity-type
                   :card :report_card
                   :table :metabase_table
                   :transform :transform
                   :snippet :native_query_snippet
                   :dashboard :report_dashboard
                   :document :document
                   :sandbox :sandboxes
                   :segment :segment
                   :measure :measure)
     :name-column (case entity-type
                    :table :entity.display_name
                    :sandbox [:cast :entity.id (if (= :mysql (mdb/db-type)) :char :text)]
                    :entity.name)
     :location-column (case entity-type
                        :card [:case
                               [:not= :entity.dashboard_id nil] :dashboard.name
                               [:not= :entity.document_id nil] :document.name
                               :else [:coalesce :collection.name [:inline (:name root-collection)]]]
                        :table :database.name
                        (:transform :snippet :dashboard :document) [:coalesce :collection.name [:inline (:name root-collection)]]
                        :sandbox [:cast :entity.id (if (= :mysql (mdb/db-type)) :char :text)]
                        (:segment :measure) :table.display_name)}))

(defn- query-type-join-and-filter
  [query-type entity-type {:keys [include-archived-items]}]
  (case query-type
    :unreferenced {:join [:dependency [:and
                                       [:= :dependency.to_entity_id :entity.id]
                                       [:= :dependency.to_entity_type (name entity-type)]
                                       (visible-entities-filter-clause
                                        :dependency.from_entity_type
                                        :dependency.from_entity_id
                                        {:include-archived-items include-archived-items})]]
                   :join-filter [:= :dependency.id nil]}
    :broken {:join [:analysis_finding [:and
                                       [:= :analysis_finding.analyzed_entity_id :entity.id]
                                       [:= :analysis_finding.analyzed_entity_type (name entity-type)]]]
             :join-filter [:= :analysis_finding.result false]}
    :breaking {:join [:analysis_finding_error [:and
                                               [:= :analysis_finding_error.source_entity_id :entity.id]
                                               [:= :analysis_finding_error.source_entity_type (name entity-type)]
                                               (visible-entities-filter-clause
                                                :analysis_finding_error.analyzed_entity_type
                                                :analysis_finding_error.analyzed_entity_id
                                                {:include-archived-items include-archived-items})]]
               :join-filter [:!= :analysis_finding_error.id nil]}))

(defn- location-joins-for-entity
  "Returns the set of join keywords needed for location-based operations."
  [entity-type]
  (case entity-type
    :card #{:collection :dashboard :document}
    (:transform :snippet :dashboard :document) #{:collection}
    (:segment :measure) #{:table}
    :table #{:database}
    #{}))

(defn- build-optional-filters
  [{:keys [entity-type card-types query include-archived-items include-personal-collections]}
   {:keys [name-column location-column]}]
  (let [card-type-filter (when (and (= entity-type :card)
                                    (seq card-types))
                           {:filter [:in :entity.type (mapv name card-types)]
                            :filter-joins #{}})
        query-filter (when (and query (not= entity-type :sandbox))
                       {:filter [:or
                                 [:like [:lower name-column] (str "%" (t2.util/lower-case-en query) "%")]
                                 [:like [:lower location-column] (str "%" (t2.util/lower-case-en query) "%")]]
                        :filter-joins (location-joins-for-entity entity-type)})
        database-filter (when (= entity-type :table)
                          {:filter [:and [:not :database.is_sample] [:not :database.is_audit]]
                           :filter-joins #{:database}})
        archived-filter (when (= include-archived-items :exclude)
                          {:filter (case entity-type
                                     (:card :dashboard :document :snippet :segment :measure)
                                     [:= :entity.archived false]
                                     :table
                                     [:and
                                      [:= :entity.active true]
                                      [:= :entity.visibility_type nil]]
                                     nil)
                           :filter-joins #{}})
        personal-filter (when-not include-personal-collections
                          (case entity-type
                            (:card :dashboard :document :snippet)
                            (let [personal-ids (t2/select-pks-vec :model/Collection
                                                                  :personal_owner_id [:not= nil]
                                                                  :location "/")]
                              (when (seq personal-ids)
                                {:filter [:or
                                          [:= :entity.collection_id nil]
                                          [:and
                                           [:= :collection.personal_owner_id nil]
                                           (into [:and]
                                                 (for [pid personal-ids]
                                                   [:not-like :collection.location (str "/" pid "/%")]))]]
                                 :filter-joins #{:collection}}))
                            nil))
        filter-results (keep identity
                             [card-type-filter query-filter database-filter archived-filter personal-filter])]
    {:filters (keep :filter filter-results)
     :filter-joins (reduce set/union #{} (map :filter-joins filter-results))}))

(defn- sort-key-cols-and-joins
  [sort-column entity-type name-column location-column]
  (case sort-column
    :location {:sort-column location-column
               :sort-joins (location-joins-for-entity entity-type)}
    :dependents-errors {:sort-column {:select [[[:count [:distinct (if (= :mysql (mdb/db-type))
                                                                     [:concat :error_type [:inline "-"] [:coalesce :error_detail [:inline ""]]]
                                                                     [:composite :error_type :error_detail])]]]]
                                      :from [:analysis_finding_error]
                                      :where [:and
                                              [:= :source_entity_id :entity.id]
                                              [:= :source_entity_type (name entity-type)]
                                              (visible-entities-filter-clause
                                               :analyzed_entity_type :analyzed_entity_id)]}
                        :sort-joins #{}}
    :dependents-with-errors {:sort-column {:select [[[:count [:distinct (if (= :mysql (mdb/db-type))
                                                                          [:concat :analyzed_entity_id [:inline "-"] :analyzed_entity_type]
                                                                          [:composite :analyzed_entity_id :analyzed_entity_type])]]]]
                                           :from [:analysis_finding_error]
                                           :where [:and
                                                   [:= :source_entity_id :entity.id]
                                                   [:= :source_entity_type (name entity-type)]
                                                   (visible-entities-filter-clause
                                                    :analyzed_entity_type :analyzed_entity_id)]}
                             :sort-joins #{}}
    {:sort-column name-column
     :sort-joins #{}}))

(defn- build-left-joins
  [base-join joins]
  (cond-> base-join
    (:database joins) (conj [:metabase_database :database] [:= :entity.db_id :database.id])
    (:collection joins) (conj :collection [:= :entity.collection_id :collection.id])
    (:dashboard joins) (conj [:report_dashboard :dashboard] [:= :entity.dashboard_id :dashboard.id])
    (:document joins) (conj :document [:= :entity.document_id :document.id])
    (:table joins) (conj [:metabase_table :table] [:= :entity.table_id :table.id])))

(defn- dependency-items-query
  [{:keys [query-type entity-type sort-column include-archived-items] :as params}]
  (let [{:keys [table-name name-column location-column] :as config} (entity-type-config entity-type)
        {:keys [join join-filter]} (query-type-join-and-filter query-type entity-type
                                                               {:include-archived-items include-archived-items})
        {:keys [filters filter-joins]} (build-optional-filters params config)
        {:keys [sort-column sort-joins]} (sort-key-cols-and-joins sort-column entity-type name-column location-column)
        visible-filter (visible-entities-filter-clause (name entity-type) :entity.id
                                                       {:include-archived-items include-archived-items})
        all-required-joins (set/union filter-joins sort-joins)
        select-clause [[[:inline (name entity-type)] :entity_type]
                       [:entity.id :entity_id]
                       [sort-column :sort_key]]]
    {(if (= query-type :breaking) :select-distinct :select) select-clause
     :from [[table-name :entity]]
     :left-join (build-left-joins join all-required-joins)
     :where (into [:and join-filter visible-filter] (keep identity) filters)}))

(def ^:private breaking-items-sort-columns
  "Valid sort columns for /graph/broken and /graph/unreferenced endpoints."
  #{:name :location :dependents-with-errors :dependents-errors})

(def ^:private dependency-items-args
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
   [:sort_column {:optional true} (ms/enum-decode-keyword breaking-items-sort-columns)]
   [:sort_direction {:optional true} (ms/enum-decode-keyword sort-directions)]])

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
   - `card_types`: List of card types to include when filtering cards (e.g., [:question :model :metric])
   - `query`: Search string to filter by name or location
   - `archived`: Controls whether archived entities are included
   - `include_personal_collections`: Controls whether items in personal collections are included (default: false)
   - `sort_column`: Sort column - `:name`, `:location`, `:dependents-errors`, or `:dependents-with-errors` (default: `:name`)
   - `sort_direction`: Sort direction - `:asc` or `:desc` (default: `:asc`)
   - `offset`: Default 0
   - `limit`: Default 50

   Returns a map with:
   - `data`: List of unreferenced items, each with `:id`, `:type`, and `:data` fields
   - `total`: Total count of matched items
   - `offset`: Applied offset
   - `limit`: Applied limit"
  [_route-params
   {:keys [types card_types query archived include_personal_collections sort_column sort_direction]
    :or {types (vec deps.dependency-types/dependency-types)
         card_types (vec lib.schema.metadata/card-types)
         include_personal_collections false
         sort_column :name
         sort_direction :asc}} :- dependency-items-args]
  (let [offset (or (request/offset) 0)
        limit (or (request/limit) 50)
        include-archived-items (if archived :all :exclude)
        graph-opts {:include-archived-items include-archived-items}
        selected-types (cond->> (if (sequential? types) types [types])
                         ;; Sandboxes don't support query filtering, so exclude them when a query is provided
                         query (remove #{:sandbox}))
        card-types (if (sequential? card_types) card_types [card_types])
        union-queries (map #(dependency-items-query {:query-type :unreferenced
                                                     :entity-type %
                                                     :card-types card-types
                                                     :query query
                                                     :include-archived-items include-archived-items
                                                     :include-personal-collections include_personal_collections
                                                     :sort-column sort_column})
                           selected-types)
        union-query {:union-all union-queries}
        all-ids (->> (t2/query (assoc union-query
                                      :order-by [[:sort_key sort_direction] [:entity_id sort_direction] [:entity_type sort_direction]]
                                      :offset offset
                                      :limit limit))
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

(api.macros/defendpoint :get "/graph/broken" :- dependency-items-response
  "Returns a list of entities that are causing errors in downstream dependents
   These are tables or cards that other entities depend on, where those dependents
   have validation errors traced back to this source entity.

   Accepts optional parameters for filtering:
   - `types`: List of source entity types - only `:card` or `:table` (default: both)
   - `card_types`: List of card types to include when filtering cards (e.g., `[:question :model :metric]`)
   - `query`: Search string to filter by name or location
   - `archived`: Controls whether archived entities are included
   - `include_personal_collections`: Controls whether items in personal collections are included (default: false)
   - `sort_column`: Sort column - `:name`, `:location`, `:dependents-errors`, or `:dependents-with-errors` (default: `:name`)
   - `sort_direction`: Sort direction - `:asc` or `:desc` (default: `:asc`)
   - `offset`: Default 0
   - `limit`: Default 50

   Returns a map with:
   - `data`: List of breaking source entities
   - `total`: Total count of matched items
   - `offset`: Applied offset
   - `limit`: Applied limit"
  [_route-params
   {:keys [types card_types query archived include_personal_collections sort_column sort_direction]
    :or {types [:card :table]
         card_types (vec lib.schema.metadata/card-types)
         include_personal_collections false
         sort_column :name
         sort_direction :asc}} :- dependency-items-args]
  (let [offset (or (request/offset) 0)
        limit (or (request/limit) 50)
        include-archived-items (if archived :all :exclude)
        graph-opts {:include-archived-items include-archived-items}
        selected-types (cond->> (if (sequential? types) types [types])
                         ;; Sandboxes don't support query filtering, so exclude them when a query is provided
                         query (remove #{:sandbox}))
        card-types (if (sequential? card_types) card_types [card_types])
        union-queries (map #(dependency-items-query {:query-type :breaking
                                                     :entity-type %
                                                     :card-types card-types
                                                     :query query
                                                     :include-archived-items include-archived-items
                                                     :include-personal-collections include_personal_collections
                                                     :sort-column sort_column})
                           selected-types)
        union-query {:union-all union-queries}
        all-ids (->> (t2/query (assoc union-query
                                      :order-by [[:sort_key sort_direction] [:entity_id sort_direction] [:entity_type sort_direction]]
                                      :offset offset
                                      :limit limit))
                     (map (fn [{:keys [entity_id entity_type]}]
                            [(keyword entity_type) entity_id])))
        downstream-graph (graph/cached-graph (readable-graph-dependents graph-opts))
        nodes-by-type (u/group-by first second all-ids)
        downstream-errors (node-downstream-errors nodes-by-type)
        total (-> (t2/query {:select [[:%count.* :total]]
                             :from [[union-query :subquery]]})
                  first
                  :total)
        usages (node-usages downstream-graph all-ids)
        fetch-entity (fn [entity-type entity-id]
                       (let [model (deps.dependency-types/dependency-type->model entity-type)
                             fields (entity-select-fields entity-type)]
                         (t2/select-one (into [model] fields) :id entity-id)))
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

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/dependencies` routes."
  (handlers/routes
   (api.macros/ns-handler *ns* +auth)))
