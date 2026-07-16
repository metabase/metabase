(ns metabase.collections.children
  "Fetching the child items of a Collection (or the Root Collection) — the domain logic behind
  the `/api/collection/:id/items`, `/api/collection/root/items`, and `/api/collection/tree`
  REST endpoints, callable directly by non-REST consumers such as the MCP tools.

  [[collection-children]] unions one query per child model (cards, dashboards, collections,
  snippets, transforms, …), permission-filtered and sorted server-side; paging rides
  [[metabase.request.core/limit]]/[[metabase.request.core/offset]] (bind them with
  [[metabase.request.core/with-limit-and-offset]] outside a REST request). [[select-collections]]
  and [[shallow-tree]] serve the collection-tree views."
  (:require
   [clojure.string :as str]
   [honey.sql.helpers :as sql.helpers]
   [medley.core :as m]
   [metabase.api.common :as api]
   [metabase.app-db.core :as mdb]
   [metabase.collections.models.collection :as collection]
   [metabase.collections.settings :as collections.settings]
   [metabase.collections.util :as collections.util]
   [metabase.lib-be.core :as lib-be]
   [metabase.models.interface :as mi]
   [metabase.permissions.core :as perms]
   [metabase.premium-features.core :as premium-features :refer [defenterprise]]
   [metabase.queries.core :as queries]
   [metabase.request.core :as request]
   [metabase.revisions.core :as revisions]
   [metabase.tracing.core :as tracing]
   [metabase.transforms.feature-gating :as transforms.gating]
   [metabase.transforms.util :as transforms.u]
   [metabase.upload.core :as upload]
   [metabase.util :as u]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- location-from-collection-id-clause
  "Clause to restrict which collections are being selected based off collection-id. If collection-id is nil,
   then restrict to the children and the grandchildren of the root collection. If collection-id is an an integer,
   then restrict to that collection's parents and children."
  [collection-id]
  (if collection-id
    [:and
     [:like :location (str "%/" collection-id "/%")]
     [:not [:like :location (str "%/" collection-id "/%/%/%")]]]
    [:not [:like :location "/%/%/"]]))

(defn- remove-other-users-personal-subcollections
  [user-id collections]
  (let [personal-ids         (set (t2/select-fn-set :id :model/Collection
                                                    {:where
                                                     [:and [:!= :personal_owner_id nil] [:!= :personal_owner_id user-id]]}))
        personal-descendant? (fn [collection]
                               (let [first-parent-collection-id (-> collection
                                                                    :location
                                                                    collection/location-path->ids
                                                                    first)]
                                 (personal-ids first-parent-collection-id)))]
    (remove personal-descendant? collections)))

(defn select-collections
  "Select collections based off certain parameters. If `shallow` is true, we select only the requested collection (or
  the root, if `collection-id` is `nil`) and its immediate children, to avoid reading the entire collection tree when it
  is not necessary.

  For archived, we can either include only archived items (when archived is truthy) or exclude archived items (when
  archived is falsey).

  The Trash Collection itself (the container for archived items) is *always* included.

  This will select only collections where `personal_owner_id` is not `nil`.

  To include library collections and their descendants, pass in `include-library?` as `true`.
  By default, library-type collections are excluded. "
  [{:keys [archived exclude-other-user-collections namespaces shallow collection-id personal-only include-library?]}]
  (cond->>
   (t2/select :model/Collection
              {:where [:and
                       (case archived
                         nil nil
                         false [:and
                                [:not= :id (collection/trash-collection-id)]
                                [:not :archived]]
                         true [:or
                               [:= :id (collection/trash-collection-id)]
                               :archived])
                       (when shallow
                         (location-from-collection-id-clause collection-id))
                       (when personal-only
                         [:!= :personal_owner_id nil])
                       (when exclude-other-user-collections
                         [:or [:= :personal_owner_id nil] [:= :personal_owner_id api/*current-user-id*]])
                       (when-not include-library?
                         [:or [:= nil :type]
                          [:not-in :type [collection/library-collection-type
                                          collection/library-data-collection-type
                                          collection/library-metrics-collection-type]]])
                       [:or
                        (when (contains? namespaces nil)
                          [:= :namespace nil])
                        (when (seq namespaces)
                          [:in :namespace namespaces])]
                       (collection/visible-collection-filter-clause
                        :id
                        {:include-archived-items    (if archived
                                                      :only
                                                      :exclude)
                         :include-trash-collection? true
                         :permission-level          :read
                         :archive-operation-id      nil})]
               ;; Order NULL collection types first so that audit collections are last
               :order-by [[[[:case [:= :authority_level "official"] 0 :else 1]] :asc]
                          [[[:case
                             [:= :type nil] 0
                             [:= :type collection/trash-collection-type] 1
                             :else 2]] :asc]
                          [:%lower.name :asc]]})
    exclude-other-user-collections
    (remove-other-users-personal-subcollections api/*current-user-id*)))

(defn prep-collection-for-export
  "Given a collection, tweaks it to be ready for returning to the FE.

  These same functions were called in several places in this namespace, so they're combined here to keep it DRY."
  [coll]
  (-> coll
      collection/personal-collection-with-ui-details
      collection/maybe-localize-tenant-collection-name
      collection/maybe-mark-collection-as-library-root))

(defn shallow-tree-from-collection-id
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

(defn shallow-tree
  "One level of the collection tree: the visible, non-archived child collections of
  `collection-id` (nil = the root) in `namespaces` (a set of namespace strings, nil standing
  for the default namespace), each carrying a boolean `:children` expandability flag. Archived
  collections and the trash never appear. Non-REST entry point for callers composing the tree
  level by level."
  [collection-id namespaces]
  (shallow-tree-from-collection-id
   (select-collections {:archived                       false
                        :exclude-other-user-collections false
                        :namespaces                     namespaces
                        :shallow                        true
                        :collection-id                  collection-id
                        :include-library?               false})))

(def ^:private valid-model-param-values
  "Valid values for the `?model=` param accepted by the collection-items endpoints.
  `no_models` is for nilling out the set because a nil model set is actually the total model set"
  #{"card"                              ; SavedQuestion
    "dataset"                           ; Model. TODO : update this
    "document"
    "metric"
    "collection"
    "dashboard"
    "pulse"                             ; I think the only kinds of Pulses we still have are Alerts?
    "snippet"
    "no_models"
    "timeline"
    "table"
    "transform"
    "measure"})

(def ^:private ModelString
  (into [:enum] valid-model-param-values))

(def Models
  "This is basically a union type. [[api.macros/defendpoint]] splits the string if it only gets one."
  [:vector {:decode/string (fn [x] (cond (vector? x) x x [x]))} ModelString])

(def valid-pinned-state-values
  "Valid values for the `?pinned_state` param accepted by endpoints in this namespace."
  #{"all" "is_pinned" "is_not_pinned"})

(def valid-sort-columns
  "Valid values for the `?sort_column=` param accepted by the collection-items endpoints."
  #{"name" "last_edited_at" "last_edited_by" "model" "description"})
(def valid-sort-directions
  "Valid values for the `?sort_direction=` param accepted by the collection-items endpoints."
  #{"asc" "desc"})
(defn normalize-sort-choice
  "Normalize a sort param string to the keyword form [[collection-children]] expects."
  [w]
  (when w (keyword (str/replace w #"_" "-"))))

(def CollectionType
  "Collection types that the root/items endpoint can filter on"
  [:enum "remote-synced"])

(def ^:private CollectionChildrenOptions
  [:map
   [:show-dashboard-questions?     :boolean]
   [:collection-type {:optional true} [:maybe CollectionType]]
   [:archived?                     :boolean]
   [:include-library?               {:optional true} [:maybe :boolean]]
   [:pinned-state {:optional true} [:maybe (into [:enum] (map keyword) valid-pinned-state-values)]]
   ;; when specified, only return results of this type.
   [:models       {:optional true} [:maybe [:set (into [:enum] (map keyword) valid-model-param-values)]]]
   [:sort-info    {:optional true} [:maybe [:map
                                            [:sort-column (into [:enum {:error/message "sort-columns"}]
                                                                (map normalize-sort-choice)
                                                                valid-sort-columns)]
                                            [:sort-direction (into [:enum {:error/message "sort-direction"}]
                                                                   (map normalize-sort-choice)
                                                                   valid-sort-directions)]
                                            [:official-collections-first? {:optional true} :boolean]]]]])

(defmulti ^:private collection-children-query
  "Query that will fetch the 'children' of a `collection`, for different types of objects. Possible options are listed
  in the [[CollectionChildrenOptions]] schema above.

  NOTES:

  *  `collection` will be either a CollectionInstance, or the Root Collection special placeholder object, so do not use
     `u/the-id` on it! Use `:id`, which will return `nil` for the Root Collection, which is exactly what we want.

  * These queries will be combined into a union-all query. You do not need to put all of the columns into the query,
  any you don't select will be added in the correct position so the union will work (see `all-select-columns` for more
  details)."
  {:arglists '([model collection options])}
  (fn [model _ _] (keyword model)))

;;; TODO -- in Postgres and H2 at least I think we could just do `true` or `false` here... not sure about MySQL.

(def ^:private always-true-hsql-expr
  "A Honey SQL expression that is always true.

    1 = 1"
  [:= [:inline 1] [:inline 1]])

(def ^:private always-false-hsql-expr
  "A Honey SQL expression that is never true.

    1 = 2"
  [:= [:inline 1] [:inline 2]])

(defn- pinned-state->clause
  ([pinned-state]
   (pinned-state->clause pinned-state :collection_position))
  ([pinned-state col]
   (case pinned-state
     :all           always-true-hsql-expr
     :is_pinned     [:<> col nil]
     :is_not_pinned [:= col nil]
     always-true-hsql-expr)))

(defn- poison-when-pinned-clause
  "Poison a query to return no results when filtering to pinned items. Use for items that do not have a notion of
  pinning so that no results return when asking for pinned items."
  [pinned-state]
  (if (= pinned-state :is_pinned)
    always-false-hsql-expr
    always-true-hsql-expr))

(defmulti ^:private post-process-collection-children
  {:arglists '([model options collection rows])}
  (fn [model _ _ _]
    (keyword model)))

(defmethod ^:private post-process-collection-children :default
  [_ _ _ rows]
  rows)

(defmethod ^:private post-process-collection-children :document
  [_ _ collection rows]
  (t2/hydrate (for [document rows]
                (-> (t2/instance :model/Document document)
                    (assoc :location (or (when collection
                                           (collection/children-location collection))
                                         "/"))
                    (dissoc :namespace)
                    (update :archived api/bit->boolean)
                    (update :archived_directly api/bit->boolean)))
              :can_write :can_restore :can_delete :is_remote_synced :collection_namespace))

(defmethod collection-children-query :document
  [_ collection {:keys [archived? pinned-state]}]
  (-> {:select [:document.id
                :document.name
                :document.collection_id
                :document.collection_position
                :document.archived
                :document.archived_directly
                [:u.id :last_edit_user]
                [:u.email :last_edit_email]
                [:u.first_name :last_edit_first_name]
                [:u.last_name :last_edit_last_name]
                [:r.timestamp :last_edit_timestamp]
                [(h2x/literal "document") :model]]
       :from [[:document :document]]
       :left-join [[:revision :r] [:and
                                   [:= :r.model_id :document.id]
                                   [:= :r.most_recent true]
                                   [:= :r.model (h2x/literal "Document")]]
                   [:core_user :u] [:= :u.id :r.user_id]]
       :where [:and
               (collection/visible-collection-filter-clause :document.collection_id {:cte-name :visible_collection_ids})
               (if (collection/is-trash? collection)
                 [:= :document.archived_directly true]
                 [:and
                  [:= :document.collection_id (:id collection)]
                  [:= :document.archived_directly false]])
               [:= :document.archived (boolean archived?)]]}
      (sql.helpers/where (pinned-state->clause pinned-state :document.collection_position))))

(defmethod collection-children-query :pulse
  [_ collection {:keys [archived? pinned-state]}]
  (-> {:select-distinct [:p.id
                         :p.name
                         :p.entity_id
                         :p.collection_position
                         :p.collection_id
                         [(h2x/literal "pulse") :model]]
       :from            [[:pulse :p]]
       :left-join       [[:pulse_card :pc] [:= :p.id :pc.pulse_id]]
       :where           [:and
                         [:= :p.collection_id      (:id collection)]
                         [:= :p.archived           (boolean archived?)]
                         ;; exclude alerts
                         [:= :p.alert_condition    nil]
                         ;; exclude dashboard subscriptions
                         [:= :p.dashboard_id nil]]}
      (sql.helpers/where (pinned-state->clause pinned-state :p.collection_position))))

(defmethod post-process-collection-children :pulse
  [_ _ _ rows]
  (for [row rows]
    (dissoc row
            :description :display :authority_level :moderated_status :icon :personal_owner_id :namespace
            :collection_preview :dataset_query :table_id :query_type :is_upload :collection_namespace)))

(defenterprise snippets-collection-children-query
  "Collection children query for snippets on OSS. Returns all snippets regardless of collection, because snippet
  collections are an EE feature."
  metabase-enterprise.snippet-collections.api.native-query-snippet
  [_collection {:keys [archived?]}]
  {:select [:id :name :entity_id [(h2x/literal "snippet") :model]]
   :from   [[:native_query_snippet :nqs]]
   :where  [:= :archived (boolean archived?)]})

(defmethod collection-children-query :snippet
  [_model collection options]
  (snippets-collection-children-query collection options))

(defmethod collection-children-query :timeline
  [_ collection {:keys [archived? pinned-state]}]
  {:select [:id :collection_id :name [(h2x/literal "timeline") :model] :description :entity_id :icon]
   :from   [[:timeline :timeline]]
   :where  [:and
            (poison-when-pinned-clause pinned-state)
            [:= :collection_id (:id collection)]
            [:= :archived (boolean archived?)]]})

(defmethod collection-children-query :transform
  [_model collection {:keys [pinned-state]}]
  (let [enabled-types (transforms.u/enabled-source-types-for-user)]
    {:select [:id :collection_id :name [(h2x/literal "transform") :model] :description :entity_id]
     :from   [[:transform :transform]]
     :where  [:and
              (poison-when-pinned-clause pinned-state)
              [:= :collection_id (:id collection)]
              (if (seq enabled-types)
                [:in :source_type enabled-types]
                [:=
                 [:inline 0]
                 [:inline 1]])]}))

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

(defn- card-query [card-type collection {:keys [archived? pinned-state show-dashboard-questions?]}]
  (-> {:select    (cond->
                   [:c.id :c.name :c.description :c.entity_id :c.collection_position :c.display :c.collection_preview
                    :dashboard_id
                    :last_used_at
                    :c.collection_id
                    :c.archived_directly
                    :c.archived
                    :c.dataset_query
                    [(h2x/literal (case card-type
                                    :model "dataset"
                                    :metric  "metric"
                                    "card"))
                     :model]
                    [:u.id :last_edit_user]
                    [:u.email :last_edit_email]
                    [:u.first_name :last_edit_first_name]
                    [:u.last_name :last_edit_last_name]
                    [:r.timestamp :last_edit_timestamp]
                    [:mr.status :moderated_status]]
                    (#{:question :model} card-type)
                    (conj :c.database_id))
       :from      [[:report_card :c]]
       :left-join [[:revision :r] [:and
                                   [:= :r.model_id :c.id]
                                   [:= :r.most_recent true]
                                   [:= :r.model (h2x/literal "Card")]]
                   [:moderation_review :mr] [:and
                                             [:= :mr.moderated_item_id :c.id]
                                             [:= :mr.most_recent true]
                                             [:= :mr.moderated_item_type (h2x/literal "card")]]
                   [:core_user :u] [:= :u.id :r.user_id]]
       :where     [:and
                   (collection/visible-collection-filter-clause :c.collection_id {:cte-name :visible_collection_ids})
                   (if (collection/is-trash? collection)
                     [:= :c.archived_directly true]
                     [:and
                      [:= :c.collection_id (:id collection)]
                      [:= :c.archived_directly false]])
                   (when-not show-dashboard-questions?
                     [:= :c.dashboard_id nil])
                   [:= :c.document_id nil]
                   [:= :c.archived (boolean archived?)]
                   (case card-type
                     :model
                     [:= :c.type (h2x/literal "model")]

                     :metric
                     [:= :c.type (h2x/literal "metric")]

                     [:= :c.type (h2x/literal "question")])]}
      (cond-> (= :model card-type)
        (-> (sql.helpers/select :c.table_id :t.is_upload :c.query_type)
            (sql.helpers/left-join [:metabase_table :t] [:= :t.id :c.table_id])))
      (sql.helpers/where (pinned-state->clause pinned-state))))

(defmethod collection-children-query :dataset
  [_ collection options]
  (card-query :model collection options))

(defmethod collection-children-query :metric
  [_ collection options]
  (card-query :metric collection options))

(defmethod collection-children-query :card
  [_ collection options]
  (card-query :question collection options))

(defn- post-process-card-row [row]
  (-> (t2/instance :model/Card row)
      (update :dataset_query (:out lib-be/transform-query))
      (update :collection_preview api/bit->boolean)
      (update :archived api/bit->boolean)
      (update :archived_directly api/bit->boolean)))

(defn- post-process-card-row-after-hydrate [row]
  (-> (dissoc row :authority_level :icon :personal_owner_id :dataset_query :table_id :query_type :is_upload :namespace)
      (update :dashboard #(when % (select-keys % [:id :name :moderation_status])))
      (assoc :fully_parameterized (queries/fully-parameterized? row))))

(defn- post-process-card-like
  [{:keys [include-can-run-adhoc-query hydrate-based-on-upload]} rows]
  (let [threshold              (collections.settings/can-run-adhoc-query-check-threshold)
        card-count             (count rows)
        skip-adhoc-hydration?  (u/prog1 (and include-can-run-adhoc-query
                                             (pos? threshold)
                                             (> card-count threshold))
                                 (when <>
                                   (log/warnf "Skipping can_run_adhoc_query hydration for %d cards (threshold: %d)"
                                              card-count threshold)))
        hydration              (cond-> [:can_write
                                        :can_restore
                                        :can_delete
                                        :dashboard_count
                                        :is_remote_synced
                                        :collection_namespace
                                        [:dashboard :moderation_status]]
                                 (and include-can-run-adhoc-query
                                      (not skip-adhoc-hydration?)) (conj :can_run_adhoc_query))]
    (as-> (map post-process-card-row rows) $
      (apply t2/hydrate $ hydration)
      (cond-> $
        hydrate-based-on-upload upload/model-hydrate-based-on-upload
        skip-adhoc-hydration?   (->> (map #(assoc % :can_run_adhoc_query true))))
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

(defn- dashboard-query [collection {:keys [archived? pinned-state]}]
  (-> {:select    [:d.id :d.name :d.description :d.entity_id :d.collection_position
                   [:last_viewed_at :last_used_at]
                   :d.collection_id
                   :d.archived_directly
                   [(h2x/literal "dashboard") :model]
                   [:u.id :last_edit_user]
                   :d.archived
                   [:u.email :last_edit_email]
                   [:u.first_name :last_edit_first_name]
                   [:u.last_name :last_edit_last_name]
                   [:r.timestamp :last_edit_timestamp]
                   [:mr.status :moderated_status]]
       :from      [[:report_dashboard :d]]
       :left-join [[:moderation_review :mr] [:and
                                             [:= :mr.moderated_item_id :d.id]
                                             [:= :mr.most_recent true]
                                             [:= :mr.moderated_item_type (h2x/literal "dashboard")]]
                   [:revision :r] [:and
                                   [:= :r.model_id :d.id]
                                   [:= :r.most_recent true]
                                   [:= :r.model (h2x/literal "Dashboard")]]
                   [:core_user :u] [:= :u.id :r.user_id]]
       :where     [:and
                   (collection/visible-collection-filter-clause :d.collection_id {:cte-name :visible_collection_ids})
                   (if (collection/is-trash? collection)
                     [:= :d.archived_directly true]
                     [:and
                      [:= :d.collection_id (:id collection)]
                      [:not= :d.archived_directly true]])
                   [:= :d.archived (boolean archived?)]]}
      (sql.helpers/where (pinned-state->clause pinned-state))))

(defmethod collection-children-query :dashboard
  [_ collection options]
  (dashboard-query collection options))

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
       collections.util/annotate-dashboards
       (map (partial post-process-dashboard parent-collection))))

(defenterprise snippets-collection-filter-clause
  "Clause to filter out snippet collections from the collection query on OSS instances, and instances without the
  snippet-collections. EE implementation returns `nil`, so as to not filter out snippet collections."
  metabase-enterprise.snippet-collections.api.native-query-snippet
  []
  [:or
   [:= :namespace nil]
   [:not= :namespace (u/qualified-name "snippets")]])

(defn- collection-query
  [collection {:keys [archived? collection-namespace pinned-state collection-type include-library?]}]
  (-> (assoc
       (collection/effective-children-query
        collection
        {:cte-name :visible_collection_ids}
        [:and
         (when collection-type
           (if (= collection-type "remote-synced")
             [:= :is_remote_synced true]
             [:= :type collection-type]))
         (when-not include-library?
           [:or [:= nil :type]
            [:not [:in :type [collection/library-collection-type
                              collection/library-metrics-collection-type
                              collection/library-data-collection-type]]]])
         (if archived?
           [:or
            [:= :archived true]
            [:= :id (collection/trash-collection-id)]]
           [:and [:= :archived false] [:not= :id (collection/trash-collection-id)]])]
        (perms/namespace-clause :namespace (u/qualified-name collection-namespace) (collection/is-trash? collection))
        ;; never show tenant-specific root collections as children of another collection
        [:or
         [:= :type nil]
         [:not= :type collection/tenant-specific-root-collection-type]]
        (snippets-collection-filter-clause))
       ;; We get from the effective-children-query a normal set of columns selected:
       ;; want to make it fit the others to make UNION ALL work
       :select [:id
                [:id :collection_id]
                :archived
                :name
                :description
                :entity_id
                :personal_owner_id
                :location
                :archived_directly
                :namespace
                ;; selected as `type` for compatibility with collection fns that expect it
                :type
                [[:case [:= :is_remote_synced nil] [:inline false] :else :is_remote_synced] :is_remote_synced]
                ;; selected as `collection_type` for fast sorting on "when it's a collection, type"
                [:type :collection_type]
                [(h2x/literal "collection") :model]
                :authority_level])
      ;; the nil indicates that collections are never pinned.
      (sql.helpers/where (pinned-state->clause pinned-state nil))))

(defmethod collection-children-query :collection
  [_ collection options]
  (collection-query collection options))

(defmethod collection-children-query :table
  [_ collection {:keys [archived? pinned-state]}]
  (let [user-info {:user-id       api/*current-user-id*
                   :is-superuser? api/*is-superuser?*}
        published-clause (perms/published-table-visible-clause :t.id user-info)
        queryable-clause (cond-> [:or
                                  [:in :t.id (perms/visible-table-filter-select
                                              :id
                                              user-info
                                              {:perms/view-data      :unrestricted
                                               :perms/create-queries :query-builder})]]
                           published-clause (conj [:and
                                                   [:in :t.id (perms/visible-table-filter-select
                                                               :id
                                                               user-info
                                                               {:perms/view-data :unrestricted})]
                                                   published-clause]))]
    {:select [:t.id
              [:t.id :table_id]
              [:t.display_name :name]
              :t.description
              :t.collection_id
              [:t.db_id :database_id]
              [[:!= :t.archived_at nil] :archived]
              [(h2x/literal "table") :model]]
     :from   [[:metabase_table :t]]
     :where  [:and
              [:= :t.is_published true]
              (poison-when-pinned-clause pinned-state)
              (collection/visible-collection-filter-clause :t.collection_id {:cte-name :visible_collection_ids})
              queryable-clause
              [:= :t.collection_id (:id collection)]
              (if archived?
                [:!= :t.archived_at nil]
                [:= :t.archived_at nil])]}))

(defn- annotate-collections
  [parent-coll colls {:keys [show-dashboard-questions?]}]
  (let [descendant-collections (collection/descendants-flat parent-coll (collection/visible-collection-filter-clause
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
                  (t2/reducible-query {:select-distinct [:collection_id :type]
                                       :from            [:report_card]
                                       :where           [:and
                                                         (when-not show-dashboard-questions?
                                                           [:= :dashboard_id nil])
                                                         [:= :archived false]
                                                         [:in :collection_id descendant-collection-ids]]})))

        ;; Tables in collections are an EE feature (library)
        collections-containing-tables
        (if (premium-features/has-feature? :library)
          (->> (when (seq descendant-collection-ids)
                 (t2/query {:select-distinct [:collection_id]
                            :from :metabase_table
                            :where [:and
                                    [:= :is_published true]
                                    [:= :archived_at nil]
                                    [:in :collection_id descendant-collection-ids]]}))
               (map :collection_id)
               (into #{}))
          #{})

        collections-containing-transforms
        (if (seq (transforms.gating/enabled-source-types))
          (->> (when (seq descendant-collection-ids)
                 (t2/query {:select-distinct [:collection_id]
                            :from :transform
                            :where [:and
                                    [:in :collection_id descendant-collection-ids]
                                    [:in :source_type (transforms.gating/enabled-source-types)]]}))
               (map :collection_id)
               (into #{}))
          #{})

        collections-containing-dashboards
        (->> (when (seq descendant-collection-ids)
               (t2/query {:select-distinct [:collection_id]
                          :from :report_dashboard
                          :where [:and
                                  [:= :archived false]
                                  [:in :collection_id descendant-collection-ids]]}))
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
    :collection :model/Collection
    :card       :model/Card
    :dataset    :model/Card
    :metric     :model/Card
    :dashboard  :model/Dashboard
    :document   :model/Document
    :pulse      :model/Pulse
    :snippet    :model/NativeQuerySnippet
    :table      :model/Table
    :timeline   :model/Timeline
    :transform  :model/Transform))

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

(defn- select-name
  "Takes a honeysql select column and returns a keyword of which column it is.

  eg:
  (select-name :id) -> :id
  (select-name [(literal \"card\") :model]) -> :model
  (select-name :p.id) -> :id"
  [x]
  (if (vector? x)
    (recur (second x))
    (-> x name (str/split #"\.") peek keyword)))

(def ^:private all-select-columns
  "All columns that need to be present for the union-all. Generated with the comment form below. Non-text columns that
  are optional (not id, but last_edit_user for example) must have a type so that the union-all can unify the nil with
  the correct column type."
  [:id :name :description :entity_id :display [:collection_preview :boolean] :dataset_query
   :collection_id
   [:dashboard_id :integer]
   [:archived_directly :boolean]
   :model :collection_position :authority_level [:personal_owner_id :integer] :location
   :last_edit_email :last_edit_first_name :last_edit_last_name :moderated_status :icon
   [:last_edit_user :integer] [:last_edit_timestamp :timestamp] [:database_id :integer]
   :collection_type :type [:archived :boolean] [:last_used_at :timestamp] [:is_remote_synced :boolean] :namespace
   ;; for determining whether a model is based on a csv-uploaded table
   [:table_id :integer] [:is_upload :boolean] :query_type])

(defn- add-missing-columns
  "Ensures that all necessary columns are in the select-columns collection, adding `[nil :column]` as necessary."
  [select-columns necessary-columns]
  (let [columns (m/index-by select-name select-columns)]
    (map (fn [col]
           (let [[col-name type'] (u/one-or-many col)]
             (get columns col-name (if (and type' (= (mdb/db-type) :postgres))
                                     [(h2x/cast type' nil) col-name]
                                     [nil col-name]))))
         necessary-columns)))

(defn- add-model-ranking
  [select-clause model]
  (let [rankings {:dashboard  1
                  :pulse      2
                  :dataset    3
                  :metric     4
                  :card       5
                  :snippet    6
                  :collection 7
                  :timeline   8}]
    (conj select-clause [[:inline (get rankings model 100)]
                         :model_ranking])))

(comment
  ;; generate the set of columns across all child queries. Remember to add type info if not a text column
  (into []
        (comp cat (map select-name) (distinct))
        (for [model [:card :metric :dataset :dashboard :snippet :pulse :collection :timeline]]
          (:select (collection-children-query model {:id 1 :location "/"} nil)))))

(defn- official-collections-first-sort-clause [{:keys [official-collections-first?]}]
  (when official-collections-first?
    [:authority_level :asc :nulls-last]))

(def ^:private normal-collections-first-sort-clause
  [:type :asc :nulls-first])

(defn children-sort-clause
  "Given the client side sort-info, return sort clause to effect this. `db-type` is necessary due to complications from
  treatment of nulls in the different app db types."
  [sort-info db-type]
  (into []
        (comp cat
              (remove nil?))
        [[(official-collections-first-sort-clause sort-info)]
         [normal-collections-first-sort-clause]
         (case ((juxt :sort-column :sort-direction) sort-info)
           [nil nil]               [[:%lower.name :asc]]
           [:name :asc]            [[:%lower.name :asc]]
           [:name :desc]           [[:%lower.name :desc]]
           [:last-edited-at :asc]  [(if (= db-type :mysql)
                                      [:%isnull.last_edit_timestamp]
                                      [:last_edit_timestamp :nulls-last])
                                    [:last_edit_timestamp :asc]
                                    [:%lower.name :asc]]
           [:last-edited-at :desc] [(case db-type
                                      :mysql    [:%isnull.last_edit_timestamp]
                                      :postgres [:last_edit_timestamp :desc-nulls-last]
                                      :h2       nil)
                                    [:last_edit_timestamp :desc]
                                    [:%lower.name :asc]]
           [:last-edited-by :asc]  [(if (= db-type :mysql)
                                      [:%isnull.last_edit_last_name]
                                      [:last_edit_last_name :nulls-last])
                                    [:last_edit_last_name :asc]
                                    (if (= db-type :mysql)
                                      [:%isnull.last_edit_first_name]
                                      [:last_edit_first_name :nulls-last])
                                    [:last_edit_first_name :asc]
                                    [:%lower.name :asc]]
           [:last-edited-by :desc] [(case db-type
                                      :mysql    [:%isnull.last_edit_last_name]
                                      :postgres [:last_edit_last_name :desc-nulls-last]
                                      :h2       nil)
                                    [:last_edit_last_name :desc]
                                    (case db-type
                                      :mysql    [:%isnull.last_edit_first_name]
                                      :postgres [:last_edit_last_name :desc-nulls-last]
                                      :h2       nil)
                                    [:last_edit_first_name :desc]
                                    [:%lower.name :asc]]
           [:model :asc]           [[:model_ranking :asc]  [:%lower.name :asc]]
           [:model :desc]          [[:model_ranking :desc] [:%lower.name :asc]]
           [:description :asc]     [[:%lower.description :asc :nulls-last] [:%lower.name :asc]]
           [:description :desc]    [[:%lower.description :desc :nulls-last] [:%lower.name :asc]])
         ;; add a fallback sort order so paging is still deterministic even if collection have the same name or
         ;; whatever
         [[:id :asc]]]))

(defn- collection-children*
  [collection models {:keys [sort-info archived?] :as options}]
  (let [sql-order   (children-sort-clause sort-info (mdb/db-type))
        models      (sort (map keyword models))
        queries     (for [model models
                          :let  [query              (collection-children-query model collection options)
                                 select-clause-type (some
                                                     (fn [k]
                                                       (when (get query k)
                                                         k))
                                                     [:select :select-distinct])]]
                      (-> query
                          (update select-clause-type add-missing-columns all-select-columns)
                          (update select-clause-type add-model-ranking model)))
        viz-config  {:include-archived-items :all
                     :archive-operation-id nil
                     :permission-level (if archived? :write :read)
                     :include-trash-collection? archived?}
        rows-query  {:with     [[:visible_collection_ids (collection/visible-collection-query viz-config)]]
                     :select   [:* [[:over [[:count :*] {} :total_count]]]]
                     :from     [[{:union-all queries} :dummy_alias]]
                     :order-by sql-order}
        limit       (request/limit)
        offset      (request/offset)
        ;; We didn't implement collection pagination for snippets namespace for root/items
        ;; Rip out the limit for now and put it back in when we want it
        limit-query (if (or
                         (nil? limit)
                         (nil? offset)
                         (= (:collection-namespace options) "snippets"))
                      rows-query
                      (assoc rows-query
                             ;; If limit is 0, we still execute the query with a limit of 1 so that we fetch a
                             ;; :total_count
                             :limit  (if (zero? limit) 1 limit)
                             :offset offset))
        rows        (tracing/with-span :db-app "db-app.collection-items-query" {:collection/id (:id collection)}
                      (mdb/query limit-query))
        res         {:total  (->> rows first :total_count)
                     :data   (if (= limit 0)
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

(mu/defn collection-children
  "Fetch a sequence of 'child' objects belonging to a Collection, filtered using `options`."
  [{collection-namespace :namespace, :as collection} :- collection/CollectionWithLocationAndIDOrRoot
   {:keys [models], :as options}                     :- CollectionChildrenOptions]
  (let [valid-models (for [model-kw (cond-> [:collection :dataset :metric :card :dashboard :pulse :snippet :timeline :document :transform]
                                      ;; Tables in collections are an EE feature (library)
                                      (premium-features/has-feature? :library) (conj :table))
                           ;; only fetch models that are specified by the `model` param; or everything if it's empty
                           :when    (or (empty? models) (contains? models model-kw))
                           :let     [toucan-model       (model-name->toucan-model model-kw)
                                     allowed-namespaces (collection/allowed-namespaces toucan-model)]
                           :when    (or (= model-kw :collection)
                                        (contains? allowed-namespaces (keyword collection-namespace)))]
                       model-kw)]
    (if (seq valid-models)
      (collection-children* collection valid-models (assoc options :collection-namespace collection-namespace))
      {:total  0
       :data   []
       :limit  (request/limit)
       :offset (request/offset)
       :models valid-models})))

(defn visible-model-kwds
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

(def namespaces-holding-non-collection-types
  "We can't really *know* what namespace something with a `nil` `collection_id` is in, unless it's one of the special
  types that can only live in one namespace.

  If you're looking in the root collection of one of these namespaces, we'll allow you to list any type of model.

  Otherwise, we'll just show you collections."
  #{nil "snippets" "transforms"})
