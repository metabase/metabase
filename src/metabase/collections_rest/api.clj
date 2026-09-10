(ns metabase.collections-rest.api
  "`/api/collection` endpoints. By default, these endpoints operate on Collections in the 'default' namespace, which is
  the namespace that has things like Dashboards and Cards. Other namespaces of Collections exist as well, such as the
  `:snippet` namespace, ('Snippet folders' in the UI). These namespaces are independent hierarchies. To use these
  endpoints for other Collections namespaces, you can pass the `?namespace=` parameter (e.g., `?namespace=snippet`)."
  (:require
   [malli.core :as mc]
   [malli.transform :as mtx]
   [malli.util]
   [medley.core :as m]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.collections-rest.children-query :as children-query]
   [metabase.collections-rest.db :as collections-rest.db]
   [metabase.collections.core :as collections]
   [metabase.collections.models.collection :as collection]
   [metabase.collections.models.collection.root :as collection.root]
   [metabase.documents.core :as documents]
   [metabase.eid-translation.core :as eid-translation]
   [metabase.events.core :as events]
   [metabase.lib-be.core :as lib-be]
   [metabase.models.interface :as mi]
   [metabase.notification.core :as notification]
   [metabase.permissions.core :as perms]
   [metabase.premium-features.core :as premium-features]
   [metabase.queries.core :as queries]
   [metabase.request.core :as request]
   [metabase.revisions.core :as revisions]
   [metabase.tracing.core :as tracing]
   [metabase.transforms.feature-gating :as transforms.gating]
   [metabase.upload.core :as upload]
   [metabase.util :as u]
   [metabase.util.i18n :as i18n :refer [tru]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;; when alias defined for namespaced keywords is run through kondo macro, ns should be regarded as used
(comment collection.root/keep-me)

(declare root-collection)

(mr/def ::CollectionId
  "A Collection's ID: an integer for a real row, or the string \"root\" for the virtual Root Collection."
  [:or ms/PositiveInt :string])

(mr/def ::Collection
  "A Collection as the REST API returns it. Deliberately open: which hydrated keys come back varies by endpoint and
  by what the Collection is. `POST /` returns the freshly inserted row with no permission flags; `/root` describes a
  virtual Collection with a string id and none of the database-backed columns; `/tree` nests `:children`. Only `:id`
  and `:name` are present in every case, so only those are required here."
  [:map
   [:id   ::CollectionId]
   ;; The virtual Trash collection carries a deferred-i18n name, and responses are validated before they are
   ;; encoded to JSON, so the raw value reaching this schema is not always a plain string.
   [:name [:or :string i18n/LocalizedString]]])

(mr/def ::CollectionTreeNode
  "A Collection in the `/tree` response. `:children` are nested tree nodes, except under `?shallow=true`, where the
  endpoint returns only the requested level and `:children` degrades to a boolean saying whether any exist."
  [:map
   [:id       ::CollectionId]
   [:name     [:or :string i18n/LocalizedString]]
   [:children {:optional true} [:or :boolean [:sequential [:ref ::CollectionTreeNode]]]]])

(mr/def ::ItemsResponse
  "A page of a Collection's items. `:available_models` is present only when the request asked for it, and
  `:limit`/`:offset` are dropped entirely in the `snippets` namespace, which is not paginated."
  [:map
   [:total            ms/IntGreaterThanOrEqualToZero]
   [:data             [:sequential :map]]
   [:models           [:maybe [:sequential :any]]]
   [:limit            {:optional true} [:maybe ms/IntGreaterThanOrEqualToZero]]
   [:offset           {:optional true} [:maybe ms/IntGreaterThanOrEqualToZero]]
   [:available_models {:optional true} [:sequential :any]]])

(defn- remove-other-users-personal-subcollections
  [user-id collections]
  (let [personal-ids         (set (collections-rest.db/other-users-personal-collection-ids user-id))
        personal-descendant? (fn [collection]
                               (let [first-parent-collection-id (-> collection
                                                                    :location
                                                                    collection/location-path->ids
                                                                    first)]
                                 (personal-ids first-parent-collection-id)))]
    (remove personal-descendant? collections)))

(defn- select-collections
  "Select collections based off certain parameters. If `shallow` is true, we select only the requested collection (or
  the root, if `collection-id` is `nil`) and its immediate children, to avoid reading the entire collection tree when it
  is not necessary.

  For archived, we can either include only archived items (when archived is truthy) or exclude archived items (when
  archived is falsey).

  The Trash Collection itself (the container for archived items) is *always* included.

  This will select only collections where `personal_owner_id` is not `nil`.

  To include library collections and their descendants, pass in `include-library?` as `true`.
  By default, library-type collections are excluded. "
  [{:keys [exclude-other-user-collections] :as options}]
  (cond->> (collections-rest.db/collections-for-listing options api/*current-user-id*)
    exclude-other-user-collections
    (remove-other-users-personal-subcollections api/*current-user-id*)))

(api.macros/defendpoint :get "/" :- [:sequential ::Collection]
  "Fetch a list of all Collections that the current user has read permissions for (`:can_write` is returned as an
  additional property of each Collection so you can tell which of these you have write permissions for.)

  By default, this returns non-archived Collections, but instead you can show archived ones by passing
  `?archived=true`.

  By default, admin users will see all collections. To hide other user's collections pass in
  `?exclude-other-user-collections=true`.

  If personal-only is `true`, then return only personal collections where `personal_owner_id` is not `nil`."
  [_route-params
   {:keys [archived exclude-other-user-collections namespace personal-only]} :- [:map {:closed true}
                                                                                 [:archived                       {:default false} [:maybe ms/BooleanValue]]
                                                                                 [:exclude-other-user-collections {:default false} [:maybe ms/BooleanValue]]
                                                                                 [:namespace                      {:optional true} [:maybe ms/NonBlankString]]
                                                                                 [:personal-only                  {:default false} [:maybe ms/BooleanValue]]]]
  (as->
   (select-collections {:archived                       (boolean archived)
                        :exclude-other-user-collections exclude-other-user-collections
                        :namespaces                     (cond
                                                          namespace [namespace]
                                                          (premium-features/enable-audit-app?) #{"analytics" nil}
                                                          :else
                                                          #{nil})
                        :shallow                        false
                        :personal-only                  personal-only
                        :include-library?               true}) collections
    ;; include Root Collection at beginning or results if archived or personal-only isn't `true`
    (if (or archived personal-only)
      collections
      (let [root (root-collection namespace)]
        (cond->> collections
          (mi/can-read? root)
          (cons root))))
    (t2/hydrate collections :can_write :is_personal :can_delete :is_remote_synced :parent_id)
    ;; remove the :metabase.collection.models.collection.root/is-root? tag since FE doesn't need it
    ;; and for personal/tenant collections we translate the name to user's locale
    (->> (for [collection collections]
           (-> collection
               (dissoc ::collection.root/is-root?)
               collection/maybe-mark-collection-as-library-root))
         collection/personal-collections-with-ui-details
         collection/maybe-localize-tenant-collection-names)))

(defn- prep-collection-for-export
  "Given a collection, tweaks it to be ready for returning to the FE.

  These same functions were called in several places in this namespace, so they're combined here to keep it DRY."
  [coll]
  (-> coll
      collection/personal-collection-with-ui-details
      collection/maybe-localize-tenant-collection-name
      collection/maybe-mark-collection-as-library-root))

(defn- shallow-tree-from-collection-id
  "Returns only a shallow Collection in the provided collection-id, e.g.

  location: /1/
  ```
  [{:name     \"A\"
    :location \"/1/\"
    :children 1}
    ...
    {:name     \"H\"
     :location \"/1/\"}]

  If the collection-id is nil, then we default to the root collection.
  ```"
  [colls]
  (->> colls
       (map prep-collection-for-export)
       (collection/collections->tree nil)
       (map (fn [coll] (update coll :children #(boolean (seq %)))))))

(api.macros/defendpoint :get "/tree" :- [:sequential ::CollectionTreeNode]
  "Similar to `GET /`, but returns Collections in a tree structure, e.g.

  ```
  [{:name     \"A\"
  :below    #{:card :dataset}
  :children [{:name \"B\"}
             {:name     \"C\"
              :here     #{:dataset :card}
              :below    #{:dataset :card}
              :children [{:name     \"D\"
                          :here     #{:dataset}
                          :children [{:name \"E\"}]}
                         {:name     \"F\"
                          :here     #{:card}
                          :children [{:name \"G\"}]}]}]}
  {:name \"H\"}]
  ```

  The here and below keys indicate the types of items at this particular level of the tree (here) and in its
  subtree (below).

  TODO: for historical reasons this returns Saved Questions AS 'card' AND Models as 'dataset'; we should fix this at
  some point in the future.

  By default, looks at the `analytics` (if enabled) and regular (`nil`) namespaces. You can optionally pass a
  `namespace` argument, or one or many `namespaces`, to specify the particular collection namespaces you wish to look
  at. For example, `namespaces=analytics&namespaces=` would match the default behavior.

  When `shallow` is true, takes an optional `collection-id` and returns only the requested collection (or
  the root, if `collection-id` is `nil`)."
  [_route-params
   {:keys [exclude-archived exclude-other-user-collections include-library
           namespace namespaces shallow collection-id]}
   :- [:map {:closed true}
       [:exclude-archived               {:default false} [:maybe :boolean]]
       [:exclude-other-user-collections {:default false} [:maybe :boolean]]
       [:include-library                {:default false} [:maybe :boolean]]
       [:namespace                      {:optional true} [:maybe ms/NonBlankString]]
       [:namespaces                     {:optional true} [:maybe [:vector {:decode/string (fn [x] (cond (vector? x) x x [x]))} :string]]]
       [:shallow                        {:default false} [:maybe :boolean]]
       [:collection-id                  {:optional true} [:maybe ms/PositiveInt]]]]
  (api/check-400
   (not (and namespace (seq namespaces))))
  (let [archived    (if exclude-archived false nil)
        namespaces (cond
                     namespace #{namespace}
                     (seq namespaces) (into #{} (map not-empty namespaces))
                     (premium-features/enable-audit-app?) #{nil "analytics"}
                     :else #{nil})
        collections (-> (select-collections {:archived                       archived
                                             :exclude-other-user-collections exclude-other-user-collections
                                             :namespaces                     namespaces
                                             :shallow                        shallow
                                             :collection-id                  collection-id
                                             :include-library?               include-library})
                        (t2/hydrate :can_write))]
    (if shallow
      (shallow-tree-from-collection-id collections)
      (let [collection-type-ids (merge (reduce (fn [acc {collection-id :collection_id, card-type :type, :as _card}]
                                                 (update acc (case (keyword card-type)
                                                               :model :dataset
                                                               :metric :metric
                                                               :card) conj collection-id))
                                               {:dataset #{}
                                                :metric  #{}
                                                :card    #{}}
                                               (collections-rest.db/unarchived-card-collection-types-reducible))
                                       ;; Tables in collections are an EE feature (library)
                                       (when (premium-features/has-feature? :library)
                                         {:table (->> (collections-rest.db/published-table-collection-ids)
                                                      (map :collection_id)
                                                      (into #{}))}))
            collections-with-details (map prep-collection-for-export collections)]
        (collection/collections->tree collection-type-ids collections-with-details)))))

;;; --------------------------------- Fetching a single Collection & its 'children' ----------------------------------

(def ^:private ModelString
  (into [:enum] children-query/valid-model-param-values))

(def ^:private Models
  "This is basically a union type. [[api.macros/defendpoint]] splits the string if it only gets one."
  [:vector {:decode/string (fn [x] (cond (vector? x) x x [x]))} ModelString])

(defmulti ^:private post-process-collection-children
  {:arglists '([model options collection rows])}
  (fn [model _ _ _]
    (keyword model)))

(defmethod ^:private post-process-collection-children :default
  [_ _ _ rows]
  rows)

(defmethod ^:private post-process-collection-children :document
  [_ _ collection rows]
  (documents/with-content-gate-cache
    (map #(dissoc % :exploration_id)
         (t2/hydrate (for [document rows]
                       (-> (t2/instance :model/Document document)
                           (assoc :location (or (when collection
                                                  (collection/children-location collection))
                                                "/"))
                           (dissoc :namespace)
                           (update :archived api/bit->boolean)
                           (update :archived_directly api/bit->boolean))) :can_write :can_restore :can_delete :is_remote_synced :collection_namespace))))

(defmethod ^:private post-process-collection-children :exploration
  [_ _ collection rows]
  (t2/hydrate (for [exploration rows]
                (-> (t2/instance :model/Exploration exploration)
                    (assoc :location (or (when collection
                                           (collection/children-location collection))
                                         "/"))
                    (update :archived api/bit->boolean)
                    (update :archived_directly api/bit->boolean))) :can_write :can_restore :can_delete))

(defmethod post-process-collection-children :pulse
  [_ _ _ rows]
  (for [row rows]
    (dissoc row
            :description :display :authority_level :moderated_status :icon :personal_owner_id :namespace
            :collection_preview :dataset_query :table_id :query_type :is_upload :collection_namespace)))

(defmethod post-process-collection-children :timeline
  [_ _options _collection rows]
  (for [row rows]
    (dissoc row
            :description :display :collection_position :authority_level :moderated_status
            :collection_preview :dataset_query :table_id :query_type :is_upload :namespace)))

(defmethod post-process-collection-children :snippet
  [_ _options _collection rows]
  (for [row rows]
    (-> (dissoc row
                :description :collection_position :display :authority_level
                :moderated_status :icon :personal_owner_id :collection_preview
                :dataset_query :table_id :query_type :is_upload :namespace)
        (assoc :collection_namespace "snippets"))))

(defn- post-process-card-row [row]
  (-> (t2/instance :model/Card row)
      ;; `card-query` filters `[:= :c.document_id nil]` unconditionally, so every row here is known
      ;; not to belong to a Document. Say so on the instance: `mi/can-write?` consults `document_id`
      ;; (a Document-scoped Card is gated by its Document), and an instance that merely *omits* the
      ;; column makes it resolve one from the primary key instead — one extra query per row, on a
      ;; listing that renders a full page of them. Stamping it rather than selecting it keeps the
      ;; column out of `all-select-columns`, which every model's union arm would otherwise have to
      ;; pad, and out of the response body.
      (assoc :document_id nil)
      (update :dataset_query (:out lib-be/transform-query))
      (update :collection_preview api/bit->boolean)
      (update :archived api/bit->boolean)
      (update :archived_directly api/bit->boolean)))

(defn- post-process-card-row-after-hydrate [row]
  (-> (dissoc row :authority_level :icon :personal_owner_id :dataset_query :table_id :query_type :is_upload :namespace
              ;; internal-only: stamped in `post-process-card-row` for the permission check
              :document_id)
      (update :dashboard #(when % (select-keys % [:id :name :moderation_status])))
      (assoc :fully_parameterized (queries/fully-parameterized? row))))

(defn- post-process-card-like
  [{:keys [hydrate-based-on-upload]} rows]
  (let [hydration [:can_write
                   :can_restore
                   :can_delete
                   :dashboard_count
                   :is_remote_synced
                   :collection_namespace
                   [:dashboard :moderation_status]]]
    (as-> (map post-process-card-row rows) $
      (apply t2/hydrate $ hydration)
      (cond-> $
        hydrate-based-on-upload upload/model-hydrate-based-on-upload)
      (map post-process-card-row-after-hydrate $))))

(defmethod post-process-collection-children :card
  [_ options _ rows]
  (post-process-card-like options rows))

(defmethod post-process-collection-children :metric
  [_ options _ rows]
  (post-process-card-like options rows))

(defmethod post-process-collection-children :dataset
  [_ options _ rows]
  (post-process-card-like (assoc options :hydrate-based-on-upload true) rows))

(defn- post-process-dashboard [parent-collection dashboard]
  (-> (t2/instance :model/Dashboard dashboard)
      (assoc :location (or (when parent-collection
                             (collection/children-location parent-collection))
                           "/"))
      (assoc :is_tenant_dashboard (collection/shared-tenant-collection? parent-collection))
      (update :archived api/bit->boolean)
      (update :archived_directly api/bit->boolean)
      (t2/hydrate :can_write :can_restore :can_delete :is_remote_synced :collection_namespace)
      (dissoc :display :authority_level :icon :personal_owner_id :collection_preview
              :dataset_query :table_id :query_type :is_upload)))

(defmethod post-process-collection-children :dashboard
  [_ _options parent-collection rows]
  (->> rows
       collections/annotate-dashboards
       (map (partial post-process-dashboard parent-collection))))

(defn- annotate-collections
  [parent-coll colls {:keys [show-dashboard-questions?]}]
  (let [descendant-collections (collection/descendants-flat parent-coll nil
                                                            (collection/visible-collection-filter-clause
                                                             :id
                                                             {:include-archived-items :all}))

        descendant-collection-ids (mapv u/the-id descendant-collections)

        child-type->coll-id-set
        (reduce (fn [acc {collection-id :collection_id, card-type :type, :as _card}]
                  (update acc (case (keyword card-type)
                                :model :dataset
                                :metric :metric
                                :card) conj collection-id))
                {:dataset #{}
                 :metric  #{}
                 :card    #{}}
                (when (seq descendant-collection-ids)
                  (collections-rest.db/unarchived-card-collection-types-in-reducible
                   descendant-collection-ids
                   (not show-dashboard-questions?))))

        ;; Tables in collections are an EE feature (library)
        collections-containing-tables
        (if (premium-features/has-feature? :library)
          (->> (when (seq descendant-collection-ids)
                 (collections-rest.db/published-table-collection-ids-in descendant-collection-ids))
               (map :collection_id)
               (into #{}))
          #{})

        collections-containing-transforms
        (if (seq (transforms.gating/enabled-source-types))
          (->> (when (seq descendant-collection-ids)
                 (collections-rest.db/transform-collection-ids-in descendant-collection-ids (transforms.gating/enabled-source-types)))
               (map :collection_id)
               (into #{}))
          #{})

        collections-containing-dashboards
        (->> (when (seq descendant-collection-ids)
               (collections-rest.db/unarchived-dashboard-collection-ids-in descendant-collection-ids))
             (map :collection_id)
             (into #{}))

        ;; the set of collections that contain collections (in terms of *effective* location)
        collections-containing-collections
        (->> (t2/hydrate descendant-collections :effective_parent :is_remote_synced)
             (reduce (fn [accu {:keys [effective_parent] :as _coll}]
                       (let [parent-id (:id effective_parent)]
                         (conj accu parent-id)))
                     #{}))

        child-type->coll-id-set
        (merge child-type->coll-id-set
               {:table collections-containing-tables
                :collection collections-containing-collections
                :dashboard collections-containing-dashboards
                :transform collections-containing-transforms})

        ;; why are we calling `annotate-collections` on all descendants, when we only need the collections in `colls`
        ;; to be annotated? Because `annotate-collections` works by looping through the collections it's passed and
        ;; using them to figure out the ancestors of a given collection. This could use a refactor - probably the
        ;; caller of `annotate-collections` could be generating both `child-type->parent-ids` and
        ;; `child-type->ancestor-ids`.
        coll-id->annotated (m/index-by :id (collection/annotate-collections child-type->coll-id-set descendant-collections))]
    (for [coll colls]
      (merge coll (select-keys (coll-id->annotated (:id coll)) [:here :below])))))

(defmethod post-process-collection-children :collection
  [_ options parent-collection rows]
  (letfn [(update-personal-collection [{:keys [personal_owner_id] :as row}]
            (if personal_owner_id
              ;; when fetching root collection, we might have personal collection
              (assoc row :name (collection/user->personal-collection-name (:personal_owner_id row) :user))
              (dissoc row :personal_owner_id)))]
    (for [row (annotate-collections parent-collection rows options)]
      (let [type-value (:type row)]
        (-> (t2/instance :model/Collection row)
            collection/maybe-localize-system-collection-name
            collection/maybe-localize-tenant-collection-name
            collection/maybe-mark-collection-as-library-root
            (update :archived api/bit->boolean)
            (update :is_remote_synced api/bit->boolean)
            (t2/hydrate :can_write :effective_location :can_restore :can_delete :is_shared_tenant_collection)
            (dissoc :collection_position :display :moderated_status :icon
                    :collection_preview :dataset_query :table_id :query_type :is_upload)
            (assoc :type type-value)
            update-personal-collection)))))

(defmethod post-process-collection-children :table
  [_ {:keys [models]} _collection rows]
  (let [tables (map #(-> (t2/instance :model/Table %)
                         (update :archived api/bit->boolean)) rows)]
    (if (contains? models :measure)
      (t2/hydrate tables :measures)
      tables)))

;;; TODO -- consider whether this function belongs here or in [[metabase.revisions.models.revision.last-edit]]
(mu/defn- coalesce-edit-info :- revisions/MaybeAnnotated
  "Hoist all of the last edit information into a map under the key :last-edit-info. Considers this information present
  if `:last_edit_user` is not nil."
  [row]
  (letfn [(select-as [original k->k']
            (reduce (fn [m [k k']] (assoc m k' (get original k)))
                    {}
                    k->k'))]
    (let [mapping {:last_edit_user       :id
                   :last_edit_last_name  :last_name
                   :last_edit_first_name :first_name
                   :last_edit_email      :email
                   :last_edit_timestamp  :timestamp}]
      (cond-> (apply dissoc row (keys mapping))
        ;; don't use contains as they all have the key, we care about a value present
        (:last_edit_user row) (assoc :last-edit-info (select-as row mapping))))))

(defn- remove-unwanted-keys [{:keys [model] :as row}]
  (cond-> (dissoc row :model_ranking :archived_directly :total_count :collection_type)
    (not= model "collection") (dissoc :type)))

(defn- model-name->toucan-model [model-name]
  (case (keyword model-name)
    :collection  :model/Collection
    :card        :model/Card
    :dataset     :model/Card
    :metric      :model/Card
    :dashboard   :model/Dashboard
    :document    :model/Document
    :exploration :model/Exploration
    :pulse       :model/Pulse
    :snippet     :model/NativeQuerySnippet
    :table       :model/Table
    :timeline    :model/Timeline
    :transform   :model/Transform))

(defn post-process-rows
  "Post process any data. Have a chance to process all of the same type at once using
  `post-process-collection-children`. Must respect the order passed in."
  [options collection rows]
  (->> (map-indexed (fn [i row] (vary-meta row assoc ::index i)) rows) ;; keep db sort order
       (group-by :model)
       (into []
             (comp (map (fn [[model rows]]
                          (post-process-collection-children (keyword model) options collection rows)))
                   cat
                   (map coalesce-edit-info)))
       (map remove-unwanted-keys)
       ;; the collection these are presented "in" is the ID of the collection we're getting `/items` on.
       (map #(assoc % :collection_id (:id collection)))
       (sort-by (comp ::index meta))))

(defn- total-count
  "The size of the whole result set `rows` is a page of, read off the `total_count` window column.

  A page past the end of the result set comes back empty and so carries no window column; in that case read the count
  off the first row of the same query without its pagination."
  [rows collection models options offset]
  (or (some-> rows first :total_count)
      (when (pos? (or offset 0))
        (some-> (collections-rest.db/collection-children-rows collection models options {:limit 1}) first :total_count))
      0))

(defn- collection-children*
  [collection models options]
  (let [models      (sort (map keyword models))
        limit       (request/limit)
        offset      (request/offset)
        ;; A limit of 0 asks for the count alone rather than for a page.
        count-only? (= limit 0)
        ;; We didn't implement collection pagination for snippets namespace for root/items
        ;; Rip out the limit for now and put it back in when we want it.
        page        (when-not (or (nil? limit)
                                  (nil? offset)
                                  (and (= (:collection-namespace options) "snippets")
                                       (not count-only?)))
                      ;; If limit is 0, we still execute the query with a limit of 1 so that we fetch a :total_count
                      {:limit  (if count-only? 1 limit)
                       :offset offset})
        rows        (tracing/with-span :db-app "db-app.collection-items-query" {:collection/id (:id collection)}
                      (collections-rest.db/collection-children-rows collection models options page))
        res         {:total  (total-count rows collection models options offset)
                     :data   (if count-only?
                               []
                               (tracing/with-span :db-app "db-app.collection-items-post-process" {:collection/id (:id collection)}
                                 (post-process-rows options collection rows)))
                     :models models}
        limit-res   (assoc res
                           :limit  (request/limit)
                           :offset (request/offset))]
    (if (= (:collection-namespace options) "snippets")
      res
      limit-res)))

(defn- valid-collection-models
  "Return every item model that can appear in `collection-namespace`."
  [collection-namespace]
  (for [model-kw (cond-> [:collection :dataset :metric :card :dashboard :pulse :snippet :timeline :document :exploration :transform]
                   ;; Tables in collections are an EE feature (library)
                   (premium-features/has-feature? :library) (conj :table))
        :let     [toucan-model       (model-name->toucan-model model-kw)
                  allowed-namespaces (collection/allowed-namespaces toucan-model)]
        :when    (or (= model-kw :collection)
                     (contains? allowed-namespaces (keyword collection-namespace)))]
    model-kw))

(mu/defn collection-children
  "Fetch a sequence of 'child' objects belonging to a Collection, filtered using `options`."
  [{collection-namespace :namespace, :as collection} :- collection/CollectionWithLocationAndIDOrRoot
   {:keys [models], :as options}                     :- children-query/CollectionChildrenOptions]
  (let [valid-models (cond->> (valid-collection-models collection-namespace)
                       (seq models) (filter models))]
    (if (seq valid-models)
      (collection-children* collection valid-models (assoc options :collection-namespace collection-namespace))
      {:total  0
       :data   []
       :limit  (request/limit)
       :offset (request/offset)
       :models valid-models})))

(defn- filterable-models
  "The models that can appear as a filterable item of `collection`. Snippets are never included: they are not a
  filterable type. When present, `restrict-models` limits the set."
  [collection restrict-models]
  (cond->> (remove #{:snippet} (valid-collection-models (:namespace collection)))
    (seq restrict-models) (filter restrict-models)))

(mu/defn- collection-filter-metadata :- [:map
                                         [:available_models [:sequential :string]]]
  "Return the models that have at least one visible item in `collection`. Respect the requested scope and visibility,
  but ignore model and search filters. When present, `restrict-models` limits the candidate models. Snippets are never
  reported: they are not a filterable type."
  [collection      :- collection/CollectionWithLocationAndIDOrRoot
   restrict-models :- [:maybe [:set :keyword]]
   options         :- children-query/CollectionChildrenOptions]
  (let [candidates (filterable-models collection restrict-models)
        options    (-> options
                       (dissoc :models :search-text)
                       (assoc :collection-namespace (:namespace collection)))]
    ;; This result is independent of search and model filters. Requesting it with every filter update
    ;; repeats the same EXISTS probes; a separately cached request could avoid that work.
    (if (empty? candidates)
      {:available_models []}
      (let [row (first (collections-rest.db/collection-filter-metadata-rows collection (vec candidates) options))]
        {:available_models
         (->> candidates
              (keep (fn [model]
                      (when (api/bit->boolean (get row model))
                        (name model))))
              sort
              vec)}))))

(mr/def ::ItemsMetadata
  [:map
   [:available_models [:sequential :string]]
   ;; Named apart from the `total` of a paged, filtered items response: this is the size of the whole list.
   [:total_items ms/IntGreaterThanOrEqualToZero]])

(mu/defn- collection-items-metadata :- ::ItemsMetadata
  "Metadata about the items list of `collection`, independent of the search filter that the items endpoints accept:
  the models with at least one visible item and the number of items in the whole list. `restrict-models`, when
  present, limits both to those models, and `options` carries the rest of the scope (archived, pinned state, ...),
  so the metadata describes the list a client actually shows. Both halves count the same models, so a type that is
  never reported -- a snippet -- is never counted either."
  [collection      :- collection/CollectionWithLocationAndIDOrRoot
   restrict-models :- [:maybe [:set :keyword]]
   options         :- children-query/CollectionChildrenOptions]
  (let [options (dissoc options :models :search-text)
        models  (set (filterable-models collection restrict-models))]
    (assoc (collection-filter-metadata collection restrict-models options)
           ;; An empty model set means "nothing to count"; `collection-children` would read it as "no restriction".
           :total_items (if (empty? models)
                          0
                          (request/with-limit-and-offset 0 0
                            (:total (collection-children collection (assoc options :models models))))))))

(mu/defn- collection-detail
  "Add a standard set of details to `collection`, including things like `effective_location`.
  Works for either a normal Collection or the Root Collection."
  [collection :- collection/CollectionWithLocationAndIDOrRoot]
  (-> collection
      prep-collection-for-export
      (t2/hydrate :parent_id :effective_location [:effective_ancestors :can_write] :can_write :is_personal :can_restore :can_delete)))

(api.macros/defendpoint :get "/trash" :- ::Collection
  "Fetch the trash collection, as in `/api/collection/:trash-id`"
  []
  (collection-detail (api/read-check (collection/trash-collection))))

(mr/def ::DashboardQuestionCandidate
  [:map
   [:id pos-int?]
   [:name string?]
   [:description [:maybe string?]]
   [:sole_dashboard_info
    [:map
     [:id pos-int?]
     [:name string?]
     [:description [:maybe string?]]]]])

(mr/def ::DashboardQuestionCandidatesResponse
  [:map
   [:data [:sequential ::DashboardQuestionCandidate]]
   [:total integer?]])

(mu/defn- dashboard-question-candidates
  "Implementation for the `dashboard-question-candidates` endpoints."
  [collection-id]
  (api/check-403 api/*is-superuser?*)
  (let [all-cards-in-collection (t2/hydrate (collections-rest.db/top-level-cards-in-collection collection-id) :in_dashboards)]
    (filter
     (fn [card]
       (and
        ;; we're a good candidate if:
        ;; - we're only in one dashboard
        (queries/sole-dashboard-id card)
        ;; - that one dashboard is in the same collection
        (= (:collection_id card)
           (-> card :in_dashboards first :collection_id))))
     all-cards-in-collection)))

(mu/defn- present-dashboard-question-candidate
  [{:keys [in_dashboards] :as card}]
  (-> card
      (select-keys [:id :name :description])
      (assoc :sole_dashboard_info (-> in_dashboards first (select-keys [:id :name :description])))))

(mu/defn- present-dashboard-question-candidates
  [cards]
  ;; we're paginating in Clojure rather than in the query itself because the criteria here is quite complicated to
  ;; express in SQL: we need to join to `report_dashboardcard` AND `dashboardcard_series`, and find cards that have
  ;; exactly one matching dashboard across both of those joins. I'm sure it's doable, but for now we can just do this
  ;; in clojure. We're only working one collection at a time here so hopefully this should be relatively performant.
  {:data (map present-dashboard-question-candidate (cond->> cards
                                                     (request/paged?) (drop (request/offset))
                                                     (request/paged?) (take (request/limit))))
   :total (count cards)})

(api.macros/defendpoint :get "/:id/dashboard-question-candidates" :- ::DashboardQuestionCandidatesResponse
  "Find cards in this collection that can be moved into dashboards in this collection.

  To be eligible, a card must only appear in one dashboard (which is also in this collection), and must not already be a
  dashboard question."
  [{:keys [id]} :- [:map {:closed true} [:id ms/PositiveInt]]]
  (api/read-check :model/Collection id)
  (present-dashboard-question-candidates
   (dashboard-question-candidates id)))

(api.macros/defendpoint :get "/root/dashboard-question-candidates" :- ::DashboardQuestionCandidatesResponse
  "Find cards in the root collection that can be moved into dashboards in the root collection. (Same as the above
  endpoint, but for the root collection)"
  []
  (present-dashboard-question-candidates
   (dashboard-question-candidates nil)))

(mr/def ::MoveDashboardQuestionCandidatesResponse
  [:map
   [:moved [:sequential ms/PositiveInt]]])

(defn- move-dashboard-question-candidates
  "Move dash"
  [id card-ids]
  (let [cards (cond->> (dashboard-question-candidates id)
                (some? card-ids) (filter #(contains? card-ids (:id %))))]
    (t2/with-transaction [_conn]
      (mapv (fn [{:as card :keys [in_dashboards]}]
              (queries/update-card! {:card-before-update card
                                     :card-updates {:dashboard_id (-> in_dashboards first :id)}
                                     :actor @api/*current-user*
                                     :delete-old-dashcards? false})
              (:id card))
            cards))))

(api.macros/defendpoint :post "/:id/move-dashboard-question-candidates" :- ::MoveDashboardQuestionCandidatesResponse
  "Move candidate cards to the dashboards they appear in."
  [{:keys [id]} :- [:map {:closed true} [:id ms/PositiveInt]]
   _query-params
   {:keys [card_ids]} :- [:maybe
                          [:map {:closed true} [:card_ids {:optional true}
                                                [:set ms/PositiveInt]]]]]
  (api/read-check :model/Collection id)
  {:moved (move-dashboard-question-candidates id card_ids)})

(api.macros/defendpoint :post "/root/move-dashboard-question-candidates" :- ::MoveDashboardQuestionCandidatesResponse
  "Move candidate cards to the dashboards they appear in (for the root collection)"
  [_route-params
   _query-params
   {:keys [card_ids]} :- [:maybe
                          [:map {:closed true} [:card_ids {:optional true}
                                                [:set ms/PositiveInt]]]]]
  {:moved (move-dashboard-question-candidates nil card_ids)})

;;; -------------------------------------------- GET /api/collection/root --------------------------------------------

(defn- root-collection [collection-namespace]
  (collection-detail (collection/root-collection-with-ui-details collection-namespace)))

(api.macros/defendpoint :get "/root" :- ::Collection
  "Return the 'Root' Collection object with standard details added"
  [_route-params
   {:keys [namespace]} :- [:map {:closed true}
                           [:namespace {:optional true} [:maybe ms/NonBlankString]]]]
  (-> (root-collection namespace)
      (api/read-check)
      (dissoc ::collection.root/is-root?)))

(defn- visible-model-kwds
  "If you pass in explicitly keywords that you can't see, you can't see them.
  But there is an exception for the collections,
  because you might not be able to see the top-level collections
  but be able to see, children of those invisible top-level collections."
  [root-collection model-set]
  (if (mi/can-read? root-collection)
    model-set
    (if (or (empty? model-set) (contains? model-set :collection))
      #{:collection}
      #{:no_models})))

(def ^:private namespaces-holding-non-collection-types
  "We can't really *know* what namespace something with a `nil` `collection_id` is in, unless it's one of the special
  types that can only live in one namespace.

  If you're looking in the root collection of one of these namespaces, we'll allow you to list any type of model.

  Otherwise, we'll just show you collections."
  #{nil "snippets" "transforms"})

(api.macros/defendpoint :get "/root/items" :- ::ItemsResponse
  "Fetch objects that the current user should see at their root level. As mentioned elsewhere, the 'Root' Collection
  doesn't actually exist as a row in the application DB: it's simply a virtual Collection where things with no
  `collection_id` exist. It does, however, have its own set of Permissions.

  This endpoint will actually show objects with no `collection_id` for Users that have Root Collection
  permissions, but for people without Root Collection perms, we'll just show the objects that have an effective
  location of `/`.

  This endpoint is intended to power a 'Root Folder View' for the Current User, so regardless you'll see all the
  top-level objects you're allowed to access.

  By default, this will show the 'normal' Collections namespace; to view a different Collections namespace, such as
  `snippets`, you can pass the `?namespace=` parameter.

  By default, library collections are excluded from the results; to include them, pass `?include-library=true`.

  Pass `?q=` to filter items by name or last editor. Pass `?include-available-models=true` to include the models that
  have at least one visible item in the requested scope.

  Note that this endpoint should return results in a similar shape to `/api/dashboard/:id/items`, so if this is
  changed, that should too."
  [_route-params
   {:keys [models archived namespace pinned-state sort-column sort-direction official-collections-first
           include-library collection-type
           show-dashboard-questions show-exploration-documents
           q include-available-models]} :- [:map {:closed true}
                                            [:models                      {:optional true} [:maybe Models]]
                                            [:collection-type             {:optional true} children-query/CollectionType]
                                            [:archived                    {:default false} [:maybe ms/BooleanValue]]
                                            [:namespace                   {:optional true} [:maybe ms/NonBlankString]]
                                            [:include-library             {:default false} [:maybe ms/BooleanValue]]
                                            [:pinned-state                {:optional true} [:maybe (into [:enum] children-query/valid-pinned-state-values)]]
                                            [:sort-column                 {:optional true} [:maybe (into [:enum] children-query/valid-sort-columns)]]
                                            [:sort-direction              {:optional true} [:maybe (into [:enum] children-query/valid-sort-directions)]]
                                            [:official-collections-first  {:optional true} [:maybe ms/MaybeBooleanValue]]
                                            [:show-dashboard-questions    {:optional true} [:maybe ms/MaybeBooleanValue]]
                                            [:show-exploration-documents  {:optional true} [:maybe ms/MaybeBooleanValue]]
                                            [:q                           {:optional true} [:maybe :string]]
                                            [:include-available-models    {:default false} [:maybe ms/BooleanValue]]]]
  ;; Return collection contents, including Collections that have an effective location of being in the Root
  ;; Collection for the Current User.
  (let [root-collection (assoc collection/root-collection :namespace namespace)
        model-set       (set (map keyword (u/one-or-many models)))
        model-kwds      (visible-model-kwds root-collection model-set)
        restrict-models (when (or (not (contains? namespaces-holding-non-collection-types namespace))
                                  (not (mi/can-read? root-collection)))
                          #{:collection})
        options         {:archived?                   (boolean archived)
                         :show-dashboard-questions?   (boolean show-dashboard-questions)
                         :show-exploration-documents? (boolean show-exploration-documents)
                         :collection-type             collection-type
                         :include-library?            include-library
                         :models                      (if-not (contains? namespaces-holding-non-collection-types namespace)
                                                        #{:collection}
                                                        model-kwds)
                         :pinned-state                (keyword pinned-state)
                         :search-text                 q
                         :sort-info                   {:sort-column                 (or (some-> sort-column children-query/normalize-sort-choice) :name)
                                                       :sort-direction              (or (some-> sort-direction children-query/normalize-sort-choice) :asc)
                                                       ;; default to sorting official collections first, but provide the option not to
                                                       :official-collections-first? (or (nil? official-collections-first)
                                                                                        (boolean official-collections-first))}}]
    (cond-> (collection-children root-collection options)
      include-available-models
      (merge (collection-filter-metadata root-collection restrict-models options)))))

(api.macros/defendpoint :get "/root/items/metadata" :- ::ItemsMetadata
  "Metadata about the Root Collection's items list: the models with at least one visible item plus the item count.
  Unlike `GET /api/collection/root/items`, the result does not depend on search text; pass that endpoint's other
  scope params so the metadata describes the list being shown."
  [_route-params
   {:keys [models archived namespace pinned-state collection-type include-library
           show-dashboard-questions show-exploration-documents]} :- [:map {:closed true}
                                                                     [:models                     {:optional true} [:maybe Models]]
                                                                     [:archived                   {:default false} [:maybe ms/BooleanValue]]
                                                                     [:namespace                  {:optional true} [:maybe ms/NonBlankString]]
                                                                     [:pinned-state               {:optional true} [:maybe (into [:enum] children-query/valid-pinned-state-values)]]
                                                                     [:collection-type            {:optional true} children-query/CollectionType]
                                                                     [:include-library            {:default false} [:maybe ms/BooleanValue]]
                                                                     [:show-dashboard-questions   {:default false} [:maybe ms/BooleanValue]]
                                                                     [:show-exploration-documents {:default false} [:maybe ms/BooleanValue]]]]
  (let [root-collection (assoc collection/root-collection :namespace namespace)
        model-set       (set (map keyword (u/one-or-many models)))
        restrict-models (visible-model-kwds root-collection model-set)]
    (collection-items-metadata root-collection restrict-models
                               {:archived?                   (boolean archived)
                                :show-dashboard-questions?   (boolean show-dashboard-questions)
                                :show-exploration-documents? (boolean show-exploration-documents)
                                :collection-type             collection-type
                                :include-library?            include-library
                                :pinned-state                (keyword pinned-state)
                                :sort-info                   {:sort-column                 :name
                                                              :sort-direction              :asc
                                                              :official-collections-first? false}})))

;;; ----------------------------------------- Creating/Editing a Collection ------------------------------------------

;; Create-collection business logic lives in `metabase.collections.create` so that non-REST
;; callers (notably the agent API's MCP `create_collection` tool) can use the same entry point
;; without crossing the module-linter's non-rest -> rest barrier. Re-exported through
;; `metabase.collections.core` as `create-collection!`, `apply-defaults-to-collection`,
;; `validate-new-tenant-collection!`, etc.

(api.macros/defendpoint :post "/" :- ::Collection
  "Create a new Collection."
  [_route-params
   _query-params
   body :- [:map {:closed true}
            [:name            ms/NonBlankString]
            [:description     {:optional true} [:maybe ms/NonBlankString]]
            [:parent_id       {:optional true} [:maybe ms/PositiveInt]]
            [:namespace       {:optional true} [:maybe ms/NonBlankString]]
            [:authority_level {:optional true} [:maybe collection/AuthorityLevel]]]]
  (collections/create-collection! body))

(defn- maybe-send-archived-notifications!
  "When a collection is archived, all of it's cards are also marked as archived, but this is down in the model layer
  which will not cause the archive notification code to fire. This will delete the relevant alerts and notify the
  users just as if they had be archived individually via the card API."
  [& {:keys [collection-before-update collection-updates actor]}]
  (when (api/column-will-change? :archived collection-before-update collection-updates)
    (doseq [card (collections-rest.db/cards-in-collection (u/the-id collection-before-update))]
      (notification/delete-card-notifications-and-notify! :event/card-update.notification-deleted.card-archived actor card))))

(defn- move-collection!
  "If input the `PUT /api/collection/:id` endpoint (`collection-updates`) specify that we should *move* a Collection, do
  appropriate permissions checks and move it (and its descendants)."
  [collection-before-update collection-updates]
  ;; sanity check: a [new] parent_id update specified in the PUT request?
  (when (contains? collection-updates :parent_id)
    (let [orig-location (:location collection-before-update)
          new-parent-id (:parent_id collection-updates)
          new-parent    (if new-parent-id
                          (collections-rest.db/collection-location-columns new-parent-id)
                          collection/root-collection)
          new-location  (collection/children-location new-parent)]
      ;; check and make sure we're actually supposed to be moving something
      (when (not= orig-location new-location)
        ;; Check that we have write perms on the new parent collection
        (api/write-check new-parent)
        ;; ok, make sure we have perms to do this operation
        (api/check-403
         (perms/set-has-full-permissions-for-set? @api/*current-user-permissions-set*
                                                  (collection/perms-for-moving collection-before-update new-parent)))
        (api/check
         (not (collection/shared-tenant-collection? new-parent)))
        ;; ok, we're good to move!
        (collection/move-collection! collection-before-update new-location
                                     (collection/moving-into-remote-synced? (collection/location-path->parent-id orig-location)
                                                                            new-parent-id))))))

(defn- archive-collection!
  "If input to the `PUT /api/collection/:id` endpoint specifies that we should archive a collection, do the appropriate
  permissions checks and then move it to the trash."
  [collection-before-update collection-updates]
  ;; sanity check
  (when (api/column-will-change? :archived collection-before-update collection-updates)
    (collection/archive-or-unarchive-collection!
     collection-before-update
     (select-keys collection-updates [:parent_id :archived]))
    (maybe-send-archived-notifications! {:collection-before-update collection-before-update
                                         :collection-updates       collection-updates
                                         :actor                    @api/*current-user*})))

(defn- move-or-archive-collection-if-needed!
  "If input to the `PUT /api/collection/:id` endpoint (`collection-updates`) specifies that we should either move or
  archive the collection (archiving means 'moving to the trash' so it makes sense to deal with them together), do the
  appropriate permissions checks and changes."
  [collection-before-update collection-updates]
  (condp #(api/column-will-change? %1 collection-before-update %2) collection-updates
    :archived (archive-collection! collection-before-update collection-updates)
    :parent_id (move-collection! collection-before-update collection-updates)
    :no-op))

;;; ------------------------------------------------ GRAPH ENDPOINTS -------------------------------------------------

(def CollectionID "an id for a [[Collection]]."
  [pos-int? {:title "Collection ID"}])

(def GroupID "an id for a [[PermissionsGroup]]."
  [pos-int? {:title "Group ID"}])

(def CollectionPermissions
  "Malli enum for what sort of collection permissions we have. (:write :read or :none)"
  [:and keyword? [:enum :write :read :none]])

(def GroupPermissionsGraph
  "Map describing permissions for a (Group x Collection)"
  [:map-of
   [:or
    ;; We need the [:and keyword ...] piece to make decoding "root" work. There's a merged fix for this, but it hasn't
    ;; been released as of malli 0.9.2. When the malli version gets bumped, we should remove this.
    [:and keyword? [:= :root]]
    CollectionID]
   CollectionPermissions])

(def PermissionsGraph
  "Map describing permissions for 1 or more groups.
  Revision # is used for consistency"
  [:map
   [:revision {:optional true} [:maybe int?]]
   [:groups [:map-of GroupID GroupPermissionsGraph]]])

(api.macros/defendpoint :get "/graph" :- PermissionsGraph
  "Fetch a graph of all Collection Permissions."
  [_route-params
   {:keys [namespace]} :- [:map {:closed true}
                           [:namespace {:optional true} [:maybe ms/NonBlankString]]]]
  (api/check-superuser)
  (perms/graph namespace))

(def ^:private RequestId
  "A group or collection ID as it arrives as a JSON object key in a `PUT /graph` body: the request middleware keywordizes
  it, so it is turned back into the string it was and has to spell the integer [[decode-graph]] parses."
  [:and
   [:string {:decode/api #(cond-> % (keyword? %) name)}]
   [:re {:error/message "an ID"} #"\d+"]])

(def ^:private RequestPermissionsGroups
  "The `:groups` of a [[PermissionsGraph]] as it arrives in a `PUT /graph` body, before [[decode-graph]] coerces its
  keys."
  [:multi {:dispatch map?}
   [true  [:map-of RequestId [:multi {:dispatch map?}
                              [true  [:map-of [:or [:= :root] RequestId] (ms/enum-keywords-and-strings :write :read :none)]]
                              [false [:fn {:error/message "map"} map?]]]]]
   [false [:fn {:error/message "map"} map?]]])

(def ^:private graph-decoder
  "Building it this way is a lot faster then calling mc/decode <value> <schema> <transformer>"
  (mc/decoder PermissionsGraph (mtx/string-transformer)))

(defn- decode-graph [permission-graph]
  ;; TODO: should use a coercer for this?
  (graph-decoder permission-graph))

(defn- update-graph!
  "Handles updating the graph for a given namespace."
  [namespace graph skip-graph force?]
  (perms/update-graph! namespace graph force?)
  (if skip-graph
    {:revision (perms/latest-collection-permissions-revision-id)}
    (perms/graph namespace)))

(api.macros/defendpoint :put "/graph" :- [:map [:revision {:optional true} [:maybe :int]]]
  "Do a batch update of Collections Permissions by passing in a modified graph. Will overwrite parts of the graph that
  are present in the request, and leave the rest unchanged.

  If the `force` query parameter is `true`, a `revision` number is not required. The provided graph will be persisted
  as-is, and has the potential to clobber other writes that happened since the last read.

  If the `skip_graph` query parameter is `true`, it will only return the current revision, not the entire permissions
  graph."
  [_route-params
   {:keys [skip-graph force]} :- [:map {:closed true}
                                  [:force      {:default false} [:maybe ms/BooleanValue]]
                                  [:skip-graph {:default false} [:maybe ms/BooleanValue]]]
   {:keys [namespace revision groups]} :- [:map {:closed true}
                                           [:namespace {:optional true} [:maybe ms/NonBlankString]]
                                           [:revision  {:optional true} [:maybe ms/Int]]
                                           [:groups    RequestPermissionsGroups]]
   request]
  (api/check-superuser)
  (let [raw-groups (get-in request [:body :groups])]
    (api/check-no-dropped-entries raw-groups groups)
    (doseq [[group-id collection-id->perm] groups]
      (api/check-no-dropped-entries (get raw-groups (keyword group-id)) collection-id->perm)))
  (update-graph! namespace
                 (decode-graph {:revision revision :groups groups})
                 skip-graph
                 force))

;;; ------------------------------------------ Fetching a single Collection -------------------------------------------

(api.macros/defendpoint :get "/:id" :- ::Collection
  "Fetch a specific Collection with standard details added"
  [{:keys [id]} :- [:map {:closed true}
                    [:id [:or ms/PositiveInt ms/NanoIdString]]]]
  (let [resolved-id (eid-translation/->id-or-404 :collection id)]
    (collection-detail (api/read-check :model/Collection resolved-id))))

(api.macros/defendpoint :put "/:id" :- ::Collection
  "Modify an existing Collection, including archiving or unarchiving it, or moving it."
  [{:keys [id]} :- [:map {:closed true}
                    [:id ms/PositiveInt]]
   _query-params
   {authority-level :authority_level, :as collection-updates} :- [:map {:closed true}
                                                                  [:name             {:optional true} [:maybe ms/NonBlankString]]
                                                                  [:description      {:optional true} [:maybe ms/NonBlankString]]
                                                                  [:archived         {:default false} [:maybe ms/BooleanValue]]
                                                                  [:parent_id        {:optional true} [:maybe ms/PositiveInt]]
                                                                  [:authority_level  {:optional true} [:maybe collection/AuthorityLevel]]]]
  ;; do we have perms to edit this Collection?
  (let [collection-before-update (t2/hydrate (api/write-check :model/Collection id) :parent_id)]
    ;; tenant-specific-root-collection collections cannot be updated
    (api/check-400
     (not= (:type collection-before-update) collection/tenant-specific-root-collection-type))
    ;; if authority_level is changing, make sure we're allowed to do that
    (when (and (contains? collection-updates :authority_level)
               (not= (keyword authority-level) (:authority_level collection-before-update)))
      (premium-features/assert-has-feature :official-collections (tru "Official Collections"))
      (api/check-403 api/*is-superuser?*))
    ;; ok, go ahead and update it! Only update keys that were specified in the `body`. But not `parent_id` since
    ;; that's not actually a property of Collection, and since we handle moving a Collection separately below.
    (let [updates (u/select-keys-when collection-updates :present [:name :description :authority_level])]
      (when (seq updates)
        (collections-rest.db/update-collection! id updates)))
    ;; if we're trying to move or archive the Collection, go ahead and do that
    (move-or-archive-collection-if-needed! collection-before-update collection-updates)
    (let [updated-collection (collections-rest.db/collection id)]
      (events/publish-event! :event/collection-update {:object updated-collection :user-id api/*current-user-id*})
      (events/publish-event! :event/collection-touch {:collection-id id :user-id api/*current-user-id*})))
  ;; finally, return the updated object
  (collection-detail (collections-rest.db/collection id)))

;; Returns the number of Collection rows deleted, which `t2/delete!` hands back -- 1 whenever the checks above pass.
(api.macros/defendpoint :delete "/:id" :- ms/IntGreaterThanOrEqualToZero
  "Deletes a collection permanently"
  [{:keys [id]} :- [:map {:closed true}
                    [:id ms/PositiveInt]]]
  (api/check-403 api/*is-superuser?*)
  (let [collection (collections-rest.db/collection id)
        old-children-location (collection/children-location collection)
        new-children-location (:location collection)]
    (api/check-400 (:archived collection)
                   "Collection must be trashed before deletion.")
    (api/check-400 (contains? #{:tenant-specific collection/shared-tenant-ns nil} (:namespace collection))
                   "Only collections in the default or tenant namespaces can be deleted.")
    ;; Shouldn't happen, because they can't be archived either... but juuuuust in case.
    (api/check-400 (nil? (:personal_owner_id collection))
                   "Personal collections cannot be deleted.")
    (t2/with-transaction [_tx]
      ;; First, move all children (along with their children) that were archived directly OUT of this collection
      (doseq [child (collections-rest.db/directly-archived-descendant-collections old-children-location)]
        (collection/move-collection! child new-children-location))
      ;; Now we can safely delete this collection and anything left under it.
      (collections-rest.db/delete-collection! id))))

(api.macros/defendpoint :get "/:id/items" :- ::ItemsResponse
  "Fetch a specific Collection's items with the following options:

  *  `models` - only include objects of a specific set of `models`. If unspecified, returns objects of all models
  *  `archived` - when `true`, return archived objects *instead* of unarchived ones. Defaults to `false`.
  *  `pinned-state` - when `is_pinned`, return pinned objects only.
                   when `is_not_pinned`, return non pinned objects only.
                   when `all`, return everything. By default returns everything.
  *  `q` - filter items by name or last editor. Blank or whitespace-only values are ignored.
  *  `include-available-models` - include the models that have at least one visible item in the requested scope.

  Note that this endpoint should return results in a similar shape to `/api/dashboard/:id/items`, so if this is
  changed, that should too."
  [{:keys [id]} :- [:map {:closed true}
                    [:id [:or ms/PositiveInt ms/NanoIdString]]]
   {:keys [models archived pinned-state sort-column sort-direction official-collections-first
           show-dashboard-questions show-exploration-documents
           q include-available-models]} :- [:map {:closed true}
                                            [:models                      {:optional true} [:maybe Models]]
                                            [:archived                    {:default false} [:maybe ms/BooleanValue]]
                                            [:pinned-state                {:optional true} [:maybe (into [:enum] children-query/valid-pinned-state-values)]]
                                            [:sort-column                 {:optional true} [:maybe (into [:enum] children-query/valid-sort-columns)]]
                                            [:sort-direction              {:optional true} [:maybe (into [:enum] children-query/valid-sort-directions)]]
                                            [:official-collections-first  {:optional true} [:maybe ms/MaybeBooleanValue]]
                                            [:show-dashboard-questions    {:default false} [:maybe ms/BooleanValue]]
                                            [:show-exploration-documents  {:default false} [:maybe ms/BooleanValue]]
                                            [:q                           {:optional true} [:maybe :string]]
                                            [:include-available-models    {:default false} [:maybe ms/BooleanValue]]]]
  (let [resolved-id (eid-translation/->id-or-404 :collection id)
        model-kwds  (set (map keyword (u/one-or-many models)))
        collection  (api/read-check :model/Collection resolved-id)
        options     {:show-dashboard-questions?   show-dashboard-questions
                     :show-exploration-documents? show-exploration-documents
                     :models                      model-kwds
                     :include-library?            true
                     :archived?                   (or archived (:archived collection) (collection/is-trash? collection))
                     :pinned-state                (keyword pinned-state)
                     :search-text                 q
                     :sort-info                   {:sort-column                 (or (some-> sort-column children-query/normalize-sort-choice) :name)
                                                   :sort-direction              (or (some-> sort-direction children-query/normalize-sort-choice) :asc)
                                                   ;; default to sorting official collections first, except for the trash.
                                                   :official-collections-first? (if (and (nil? official-collections-first)
                                                                                         (not (collection/is-trash? collection)))
                                                                                  true
                                                                                  (boolean official-collections-first))}}
        children    (cond-> (collection-children collection options)
                      include-available-models
                      (merge (collection-filter-metadata collection nil options)))]
    (events/publish-event! :event/collection-read {:object collection :user-id api/*current-user-id*})
    children))

(api.macros/defendpoint :get "/:id/items/metadata" :- ::ItemsMetadata
  "Metadata about the collection's items list: the models with at least one visible item plus the item count. Unlike
  `GET /api/collection/:id/items`, the result does not depend on search text; pass that endpoint's other scope
  params -- `models`, `archived`, `pinned-state`, `show-dashboard-questions`, `show-exploration-documents` -- so the
  metadata describes the list being shown."
  [{:keys [id]} :- [:map {:closed true}
                    [:id [:or ms/PositiveInt ms/NanoIdString]]]
   {:keys [models archived pinned-state
           show-dashboard-questions show-exploration-documents]} :- [:map {:closed true}
                                                                     [:models                     {:optional true} [:maybe Models]]
                                                                     [:archived                   {:default false} [:maybe ms/BooleanValue]]
                                                                     [:pinned-state               {:optional true} [:maybe (into [:enum] children-query/valid-pinned-state-values)]]
                                                                     [:show-dashboard-questions   {:default false} [:maybe ms/BooleanValue]]
                                                                     [:show-exploration-documents {:default false} [:maybe ms/BooleanValue]]]]
  (let [resolved-id (eid-translation/->id-or-404 :collection id)
        collection  (api/read-check :model/Collection resolved-id)]
    (collection-items-metadata collection (set (map keyword (u/one-or-many models)))
                               {:archived?                   (boolean (or archived
                                                                          (:archived collection)
                                                                          (collection/is-trash? collection)))
                                :show-dashboard-questions?   (boolean show-dashboard-questions)
                                :show-exploration-documents? (boolean show-exploration-documents)
                                :pinned-state                (keyword pinned-state)
                                :include-library?            true
                                :sort-info                   {:sort-column                 :name
                                                              :sort-direction              :asc
                                                              :official-collections-first? false}})))
