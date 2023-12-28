(ns metabase.api.collection
  "`/api/collection` endpoints. By default, these endpoints operate on Collections in the 'default' namespace, which is
  the namespace that has things like Dashboards and Cards. Other namespaces of Collections exist as well, such as the
  `:snippet` namespace, ('Snippet folders' in the UI). These namespaces are independent hierarchies. To use these
  endpoints for other Collections namespaces, you can pass the `?namespace=` parameter (e.g., `?namespace=snippet`)."
  (:require
   [cheshire.core :as json]
   [clojure.string :as str]
   [compojure.core :refer [GET POST PUT]]
   [honey.sql.helpers :as sql.helpers]
   [malli.core :as mc]
   [malli.transform :as mtx]
   [medley.core :as m]
   [metabase.api.common :as api]
   [metabase.db :as mdb]
   [metabase.db.query :as mdb.query]
   [metabase.driver.common.parameters :as params]
   [metabase.driver.common.parameters.parse :as params.parse]
   [metabase.mbql.normalize :as mbql.normalize]
   [metabase.models.card :as card :refer [Card]]
   [metabase.models.collection :as collection :refer [Collection]]
   [metabase.models.collection.graph :as graph]
   [metabase.models.collection.root :as collection.root]
   [metabase.models.dashboard :refer [Dashboard]]
   [metabase.models.interface :as mi]
   [metabase.models.native-query-snippet :refer [NativeQuerySnippet]]
   [metabase.models.permissions :as perms]
   [metabase.models.pulse :as pulse :refer [Pulse]]
   [metabase.models.revision.last-edit :as last-edit]
   [metabase.models.timeline :as timeline :refer [Timeline]]
   [metabase.public-settings.premium-features
    :as premium-features
    :refer [defenterprise]]
   [metabase.server.middleware.offset-paging :as mw.offset-paging]
   [metabase.util :as u]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;; when alias defined for namespaced keywords is run through kondo macro, ns should be regarded as used
(comment collection.root/keep-me)

(declare root-collection)

(defn- remove-other-users-personal-collections
  [user-id collections]
  (let [personal-ids (into #{} (comp (filter :personal_owner_id)
                                     (remove (comp #{user-id} :personal_owner_id))
                                     (map :id))
                           collections)
        prefixes     (into #{} (map (fn [id] (format "/%d/" id))) personal-ids)
        personal?    (fn [{^String location :location id :id}]
                       (or (personal-ids id)
                           (prefixes (re-find #"^/\d+/" location))))]
    (if (seq prefixes)
      (remove personal? collections)
      collections)))

(api/defendpoint GET "/"
  "Fetch a list of all Collections that the current user has read permissions for (`:can_write` is returned as an
  additional property of each Collection so you can tell which of these you have write permissions for.)

  By default, this returns non-archived Collections, but instead you can show archived ones by passing
  `?archived=true`.

  By default, admin users will see all collections. To hide other user's collections pass in
  `?exclude-other-user-collections=true`."
  [archived exclude-other-user-collections namespace]
  {archived                       [:maybe ms/BooleanValue]
   exclude-other-user-collections [:maybe ms/BooleanValue]
   namespace                      [:maybe ms/NonBlankString]}
  (as-> (t2/select Collection
                   {:where    [:and
                               [:= :archived archived]
                               (perms/audit-namespace-clause :namespace namespace)
                               (collection/visible-collection-ids->honeysql-filter-clause
                                :id
                                (collection/permissions-set->visible-collection-ids @api/*current-user-permissions-set*))]
                              ;; Order NULL collection types first so that audit collections are last
                    :order-by [[[[:case [:= :type nil] 0 :else 1]] :asc]
                               [:%lower.name :asc]]}) collections
    ;; Remove other users' personal collections
    (if exclude-other-user-collections
      (remove-other-users-personal-collections api/*current-user-id* collections)
      collections)
    ;; include Root Collection at beginning or results if archived isn't `true`
    (if archived
      collections
      (let [root (root-collection namespace)]
        (cond->> collections
          (mi/can-read? root)
          (cons root))))
    (t2/hydrate collections :can_write :is_personal)
    ;; remove the :metabase.models.collection.root/is-root? tag since FE doesn't need it
    ;; and for personal collections we translate the name to user's locale
    (for [collection collections]
      (-> collection
          (dissoc ::collection.root/is-root?)
          collection/personal-collection-with-ui-details))))

(api/defendpoint GET "/tree"
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
  subtree (below)."
  [exclude-archived exclude-other-user-collections namespace]
  {exclude-archived               [:maybe :boolean]
   exclude-other-user-collections [:maybe :boolean]
   namespace                      [:maybe ms/NonBlankString]}
  (let [exclude-archived? exclude-archived
        exclude-other-user-collections? exclude-other-user-collections
        coll-type-ids (reduce (fn [acc {:keys [collection_id dataset] :as _x}]
                                (update acc (if dataset :dataset :card) conj collection_id))
                              {:dataset #{}
                               :card    #{}}
                              (mdb.query/reducible-query {:select-distinct [:collection_id :dataset]
                                                          :from            [:report_card]
                                                          :where           [:= :archived false]}))
        colls (cond->>
                (t2/select Collection
                  {:where [:and
                           (when exclude-archived?
                             [:= :archived false])
                           (perms/audit-namespace-clause :namespace namespace)
                           (collection/visible-collection-ids->honeysql-filter-clause
                            :id
                            (collection/permissions-set->visible-collection-ids @api/*current-user-permissions-set*))]})
                exclude-other-user-collections?
                (remove-other-users-personal-collections api/*current-user-id*))
        colls-with-details (map collection/personal-collection-with-ui-details colls)]
    (collection/collections->tree coll-type-ids colls-with-details)))


;;; --------------------------------- Fetching a single Collection & its 'children' ----------------------------------

(def ^:private valid-model-param-values
  "Valid values for the `?model=` param accepted by endpoints in this namespace.
  `no_models` is for nilling out the set because a nil model set is actually the total model set"
  #{"card" "dataset" "collection" "dashboard" "pulse" "snippet" "no_models" "timeline"})

(def ^:private ModelString
  (into [:enum] valid-model-param-values))

(def ^:private Models
  "This is basically a union type. [[api/defendpoint]] splits the string if it only gets one."
  [:or
   [:sequential ModelString]
   ModelString])

(def ^:private valid-pinned-state-values
  "Valid values for the `?pinned_state` param accepted by endpoints in this namespace."
  #{"all" "is_pinned" "is_not_pinned"})

(def ^:private valid-sort-columns #{"name" "last_edited_at" "last_edited_by" "model"})
(def ^:private valid-sort-directions #{"asc" "desc"})
(defn- normalize-sort-choice [w] (when w (keyword (str/replace w #"_" "-"))))

(def ^:private CollectionChildrenOptions
  [:map
   [:archived?                     :boolean]
   [:pinned-state {:optional true} [:maybe (into [:enum] (map keyword) valid-pinned-state-values)]]
   ;; when specified, only return results of this type.
   [:models       {:optional true} [:maybe [:set (into [:enum] (map keyword) valid-model-param-values)]]]
   [:sort-info    {:optional true} [:maybe [:tuple
                                            (into [:enum {:error/message "sort-columns"}]
                                                  (map normalize-sort-choice)
                                                  valid-sort-columns)
                                            (into [:enum {:error/message "sort-direction"}]
                                                  (map normalize-sort-choice)
                                                  valid-sort-directions)]]]])

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
  {:arglists '([model rows])}
  (fn [model _]
    (keyword model)))

(defmethod ^:private post-process-collection-children :default
  [_ rows]
  rows)

(defmethod collection-children-query :pulse
  [_ collection {:keys [archived? pinned-state]}]
  (-> {:select-distinct [:p.id
                         :p.name
                         :p.entity_id
                         :p.collection_position
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
  [_ rows]
  (for [row rows]
    (dissoc row
            :description :display :authority_level :moderated_status :icon :personal_owner_id
            :collection_preview :dataset_query)))

(defenterprise snippets-collection-children-query
  "Collection children query for snippets on OSS. Returns all snippets regardless of collection, because snippet
  collections are an EE feature."
  metabase-enterprise.snippet-collections.api.native-query-snippet
  [_ {:keys [archived?]}]
  {:select [:id :name :entity_id [(h2x/literal "snippet") :model]]
   :from   [[:native_query_snippet :nqs]]
   :where  [:= :archived (boolean archived?)]})

(defmethod collection-children-query :snippet
  [_ collection options]
  (snippets-collection-children-query collection options))

(defmethod collection-children-query :timeline
  [_ collection {:keys [archived? pinned-state]}]
  {:select [:id :name [(h2x/literal "timeline") :model] :description :entity_id :icon]
   :from   [[:timeline :timeline]]
   :where  [:and
            (poison-when-pinned-clause pinned-state)
            [:= :collection_id (:id collection)]
            [:= :archived (boolean archived?)]]})

(defmethod post-process-collection-children :timeline
  [_ rows]
  (for [row rows]
    (dissoc row
            :description :display :collection_position :authority_level :moderated_status
            :collection_preview :dataset_query)))

(defmethod post-process-collection-children :snippet
  [_ rows]
  (for [row rows]
    (dissoc row
            :description :collection_position :display :authority_level
            :moderated_status :icon :personal_owner_id :collection_preview
            :dataset_query)))

(defn- card-query [dataset? collection {:keys [archived? pinned-state]}]
  (-> {:select    (cond->
                    [:c.id :c.name :c.description :c.entity_id :c.collection_position :c.display :c.collection_preview
                     :c.dataset_query
                     [(h2x/literal (if dataset? "dataset" "card")) :model]
                     [:u.id :last_edit_user]
                     [:u.email :last_edit_email]
                     [:u.first_name :last_edit_first_name]
                     [:u.last_name :last_edit_last_name]
                     [:r.timestamp :last_edit_timestamp]
                     [{:select   [:status]
                       :from     [:moderation_review]
                       :where    [:and
                                  [:= :moderated_item_type "card"]
                                  [:= :moderated_item_id :c.id]
                                  [:= :most_recent true]]
                       ;; limit 1 to ensure that there is only one result but this invariant should hold true, just
                       ;; protecting against potential bugs
                       :order-by [[:id :desc]]
                       :limit    1}
                      :moderated_status]]
                    dataset?
                    (conj :c.database_id))
       :from      [[:report_card :c]]
       :left-join [[:revision :r] [:and
                                   [:= :r.model_id :c.id]
                                   [:= :r.most_recent true]
                                   [:= :r.model (h2x/literal "Card")]]
                   [:core_user :u] [:= :u.id :r.user_id]]
       :where     [:and
                   [:= :collection_id (:id collection)]
                   [:= :archived (boolean archived?)]
                   [:= :dataset dataset?]]}
      (sql.helpers/where (pinned-state->clause pinned-state))))

(defmethod collection-children-query :dataset
  [_ collection options]
  (card-query true collection options))

(defmethod post-process-collection-children :dataset
  [_ rows]
  (post-process-collection-children :card rows))

(defmethod collection-children-query :card
  [_ collection options]
  (card-query false collection options))

(defn- fully-parametrized-text?
  "Decide if `text`, usually (a part of) a query, is fully parametrized given the parameter types
  described by `template-tags` (usually the template tags of a native query).

  The rules to consider a piece of text fully parametrized is as follows:

  1. All parameters not in an optional block are field-filters or snippets or have a default value.
  2. All required parameters have a default value.

  The first rule is absolutely necessary, as queries violating it cannot be executed without
  externally supplied parameter values. The second rule is more controversial, as field-filters
  outside of optional blocks ([[ ... ]]) don't prevent the query from being executed without
  external parameter values (neither do parameters in optional blocks). The rule has been added
  nonetheless, because marking a parameter as required is something the user does intentionally
  and queries that are technically executable without parameters can be unacceptably slow
  without the necessary constraints. (Marking parameters in optional blocks as required doesn't
  seem to be useful any way, but if the user said it is required, we honor this flag.)"
  [text template-tags]
  (try
    (let [obligatory-params (into #{}
                                  (comp (filter params/Param?)
                                        (map :k))
                                  (params.parse/parse text))]
      (and (every? #(or (#{:dimension :snippet} (:type %))
                        (:default %))
                   (map template-tags obligatory-params))
           (every? #(or (not (:required %))
                        (:default %))
                   (vals template-tags))))
    (catch clojure.lang.ExceptionInfo _
      ;; An exception might be thrown during parameter parsing if the syntax is invalid. In this case we return
      ;; true so that we still can try to generate a preview for the query and display an error.
      false)))

(defn- fully-parametrized-query? [row]
  (let [native-query (-> row :dataset_query json/parse-string mbql.normalize/normalize :native)]
    (if-let [template-tags (:template-tags native-query)]
      (fully-parametrized-text? (:query native-query) template-tags)
      true)))

(defn- post-process-card-row [row]
  (-> row
      (dissoc :authority_level :icon :personal_owner_id :dataset_query)
      (update :collection_preview api/bit->boolean)
      (assoc :fully_parametrized (fully-parametrized-query? row))))

(defmethod post-process-collection-children :card
  [_ rows]
  (map post-process-card-row rows))

(defn- dashboard-query [collection {:keys [archived? pinned-state]}]
  (-> {:select    [:d.id :d.name :d.description :d.entity_id :d.collection_position
                   [(h2x/literal "dashboard") :model]
                   [:u.id :last_edit_user]
                   [:u.email :last_edit_email]
                   [:u.first_name :last_edit_first_name]
                   [:u.last_name :last_edit_last_name]
                   [:r.timestamp :last_edit_timestamp]]
       :from      [[:report_dashboard :d]]
       :left-join [[:revision :r] [:and
                                   [:= :r.model_id :d.id]
                                   [:= :r.most_recent true]
                                   [:= :r.model (h2x/literal "Dashboard")]]
                   [:core_user :u] [:= :u.id :r.user_id]]
       :where     [:and
                   [:= :collection_id (:id collection)]
                   [:= :archived (boolean archived?)]]}
      (sql.helpers/where (pinned-state->clause pinned-state))))

(defmethod collection-children-query :dashboard
  [_ collection options]
  (dashboard-query collection options))

(defmethod post-process-collection-children :dashboard
  [_ rows]
  (map #(dissoc %
                :display :authority_level :moderated_status :icon :personal_owner_id :collection_preview
                :dataset_query)
       rows))

(defenterprise snippets-collection-filter-clause
  "Clause to filter out snippet collections from the collection query on OSS instances, and instances without the
  snippet-collections. EE implementation returns `nil`, so as to not filter out snippet collections."
  metabase-enterprise.snippet-collections.api.native-query-snippet
  []
  [:or
   [:= :namespace nil]
   [:not= :namespace (u/qualified-name "snippets")]])

(defn- collection-query
  [collection {:keys [archived? collection-namespace pinned-state]}]
  (-> (assoc (collection/effective-children-query
              collection
              [:= :archived archived?]
              (perms/audit-namespace-clause :namespace (u/qualified-name collection-namespace))
              (snippets-collection-filter-clause))
             ;; We get from the effective-children-query a normal set of columns selected:
             ;; want to make it fit the others to make UNION ALL work
             :select [:id
                      :name
                      :description
                      :entity_id
                      :personal_owner_id
                      [(h2x/literal "collection") :model]
                      :authority_level])
      ;; the nil indicates that collections are never pinned.
      (sql.helpers/where (pinned-state->clause pinned-state nil))))

(defmethod collection-children-query :collection
  [_ collection options]
  (collection-query collection options))

(defmethod post-process-collection-children :collection
  [_ rows]
  (letfn [(update-personal-collection [{:keys [personal_owner_id] :as row}]
            (if personal_owner_id
              ;; when fetching root collection, we might have personal collection
              (assoc row :name (collection/user->personal-collection-name (:personal_owner_id row) :user))
              (dissoc row :personal_owner_id)))]
    (for [row rows]
      ;; Go through this rigamarole instead of hydration because we
      ;; don't get models back from ulterior over-query
      ;; Previous examination with logging to DB says that there's no N+1 query for this.
      ;; However, this was only tested on H2 and Postgres
      (-> row
          (assoc :can_write (mi/can-write? Collection (:id row)))
          (dissoc :collection_position :display :moderated_status :icon
                  :collection_preview :dataset_query)
          update-personal-collection))))

(mu/defn ^:private coalesce-edit-info :- last-edit/MaybeAnnotated
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
      (cond-> (apply dissoc row :model_ranking (keys mapping))
        ;; don't use contains as they all have the key, we care about a value present
        (:last_edit_user row) (assoc :last-edit-info (select-as row mapping))))))

(defn- post-process-rows
  "Post process any data. Have a chance to process all of the same type at once using
  `post-process-collection-children`. Must respect the order passed in."
  [rows]
  (->> (map-indexed (fn [i row] (vary-meta row assoc ::index i)) rows) ;; keep db sort order
       (group-by :model)
       (into []
             (comp (map (fn [[model rows]]
                          (post-process-collection-children (keyword model) rows)))
                   cat
                   (map coalesce-edit-info)))
       (sort-by (comp ::index meta))))

(defn- model-name->toucan-model [model-name]
  (case (keyword model-name)
    :collection Collection
    :card       Card
    :dataset    Card
    :dashboard  Dashboard
    :pulse      Pulse
    :snippet    NativeQuerySnippet
    :timeline   Timeline))

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
   :model :collection_position :authority_level [:personal_owner_id :integer]
   :last_edit_email :last_edit_first_name :last_edit_last_name :moderated_status :icon
   [:last_edit_user :integer] [:last_edit_timestamp :timestamp] [:database_id :integer]])

(defn- add-missing-columns
  "Ensures that all necessary columns are in the select-columns collection, adding `[nil :column]` as necessary."
  [select-columns necessary-columns]
  (let [columns (m/index-by select-name select-columns)]
    (map (fn [col]
           (let [[col-name typpe] (u/one-or-many col)]
             (get columns col-name (if (and typpe (= (mdb/db-type) :postgres))
                                     [(h2x/cast typpe nil) col-name]
                                     [nil col-name]))))
         necessary-columns)))

(defn- add-model-ranking
  [select-clause model]
  (let [rankings {:dashboard  1
                  :pulse      2
                  :dataset    3
                  :card       4
                  :snippet    5
                  :collection 6
                  :timeline   7}]
    (conj select-clause [[:inline (get rankings model 100)]
                         :model_ranking])))

(comment
  ;; generate the set of columns across all child queries. Remember to add type info if not a text column
  (into []
        (comp cat (map select-name) (distinct))
        (for [model [:card :dashboard :snippet :pulse :collection :timeline]]
          (:select (collection-children-query model {:id 1 :location "/"} nil)))))


(defn children-sort-clause
  "Given the client side sort-info, return sort clause to effect this. `db-type` is necessary due to complications from
  treatment of nulls in the different app db types."
  [sort-info db-type]
  (case sort-info
    nil                     [[:%lower.name :asc]]
    [:name :asc]            [[:%lower.name :asc]]
    [:name :desc]           [[:%lower.name :desc]]
    [:last-edited-at :asc]  [(if (= db-type :mysql)
                               [:%isnull.last_edit_timestamp]
                               [:last_edit_timestamp :nulls-last])
                             [:last_edit_timestamp :asc]
                             [:%lower.name :asc]]
    [:last-edited-at :desc] (remove nil?
                                    [(case db-type
                                       :mysql    [:%isnull.last_edit_timestamp]
                                       :postgres [:last_edit_timestamp :desc-nulls-last]
                                       :h2       nil)
                                     [:last_edit_timestamp :desc]
                                     [:%lower.name :asc]])
    [:last-edited-by :asc]  [(if (= db-type :mysql)
                               [:%isnull.last_edit_last_name]
                               [:last_edit_last_name :nulls-last])
                             [:last_edit_last_name :asc]
                             (if (= db-type :mysql)
                               [:%isnull.last_edit_first_name]
                               [:last_edit_first_name :nulls-last])
                             [:last_edit_first_name :asc]
                             [:%lower.name :asc]]
    [:last-edited-by :desc] (remove nil?
                                    [(case db-type
                                       :mysql    [:%isnull.last_edit_last_name]
                                       :postgres [:last_edit_last_name :desc-nulls-last]
                                       :h2       nil)
                                     [:last_edit_last_name :desc]
                                     (case db-type
                                       :mysql    [:%isnull.last_edit_first_name]
                                       :postgres [:last_edit_last_name :desc-nulls-last]
                                       :h2       nil)
                                     [:last_edit_first_name :desc]
                                     [:%lower.name :asc]])
    [:model :asc]           [[:model_ranking :asc]  [:%lower.name :asc]]
    [:model :desc]          [[:model_ranking :desc] [:%lower.name :asc]]))

(defn- collection-children*
  [collection models {:keys [sort-info] :as options}]
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
        total-query {:select [[:%count.* :count]]
                     :from   [[{:union-all queries} :dummy_alias]]}
        rows-query  {:select   [:*]
                     :from     [[{:union-all queries} :dummy_alias]]
                     :order-by sql-order}
        ;; We didn't implement collection pagination for snippets namespace for root/items
        ;; Rip out the limit for now and put it back in when we want it
        limit-query (if (or
                         (nil? mw.offset-paging/*limit*)
                         (nil? mw.offset-paging/*offset*)
                         (= (:collection-namespace options) "snippets"))
                      rows-query
                      (assoc rows-query
                             :limit  mw.offset-paging/*limit*
                             :offset mw.offset-paging/*offset*))
        res         {:total  (->> (mdb.query/query total-query) first :count)
                     :data   (->> (mdb.query/query limit-query) post-process-rows)
                     :models models}
        limit-res   (assoc res
                           :limit  mw.offset-paging/*limit*
                           :offset mw.offset-paging/*offset*)]
    (if (= (:collection-namespace options) "snippets")
      res
      limit-res)))

(mu/defn ^:private collection-children
  "Fetch a sequence of 'child' objects belonging to a Collection, filtered using `options`."
  [{collection-namespace :namespace, :as collection} :- collection/CollectionWithLocationAndIDOrRoot
   {:keys [models], :as options}                     :- CollectionChildrenOptions]
  (let [valid-models (for [model-kw [:collection :dataset :card :dashboard :pulse :snippet :timeline]
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
       :limit  mw.offset-paging/*limit*
       :offset mw.offset-paging/*offset*
       :models valid-models})))

(mu/defn ^:private collection-detail
  "Add a standard set of details to `collection`, including things like `effective_location`.
  Works for either a normal Collection or the Root Collection."
  [collection :- collection/CollectionWithLocationAndIDOrRoot]
  (-> collection
      collection/personal-collection-with-ui-details
      (t2/hydrate :parent_id :effective_location [:effective_ancestors :can_write] :can_write :is_personal)))

(api/defendpoint GET "/:id"
  "Fetch a specific Collection with standard details added"
  [id]
  {id ms/PositiveInt}
  (collection-detail (api/read-check Collection id)))

(api/defendpoint GET "/root/timelines"
  "Fetch the root Collection's timelines."
  [include archived]
  {include  [:maybe [:= "events"]]
   archived [:maybe :boolean]}
  (timeline/timelines-for-collection nil {:timeline/events?   (= include "events")
                                          :timeline/archived? archived}))

(api/defendpoint GET "/:id/timelines"
  "Fetch a specific Collection's timelines."
  [id include archived]
  {id       ms/PositiveInt
   include  [:maybe [:= "events"]]
   archived [:maybe :boolean]}
  (timeline/timelines-for-collection id {:timeline/events?   (= include "events")
                                         :timeline/archived? archived}))

(api/defendpoint GET "/:id/items"
  "Fetch a specific Collection's items with the following options:

  *  `models` - only include objects of a specific set of `models`. If unspecified, returns objects of all models
  *  `archived` - when `true`, return archived objects *instead* of unarchived ones. Defaults to `false`.
  *  `pinned_state` - when `is_pinned`, return pinned objects only.
                   when `is_not_pinned`, return non pinned objects only.
                   when `all`, return everything. By default returns everything"
  [id models archived pinned_state sort_column sort_direction]
  {id             ms/PositiveInt
   models         [:maybe Models]
   archived       [:maybe ms/BooleanString]
   pinned_state   [:maybe (into [:enum] valid-pinned-state-values)]
   sort_column    [:maybe (into [:enum] valid-sort-columns)]
   sort_direction [:maybe (into [:enum] valid-sort-directions)]}
  (let [model-kwds (set (map keyword (u/one-or-many models)))]
    (collection-children (api/read-check Collection id)
                         {:models       model-kwds
                          :archived?    (Boolean/parseBoolean archived)
                          :pinned-state (keyword pinned_state)
                          :sort-info    [(or (some-> sort_column normalize-sort-choice) :name)
                                         (or (some-> sort_direction normalize-sort-choice) :asc)]})))


;;; -------------------------------------------- GET /api/collection/root --------------------------------------------

(defn- root-collection [collection-namespace]
  (collection-detail (collection/root-collection-with-ui-details collection-namespace)))

(api/defendpoint GET "/root"
  "Return the 'Root' Collection object with standard details added"
  [namespace]
  {namespace [:maybe ms/NonBlankString]}
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

(api/defendpoint GET "/root/items"
  "Fetch objects that the current user should see at their root level. As mentioned elsewhere, the 'Root' Collection
  doesn't actually exist as a row in the application DB: it's simply a virtual Collection where things with no
  `collection_id` exist. It does, however, have its own set of Permissions.

  This endpoint will actually show objects with no `collection_id` for Users that have Root Collection
  permissions, but for people without Root Collection perms, we'll just show the objects that have an effective
  location of `/`.

  This endpoint is intended to power a 'Root Folder View' for the Current User, so regardless you'll see all the
  top-level objects you're allowed to access.

  By default, this will show the 'normal' Collections namespace; to view a different Collections namespace, such as
  `snippets`, you can pass the `?namespace=` parameter."
  [models archived namespace pinned_state sort_column sort_direction]
  {models         [:maybe Models]
   archived       [:maybe ms/BooleanString]
   namespace      [:maybe ms/NonBlankString]
   pinned_state   [:maybe (into [:enum] valid-pinned-state-values)]
   sort_column    [:maybe (into [:enum] valid-sort-columns)]
   sort_direction [:maybe (into [:enum] valid-sort-directions)]}
  ;; Return collection contents, including Collections that have an effective location of being in the Root
  ;; Collection for the Current User.
  (let [root-collection (assoc collection/root-collection :namespace namespace)
        model-set       (set (map keyword (u/one-or-many models)))
        model-kwds      (visible-model-kwds root-collection model-set)]
    (collection-children
     root-collection
     {:models       model-kwds
      :archived?    (Boolean/parseBoolean archived)
      :pinned-state (keyword pinned_state)
      :sort-info    [(or (some-> sort_column normalize-sort-choice) :name)
                     (or (some-> sort_direction normalize-sort-choice) :asc)]})))


;;; ----------------------------------------- Creating/Editing a Collection ------------------------------------------

(defn- write-check-collection-or-root-collection
  "Check that you're allowed to write Collection with `collection-id`; if `collection-id` is `nil`, check that you have
  Root Collection perms."
  [collection-id collection-namespace]
  (api/write-check (if collection-id
                     (t2/select-one Collection :id collection-id)
                     (cond-> collection/root-collection
                       collection-namespace (assoc :namespace collection-namespace)))))

(defn create-collection!
  "Create a new collection."
  [{:keys [name description parent_id namespace authority_level]}]
  ;; To create a new collection, you need write perms for the location you are going to be putting it in...
  (write-check-collection-or-root-collection parent_id namespace)
  (when (some? authority_level)
    ;; make sure only admin and an EE token is present to be able to create an Official token
    (premium-features/assert-has-feature :official-collections (tru "Official Collections"))
    (api/check-superuser))
  ;; Now create the new Collection :)
  (first
    (t2/insert-returning-instances!
      Collection
      (merge
        {:name        name
         :description description
         :authority_level authority_level
         :namespace   namespace}
        (when parent_id
          {:location (collection/children-location (t2/select-one [Collection :location :id] :id parent_id))})))))

(api/defendpoint POST "/"
  "Create a new Collection."
  [:as {{:keys [name description parent_id namespace authority_level] :as body} :body}]
  {name            ms/NonBlankString
   description     [:maybe ms/NonBlankString]
   parent_id       [:maybe ms/PositiveInt]
   namespace       [:maybe ms/NonBlankString]
   authority_level [:maybe collection/AuthorityLevel]}
  (create-collection! body))

;; TODO - I'm not 100% sure it makes sense that moving a Collection requires a special call to `move-collection!`,
;; while archiving is handled automatically as part of the `pre-update` logic when you change a Collection's
;; `archived` value. They are both recursive operations; couldn't we just have moving happen automatically when you
;; change a `:location` as well?
(defn- move-collection-if-needed!
  "If input the `PUT /api/collection/:id` endpoint (`collection-updates`) specify that we should *move* a Collection, do
  appropriate permissions checks and move it (and its descendants)."
  [collection-before-update collection-updates]
  ;; is a [new] parent_id update specified in the PUT request?
  (when (contains? collection-updates :parent_id)
    (let [orig-location (:location collection-before-update)
          new-parent-id (:parent_id collection-updates)
          new-parent    (if new-parent-id
                          (t2/select-one [Collection :location :id] :id new-parent-id)
                          collection/root-collection)
          new-location  (collection/children-location new-parent)]
      ;; check and make sure we're actually supposed to be moving something
      (when (not= orig-location new-location)
        ;; ok, make sure we have perms to do this operation
        (api/check-403
         (perms/set-has-full-permissions-for-set? @api/*current-user-permissions-set*
           (collection/perms-for-moving collection-before-update new-parent)))
        ;; ok, we're good to move!
        (collection/move-collection! collection-before-update new-location)))))

(defn- check-allowed-to-archive-or-unarchive
  "If input the `PUT /api/collection/:id` endpoint (`collection-updates`) specify that we should change the `archived`
  status of a Collection, do appropriate permissions checks. (Actual recurisve (un)archiving logic is handled by
  Collection's `pre-update`, so we do not need to manually call `collection/archive-collection!` and the like in this
  namespace.)"
  [collection-before-update collection-updates]
  (when (api/column-will-change? :archived collection-before-update collection-updates)
    ;; Check that we have approprate perms
    (api/check-403
     (perms/set-has-full-permissions-for-set? @api/*current-user-permissions-set*
       (collection/perms-for-archiving collection-before-update)))))

(defn- maybe-send-archived-notifications!
  "When a collection is archived, all of it's cards are also marked as archived, but this is down in the model layer
  which will not cause the archive notification code to fire. This will delete the relevant alerts and notify the
  users just as if they had be archived individually via the card API."
  [& {:keys [collection-before-update collection-updates actor]}]
  (when (api/column-will-change? :archived collection-before-update collection-updates)
    (when-let [alerts (seq (pulse/retrieve-alerts-for-cards
                            {:card-ids (t2/select-pks-set Card :collection_id (u/the-id collection-before-update))}))]
      (card/delete-alert-and-notify-archived! {:alerts alerts :actor actor}))))

(api/defendpoint PUT "/:id"
  "Modify an existing Collection, including archiving or unarchiving it, or moving it."
  [id, :as {{:keys [name description archived parent_id authority_level], :as collection-updates} :body}]
  {id              ms/PositiveInt
   name            [:maybe ms/NonBlankString]
   description     [:maybe ms/NonBlankString]
   archived        [:maybe ms/BooleanValue]
   parent_id       [:maybe ms/PositiveInt]
   authority_level [:maybe collection/AuthorityLevel]}
  ;; do we have perms to edit this Collection?
  (let [collection-before-update (api/write-check Collection id)]
    ;; if we're trying to *archive* the Collection, make sure we're allowed to do that
    (check-allowed-to-archive-or-unarchive collection-before-update collection-updates)
    ;; if authority_level is changing, make sure we're allowed to do that
    (when (and (contains? collection-updates :authority_level)
               (not= (keyword authority_level) (:authority_level collection-before-update)))
      (premium-features/assert-has-feature :official-collections (tru "Official Collections"))
      (api/check-403 (and api/*is-superuser?*
                          ;; pre-update of model checks if the collection is a personal collection and rejects changes
                          ;; to authority_level, but it doesn't check if it is a sub-collection of a personal one so we add that
                          ;; here
                          (not (collection/is-personal-collection-or-descendant-of-one? collection-before-update)))))
    ;; ok, go ahead and update it! Only update keys that were specified in the `body`. But not `parent_id` since
    ;; that's not actually a property of Collection, and since we handle moving a Collection separately below.
    (let [updates (u/select-keys-when collection-updates :present [:name :description :archived :authority_level])]
      (when (seq updates)
        (t2/update! Collection id updates)))
    ;; if we're trying to *move* the Collection (instead or as well) go ahead and do that
    (move-collection-if-needed! collection-before-update collection-updates)
    ;; if we *did* end up archiving this Collection, we most post a few notifications
    (maybe-send-archived-notifications! {:collection-before-update collection-before-update
                                         :collection-updates       collection-updates
                                         :actor                    @api/*current-user*}))
  ;; finally, return the updated object
  (collection-detail (t2/select-one Collection :id id)))

;;; ------------------------------------------------ GRAPH ENDPOINTS -------------------------------------------------

(api/defendpoint GET "/graph"
  "Fetch a graph of all Collection Permissions."
  [namespace]
  {namespace [:maybe ms/NonBlankString]}
  (api/check-superuser)
  (graph/graph namespace))

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
   [:revision int?]
   [:groups [:map-of GroupID GroupPermissionsGraph]]])

(def ^:private graph-decoder
  "Building it this way is a lot faster then calling mc/decode <value> <schema> <transformer>"
  (mc/decoder PermissionsGraph (mtx/string-transformer)))

(defn- decode-graph [permission-graph]
  ;; TODO: should use a coercer for this?
  (graph-decoder permission-graph))

(api/defendpoint PUT "/graph"
  "Do a batch update of Collections Permissions by passing in a modified graph.
  Will overwrite parts of the graph that are present in the request, and leave the rest unchanged."
  [:as {{:keys [namespace], :as body} :body}]
  {body      :map
   namespace [:maybe ms/NonBlankString]}
  (api/check-superuser)
  (->> (dissoc body :namespace)
       decode-graph
       (graph/update-graph! namespace))
  (graph/graph namespace))

(api/define-routes)
