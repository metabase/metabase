(ns metabase.collections-rest.children-query
  "Builds the Honey SQL that lists the children of a Collection (`/api/collection/:id/items` and `/root/items`): one
  query per item model, combined with `UNION ALL` and paginated with a `total_count` window. `metabase.collections-rest.db`
  runs the queries built here, so this namespace must not require it."
  (:require
   [clojure.string :as str]
   [honey.sql.helpers :as sql.helpers]
   [medley.core :as m]
   [metabase.api.common :as api]
   [metabase.app-db.core :as mdb]
   [metabase.collections.models.collection :as collection]
   [metabase.permissions.core :as perms]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.transforms.util :as transforms.u]
   [metabase.util :as u]
   [metabase.util.honey-sql-2 :as h2x]))

(set! *warn-on-reflection* true)

(def valid-model-param-values
  "Valid values for the `?model=` param accepted by endpoints in this namespace.
  `no_models` is for nilling out the set because a nil model set is actually the total model set"
  #{"card"                              ; SavedQuestion
    "dataset"                           ; Model. TODO : update this
    "document"
    "exploration"
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

(def valid-pinned-state-values
  "Valid values for the `?pinned_state` param accepted by endpoints in this namespace."
  #{"all" "is_pinned" "is_not_pinned"})

(def valid-sort-columns
  "Valid values for the `?sort_column` param accepted by endpoints in this module."
  #{"name" "last_edited_at" "last_edited_by" "model" "description"})
(def valid-sort-directions
  "Valid values for the `?sort_direction` param accepted by endpoints in this module."
  #{"asc" "desc"})
(defn normalize-sort-choice
  "The keyword for a `?sort_column`/`?sort_direction` param value, e.g. `\"last_edited_at\"` -> `:last-edited-at`."
  [w]
  (when w (keyword (str/replace w #"_" "-"))))

(def CollectionType
  "Collection types that the root/items endpoint can filter on"
  [:enum "remote-synced"])

(def CollectionChildrenOptions
  "The options that select and order the children of a Collection (see [[children-rows-query]])."
  [:map
   [:show-dashboard-questions?     :boolean]
   [:show-exploration-documents?   :boolean]
   [:collection-type {:optional true} [:maybe CollectionType]]
   [:archived?                     :boolean]
   [:include-library?               {:optional true} [:maybe :boolean]]
   [:pinned-state {:optional true} [:maybe (into [:enum] (map keyword) valid-pinned-state-values)]]
   ;; when specified, only return results of this type.
   [:models       {:optional true} [:maybe [:set (into [:enum] (map keyword) valid-model-param-values)]]]
   [:search-text  {:optional true} [:maybe :string]]
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

(defn- search-text-clause
  "Match every token in `search-text` against an item's name or last editor's first or last name."
  [search-text]
  (when-not (str/blank? search-text)
    (when-let [tokens (->> (str/split (u/lower-case-en (str/trim search-text)) #"\s+")
                           (filter seq)
                           not-empty)]
      (into [:and]
            (for [token tokens
                  :let  [pattern (h2x/like-substring token)]]
              [:or
               [:like [:lower :name] pattern]
               [:like [:lower :last_edit_first_name] pattern]
               [:like [:lower :last_edit_last_name] pattern]])))))

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

(defmethod collection-children-query :document
  [_ collection {:keys [archived? pinned-state show-exploration-documents?]}]
  (-> {:select [:document.id
                :document.name
                :document.collection_id
                :document.collection_position
                :document.archived
                :document.archived_directly
                :document.exploration_id
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
               [:= :document.archived (boolean archived?)]
               ;; Hide exploration-attached documents - similar to Dashboard Questions, they're not visible in the
               ;; collection, but only through the Exploration they're in. Callers that want them (e.g. the
               ;; Trash view, embedding SDK) pass show-exploration-documents? to opt in.
               (when-not show-exploration-documents?
                 [:= :document.exploration_id nil])]}
      (sql.helpers/where (pinned-state->clause pinned-state :document.collection_position))))

(def ^:private exploration-recent-edits-subquery
  ;; Per-exploration latest edit, unioning the Exploration's own metadata revisions with
  ;; revisions of its Summary Document. `rn = 1` picks the winner.
  ;; The Exploration row is mostly inert post-creation; the meat of editing happens in
  ;; the attached Document, so "Last edited" must reflect both sources.
  ^:allow-subquery
  {:select [:exploration_id
            :timestamp
            :user_id
            [[:over [[:row_number] ^:allow-subquery {:partition-by [:exploration_id]
                                                     :order-by     [[:timestamp :desc]]}]] :rn]]
   :from   [[^:allow-subquery {:union-all
                               [^:allow-subquery
                                {:select [[:r.model_id :exploration_id]
                                          [:r.timestamp :timestamp]
                                          [:r.user_id   :user_id]]
                                 :from   [[:revision :r]]
                                 :where  [:and
                                          [:= :r.model (h2x/literal "Exploration")]
                                          [:= :r.most_recent true]]}
                                ^:allow-subquery
                                {:select [[:d.exploration_id :exploration_id]
                                          [:r.timestamp      :timestamp]
                                          [:r.user_id        :user_id]]
                                 :from   [[:revision :r]]
                                 :join   [[:document :d] [:= :d.id :r.model_id]]
                                 :where  [:and
                                          [:= :r.model (h2x/literal "Document")]
                                          [:= :r.most_recent true]
                                          [:not= :d.exploration_id nil]]}]}
             :all_edits]]})

(defmethod collection-children-query :exploration
  [_ collection {:keys [archived? pinned-state]}]
  (-> {:select [:exploration.id
                :exploration.name
                :exploration.description
                :exploration.entity_id
                :exploration.collection_id
                :exploration.collection_position
                :exploration.archived
                :exploration.archived_directly
                [:u.id         :last_edit_user]
                [:u.email      :last_edit_email]
                [:u.first_name :last_edit_first_name]
                [:u.last_name  :last_edit_last_name]
                [:ere.timestamp :last_edit_timestamp]
                [(h2x/literal "exploration") :model]]
       :from [[:exploration :exploration]]
       :left-join [[exploration-recent-edits-subquery :ere]
                   [:and
                    [:= :ere.exploration_id :exploration.id]
                    [:= :ere.rn [:inline 1]]]
                   [:core_user :u] [:= :u.id :ere.user_id]]
       :where [:and
               (collection/visible-collection-filter-clause :exploration.collection_id {:cte-name :visible_collection_ids})
               (if (collection/is-trash? collection)
                 [:= :exploration.archived_directly true]
                 [:and
                  [:= :exploration.collection_id (:id collection)]
                  [:= :exploration.archived_directly false]])
               [:= :exploration.archived (boolean archived?)]]}
      (sql.helpers/where (pinned-state->clause pinned-state :exploration.collection_position))))

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

(defn- visible-collections-config
  "The visibility config of the `visible_collection_ids` CTE: archived listings need write access to the items."
  [{:keys [archived?]}]
  {:include-archived-items    :all
   :archive-operation-id      nil
   :permission-level          (if archived? :write :read)
   :include-trash-collection? archived?})

(defn children-rows-query
  "The query listing the children of `collection` for the item `models` (keywords, in the order to union them),
  filtered and ordered by `options` (see [[CollectionChildrenOptions]]). Every row carries the size of the whole
  result set as `total_count`. `page` is `nil` for the whole result set, or a map with `:limit` and optionally
  `:offset`."
  [collection models {:keys [sort-info search-text] :as options} page]
  (let [sql-order     (children-sort-clause sort-info (mdb/db-type))
        queries       (for [model models
                            :let  [query              (collection-children-query model collection options)
                                   select-clause-type (some
                                                       (fn [k]
                                                         (when (get query k)
                                                           k))
                                                       [:select :select-distinct])]]
                        (-> query
                            (update select-clause-type add-missing-columns all-select-columns)
                            (update select-clause-type add-model-ranking model)))
        search-clause (search-text-clause search-text)]
    (cond-> {:with     [[:visible_collection_ids (collection/visible-collection-query (visible-collections-config options))]]
             :select   [:* [[:over [[:count :*] ^:allow-subquery {} :total_count]]]]
             :from     [[^:allow-subquery {:union-all queries} :dummy_alias]]
             :order-by sql-order}
      search-clause   (sql.helpers/where search-clause)
      (:limit page)   (assoc :limit (:limit page))
      (:offset page)  (assoc :offset (:offset page)))))

(defn filter-metadata-query
  "The single-row query whose columns say, for each of the item `models`, whether `collection` has at least one visible
  child of that model under `options`."
  [collection models options]
  {:with   [[:visible_collection_ids (collection/visible-collection-query (visible-collections-config options))]]
   :select (vec
            (for [model models]
              [[:exists (collection-children-query model collection options)] model]))})
