(ns metabase.api.collection
  "`/api/collection` endpoints. By default, these endpoints operate on Collections in the 'default' namespace, which is
  the one that has things like Dashboards and Cards. Other namespaces of Collections exist as well, such as the
  `:snippet` namespace, (called 'Snippet folders' in the UI). These namespaces are completely independent hierarchies.
  To use these endpoints for other Collections namespaces, you can pass the `?namespace=` parameter (e.g.
  `?namespace=snippet`)."
  (:require [clojure.string :as str]
            [compojure.core :refer [GET POST PUT]]
            [honeysql.core :as hsql]
            [honeysql.helpers :as h]
            [medley.core :as m]
            [metabase.api.card :as card-api]
            [metabase.api.common :as api]
            [metabase.db.env :as mdb.env]
            [metabase.models.card :refer [Card]]
            [metabase.models.collection :as collection :refer [Collection]]
            [metabase.models.collection.graph :as collection.graph]
            [metabase.models.collection.root :as collection.root]
            [metabase.models.dashboard :refer [Dashboard]]
            [metabase.models.interface :as mi]
            [metabase.models.native-query-snippet :refer [NativeQuerySnippet]]
            [metabase.models.permissions :as perms]
            [metabase.models.pulse :as pulse :refer [Pulse]]
            [metabase.models.pulse-card :refer [PulseCard]]
            [metabase.models.revision.last-edit :as last-edit]
            [metabase.server.middleware.offset-paging :as offset-paging]
            [metabase.util :as u]
            [metabase.util.honeysql-extensions :as hx]
            [metabase.util.schema :as su]
            [schema.core :as s]
            [toucan.db :as db]
            [toucan.hydrate :refer [hydrate]]))

(declare root-collection)

(api/defendpoint GET "/"
  "Fetch a list of all Collections that the current user has read permissions for (`:can_write` is returned as an
  additional property of each Collection so you can tell which of these you have write permissions for.)

  By default, this returns non-archived Collections, but instead you can show archived ones by passing
  `?archived=true`."
  [archived namespace]
  {archived  (s/maybe su/BooleanString)
   namespace (s/maybe su/NonBlankString)}
  (let [archived? (Boolean/parseBoolean archived)]
    (as-> (db/select Collection
            {:where    [:and
                        [:= :archived archived?]
                        [:= :namespace namespace]
                        (collection/visible-collection-ids->honeysql-filter-clause
                         :id
                         (collection/permissions-set->visible-collection-ids @api/*current-user-permissions-set*))]
             :order-by [[:%lower.name :asc]]}) collections
      ;; include Root Collection at beginning or results if archived isn't `true`
      (if archived?
        collections
        (cons (root-collection namespace) collections))
      (hydrate collections :can_write)
      ;; remove the :metabase.models.collection.root/is-root? tag since FE doesn't need it
      (for [collection collections]
        (dissoc collection ::collection.root/is-root?)))))

(api/defendpoint GET "/tree"
  "Similar to `GET /`, but returns Collections in a tree structure, e.g.

    [{:name     \"A\"
      :children [{:name \"B\"}
                 {:name     \"C\"
                  :children [{:name     \"D\"
                              :children [{:name \"E\"}]}
                             {:name     \"F\"
                              :children [{:name \"G\"}]}]}]}
     {:name \"H\"}]"
  [namespace]
  {namespace (s/maybe su/NonBlankString)}
  (collection/collections->tree
   (db/select Collection
     {:where [:and
              [:= :namespace namespace]
              (collection/visible-collection-ids->honeysql-filter-clause
               :id
               (collection/permissions-set->visible-collection-ids @api/*current-user-permissions-set*))]})))


;;; --------------------------------- Fetching a single Collection & its 'children' ----------------------------------

(def ^:private valid-model-param-values
  "Valid values for the `?model=` param accepted by endpoints in this namespace.
  `no_models` is for nilling out the set because a nil model set is actually the total model set"
  #{"card" "collection" "dashboard" "pulse" "snippet" "no_models"})

(def ^:private ModelString
  (apply s/enum valid-model-param-values))

; This is basically a union type. defendpoint splits the string if it only gets one
(def ^:private models-schema (s/conditional #(vector? %) [ModelString] :else ModelString))

(def ^:private valid-pinned-state-values
  "Valid values for the `?pinned_state` param accepted by endpoints in this namespace."
  #{"all" "is_pinned" "is_not_pinned"})

(def ^:private valid-sort-columns #{"name" "last_edited_at" "last_edited_by" "model"})
(def ^:private valid-sort-directions #{"asc" "desc"})
(defn- normalize-sort-choice [w] (when w (keyword (str/replace w #"_" "-"))))


(def ^:private CollectionChildrenOptions
  {:archived?    s/Bool
   :pinned-state (s/maybe (apply s/enum (map keyword valid-pinned-state-values)))
   ;; when specified, only return results of this type.
   :models       (s/maybe #{(apply s/enum (map keyword valid-model-param-values))})
   :sort-info    (s/maybe [(s/one (apply s/enum (map normalize-sort-choice valid-sort-columns)) "sort-columns")
                           (s/one (apply s/enum (map normalize-sort-choice valid-sort-directions)) "sort-direction")])})

(defmulti ^:private collection-children-query
  "Query that will fetch the 'children' of a `collection`, for different types of objects. Possible options are listed
  in the `CollectionChildrenOptions` schema above.

  NOTES:

  *  `collection` will be either a CollectionInstance, or the Root Collection special placeholder object, so do not use
     `u/the-id` on it! Use `:id`, which will return `nil` for the Root Collection, which is exactly what we want.

  * These queries will be combined into a union-all query. You do not need to put all of the columns into the query,
  any you don't select will be added in the correct position so the union will work (see `all-select-columns` for more
  details)."
  {:arglists '([model collection options])}
  (fn [model _ _] (keyword model)))

(defn- pinned-state->clause
  ([pinned-state]
   (pinned-state->clause pinned-state :collection_position))
  ([pinned-state col]
   (case pinned-state
     :all [:= 1 1]
     :is_pinned [:<> col nil]
     :is_not_pinned [:= col nil]
     [:= 1 1])))

(defmulti ^:private post-process-collection-children
  {:arglists '([model rows])}
  (fn [model _]
    (keyword model)))

(defmethod ^:private post-process-collection-children :default
  [_ rows]
  rows)

(defmethod collection-children-query :pulse
  [_ collection {:keys [archived? pinned-state]}]
  (-> {:select    [:p.id
                   :p.name
                   :p.collection_position
                   [(hx/literal "pulse") :model]]
       :modifiers [:distinct]
       :from      [[Pulse :p]]
       :left-join [[PulseCard :pc] [:= :p.id :pc.pulse_id]]
       :where     [:and
                   [:= :p.collection_id      (:id collection)]
                   [:= :p.archived           (boolean archived?)]
                   ;; exclude alerts
                   [:= :p.alert_condition    nil]
                   ;; exclude dashboard subscriptions
                   [:= :p.dashboard_id nil]]}
      (h/merge-where (pinned-state->clause pinned-state :p.collection_position))))

(defmethod post-process-collection-children :pulse
  [_ rows]
  (for [row rows]
    (dissoc row :description :display)))

(defmethod collection-children-query :snippet
  [_ collection {:keys [archived? pinned-state]}]
  {:select [:id :name [(hx/literal "snippet") :model]]
       :from   [[NativeQuerySnippet :nqs]]
       :where  [:and
                [:= :collection_id (:id collection)]
                [:= :archived (boolean archived?)]]})

(defmethod post-process-collection-children :snippet
  [_ rows]
  (for [row rows]
    (dissoc row :description :collection_position :display)))

(defmethod collection-children-query :card
  [_ collection {:keys [archived? pinned-state]}]
  (-> {:select    [:c.id :c.name :c.description :c.collection_position :c.display [(hx/literal "card") :model]
                   [:u.id :last_edit_user] [:u.email :last_edit_email]
                   [:u.first_name :last_edit_first_name] [:u.last_name :last_edit_last_name]
                   [:r.timestamp :last_edit_timestamp]]
       :from      [[Card :c]]
       ;; todo: should there be a flag, or a realized view?
       :left-join [[{:select [:r1.*]
                     :from [[:revision :r1]]
                     :left-join [[:revision :r2] [:and
                                                  [:= :r1.model_id :r2.model_id]
                                                  [:= :r1.model :r2.model]
                                                  [:< :r1.id :r2.id]]]
                     :where [:and
                             [:= :r2.id nil]
                             [:= :r1.model (hx/literal "Card")]]} :r]
                   [:= :r.model_id :c.id]
                   [:core_user :u] [:= :u.id :r.user_id]]
       :where     [:and
                   [:= :collection_id (:id collection)]
                   [:= :archived (boolean archived?)]]}
      (h/merge-where (pinned-state->clause pinned-state))))

(defmethod post-process-collection-children :card
  [_ rows]
  (hydrate rows :favorite))

(defmethod collection-children-query :dashboard
  [_ collection {:keys [archived? pinned-state]}]
  (-> {:select    [:d.id :d.name :d.description :d.collection_position [(hx/literal "dashboard") :model]
                   [:u.id :last_edit_user] [:u.email :last_edit_email]
                   [:u.first_name :last_edit_first_name] [:u.last_name :last_edit_last_name]
                   [:r.timestamp :last_edit_timestamp]]
       :from      [[Dashboard :d]]
       :left-join [[{:select [:r1.*]
                     :from [[:revision :r1]]
                     :left-join [[:revision :r2] [:and
                                                  [:= :r1.model_id :r2.model_id]
                                                  [:= :r1.model :r2.model]
                                                  [:< :r1.id :r2.id]]]
                     :where [:and
                             [:= :r2.id nil]
                             [:= :r1.model (hx/literal "Dashboard")]]} :r]
                   [:= :r.model_id :d.id]
                   [:core_user :u] [:= :u.id :r.user_id]]
       :where     [:and
                   [:= :collection_id (:id collection)]
                   [:= :archived (boolean archived?)]]}
      (h/merge-where (pinned-state->clause pinned-state))))

(defmethod post-process-collection-children :dashboard
  [_ rows]
  (hydrate (map #(dissoc % :display) rows) :favorite))

(defmethod collection-children-query :collection
  [_ collection {:keys [archived? collection-namespace pinned-state]}]
  (-> (assoc (collection/effective-children-query
               collection
               [:= :archived archived?]
               [:= :namespace (u/qualified-name collection-namespace)])
             ;; We get from the effective-children-query a normal set of columns selected:
             ;; want to make it fit the others to make UNION ALL work
             :select [:id
                      :name
                      :description
                      [(hx/literal "collection") :model]])
      ;; the nil indicates that collections are never pinned.
      (h/merge-where (pinned-state->clause pinned-state nil))))

(defmethod post-process-collection-children :collection
  [_ rows]
  (for [row rows]
    ;; Go through this rigamarole instead of hydration because we
    ;; don't get models back from ulterior over-query
    ;; Previous examination with logging to DB says that there's no N+1 query for this.
    ;; However, this was only tested on H2 and Postgres
    (assoc (dissoc row :collection_position :display)
           :can_write
           (mi/can-write? Collection (:id row)))))

(s/defn ^:private coalesce-edit-info :- last-edit/MaybeAnnotated
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
    :dashboard  Dashboard
    :pulse      Pulse
    :snippet    NativeQuerySnippet))

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
  [:id :name :description :display :model :collection_position
   :last_edit_email :last_edit_first_name :last_edit_last_name
   [:last_edit_user :integer] [:last_edit_timestamp :timestamp]])

(defn- add-missing-columns
  "Ensures that all necessary columns are in the select-columns collection, adding `[nil :column]` as necessary."
  [select-columns necessary-columns]
  (let [columns (m/index-by select-name select-columns)]
    (map (fn [col]
           (let [[col-name typpe] (u/one-or-many col)]
             (get columns col-name (if (and typpe (= @mdb.env/db-type :postgres))
                                     [(hx/cast typpe nil) col-name]
                                     [nil col-name]))))
         necessary-columns)))

(defn- add-model-ranking
  [select-clause model]
  (let [rankings {:dashboard  1
                  :pulse      2
                  :card       3
                  :snippet    4
                  :collection 5}]
    (conj select-clause [(get rankings model 100)
                         :model_ranking])))

(comment
  ;; generate the set of columns across all child queries. Remember to add type info if not a text column
  (into []
        (comp cat (map select-name) (distinct))
        (for [model [:card :dashboard :snippet :pulse :collection]]
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
                               [(hsql/call :ISNULL :last_edit_timestamp)]
                               [:last_edit_timestamp :nulls-last])
                             [:last_edit_timestamp :asc]
                             [:%lower.name :asc]]
    [:last-edited-at :desc] (remove nil?
                                    [(case db-type
                                       :mysql    [(hsql/call :ISNULL :last_edit_timestamp)]
                                       :postgres [:last_edit_timestamp :desc :nulls-last]
                                       :h2       nil)
                                     [:last_edit_timestamp :desc]
                                     [:%lower.name :asc]])
    [:last-edited-by :asc]  [(if (= db-type :mysql)
                               [(hsql/call :ISNULL :last_edit_last_name)]
                               [:last_edit_last_name :nulls-last])
                             [:last_edit_last_name :asc]
                             (if (= db-type :mysql)
                               [(hsql/call :ISNULL :last_edit_first_name)]
                               [:last_edit_first_name :nulls-last])
                             [:last_edit_first_name :asc]
                             [:%lower.name :asc]]
    [:last-edited-by :desc] (remove nil?
                                    [(case db-type
                                       :mysql    [(hsql/call :ISNULL :last_edit_last_name)]
                                       :postgres [:last_edit_last_name :desc :nulls-last]
                                       :h2       nil)
                                     [:last_edit_last_name :desc]
                                     (case db-type
                                       :mysql    [(hsql/call :ISNULL :last_edit_first_name)]
                                       :postgres [:last_edit_last_name :desc :nulls-last]
                                       :h2       nil)
                                     [:last_edit_first_name :desc]
                                     [:%lower.name :asc]])
    [:model :asc]           [[:model_ranking :asc]  [:%lower.name :asc]]
    [:model :desc]          [[:model_ranking :desc] [:%lower.name :asc]]))

(defn- collection-children*
  [collection models {:keys [collection-namespace sort-info] :as options}]
  (let [sql-order   (children-sort-clause sort-info @mdb.env/db-type)
        models      (sort (map keyword models))
        queries     (for [model models]
                      (-> (collection-children-query model collection options)
                          (update :select add-missing-columns all-select-columns)
                          (update :select add-model-ranking model)))
        total-query {:select [[:%count.* :count]]
                     :from   [[{:union-all queries} :dummy_alias]]}
        rows-query  {:select   [:*]
                     :from     [[{:union-all queries} :dummy_alias]]
                     :order-by sql-order}
        ;; We didn't implement collection pagination for snippets namespace for root/items
        ;; Rip out the limit for now and put it back in when we want it
        limit-query (if (= (:collection-namespace options) "snippets")
                      rows-query
                      (assoc rows-query
                             :limit  offset-paging/*limit*
                             :offset offset-paging/*offset*))
        res          {:total  (->> (db/query total-query) first :count)
                      :data   (->> (db/query limit-query) post-process-rows)
                      :models models}
        limit-res   (assoc res
                           :limit  offset-paging/*limit*
                           :offset offset-paging/*offset*)]
    (if (= (:collection-namespace options) "snippets")
      res
      limit-res)))

(s/defn ^:private collection-children
  "Fetch a sequence of 'child' objects belonging to a Collection, filtered using `options`."
  [{collection-namespace :namespace, :as collection}            :- collection/CollectionWithLocationAndIDOrRoot
   {:keys [models collections-only? pinned-state], :as options} :- CollectionChildrenOptions]
  (let [valid-models (for [model-kw [:collection :card :dashboard :pulse :snippet]
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
       :limit  offset-paging/*limit*
       :offset offset-paging/*offset*
       :models valid-models})))

(s/defn ^:private collection-detail
  "Add a standard set of details to `collection`, including things like `effective_location`.
  Works for either a normal Collection or the Root Collection."
  [collection :- collection/CollectionWithLocationAndIDOrRoot]
  (-> collection
      (hydrate :parent_id :effective_location [:effective_ancestors :can_write] :can_write)))

(api/defendpoint GET "/:id"
  "Fetch a specific Collection with standard details added"
  [id]
  (collection-detail (api/read-check Collection id)))

(api/defendpoint GET "/:id/items"
  "Fetch a specific Collection's items with the following options:

  *  `models` - only include objects of a specific set of `models`. If unspecified, returns objects of all models
  *  `archived` - when `true`, return archived objects *instead* of unarchived ones. Defaults to `false`.
  *  `pinned_state` - when `is_pinned`, return pinned objects only.
                   when `is_not_pinned`, return non pinned objects only.
                   when `all`, return everything. By default returns everything"
  [id models archived pinned_state sort_column sort_direction]
  {models         (s/maybe models-schema)
   archived       (s/maybe su/BooleanString)
   pinned_state   (s/maybe (apply s/enum valid-pinned-state-values))
   sort_column    (s/maybe (apply s/enum valid-sort-columns))
   sort_direction (s/maybe (apply s/enum valid-sort-directions))}
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
  {namespace (s/maybe su/NonBlankString)}
  (dissoc (root-collection namespace) ::collection.root/is-root?))

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
  {models         (s/maybe models-schema)
   archived       (s/maybe su/BooleanString)
   namespace      (s/maybe su/NonBlankString)
   pinned_state   (s/maybe (apply s/enum valid-pinned-state-values))
   sort_column    (s/maybe (apply s/enum valid-sort-columns))
   sort_direction (s/maybe (apply s/enum valid-sort-directions))}
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
  [collection-id]
  (api/write-check (if collection-id
                     (Collection collection-id)
                     collection/root-collection)))

(api/defendpoint POST "/"
  "Create a new Collection."
  [:as {{:keys [name color description parent_id namespace authority_level]} :body}]
  {name            su/NonBlankString
   color           collection/hex-color-regex
   description     (s/maybe su/NonBlankString)
   parent_id       (s/maybe su/IntGreaterThanZero)
   namespace       (s/maybe su/NonBlankString)
   authority_level collection/AuthorityLevel}
  ;; To create a new collection, you need write perms for the location you are going to be putting it in...
  (write-check-collection-or-root-collection parent_id)
  ;; Now create the new Collection :)
  (api/check-403 (or (nil? authority_level)
                     (and api/*is-superuser?* authority_level)))
  (db/insert! Collection
    (merge
     {:name        name
      :color       color
      :description description
      :namespace   namespace}
     (when parent_id
       {:location (collection/children-location (db/select-one [Collection :location :id] :id parent_id))}))))

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
                          (db/select-one [Collection :location :id] :id new-parent-id)
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

(defn- maybe-send-archived-notificaitons!
  "When a collection is archived, all of it's cards are also marked as archived, but this is down in the model layer
  which will not cause the archive notification code to fire. This will delete the relevant alerts and notify the
  users just as if they had be archived individually via the card API."
  [collection-before-update collection-updates]
  (when (api/column-will-change? :archived collection-before-update collection-updates)
    (when-let [alerts (seq (apply pulse/retrieve-alerts-for-cards (db/select-ids Card
                                                                    :collection_id (u/the-id collection-before-update))))]
        (card-api/delete-alert-and-notify-archived! alerts))))

(api/defendpoint PUT "/:id"
  "Modify an existing Collection, including archiving or unarchiving it, or moving it."
  [id, :as {{:keys [name color description archived parent_id authority_level update_collection_tree_authority_level], :as collection-updates} :body}]
  {name                                   (s/maybe su/NonBlankString)
   color                                  (s/maybe collection/hex-color-regex)
   description                            (s/maybe su/NonBlankString)
   archived                               (s/maybe s/Bool)
   parent_id                              (s/maybe su/IntGreaterThanZero)
   authority_level                        collection/AuthorityLevel
   update_collection_tree_authority_level (s/maybe s/Bool)}
  ;; do we have perms to edit this Collection?
  (let [collection-before-update (api/write-check Collection id)]
    ;; if we're trying to *archive* the Collection, make sure we're allowed to do that
    (check-allowed-to-archive-or-unarchive collection-before-update collection-updates)
    (when (or (and (contains? collection-updates :authority_level)
                   (not= authority_level (:authority_level collection-before-update)))
              update_collection_tree_authority_level)
      (api/check-403 (and api/*is-superuser?*
                          ;; pre-update of model checks if the collection is a personal collection and rejects changes
                          ;; to authority_level, but it doesn't check if it is a sub-collection of a personal one so we add that
                          ;; here
                          (not (collection/is-personal-collection-or-descendant-of-one? collection-before-update)))))
    ;; ok, go ahead and update it! Only update keys that were specified in the `body`. But not `parent_id` since
    ;; that's not actually a property of Collection, and since we handle moving a Collection separately below.
    (let [updates (u/select-keys-when collection-updates :present [:name :color :description :archived :authority_level])]
      (when (seq updates)
        (db/update! Collection id updates)))
    ;; if we're trying to *move* the Collection (instead or as well) go ahead and do that
    (move-collection-if-needed! collection-before-update collection-updates)
    ;; mark the tree after moving so the new tree is what is marked as official
    (when update_collection_tree_authority_level
      (db/execute! {:update Collection
                    :set    {:authority_level authority_level}
                    :where  [:or
                             [:= :id id]
                             [:like :location (hx/literal (format "%%/%d/%%" id))]]}))
    ;; if we *did* end up archiving this Collection, we most post a few notifications
    (maybe-send-archived-notificaitons! collection-before-update collection-updates))
  ;; finally, return the updated object
  (-> (Collection id)
      (hydrate :parent_id)))


;;; ------------------------------------------------ GRAPH ENDPOINTS -------------------------------------------------

(api/defendpoint GET "/graph"
  "Fetch a graph of all Collection Permissions."
  [namespace]
  {namespace (s/maybe su/NonBlankString)}
  (api/check-superuser)
  (collection.graph/graph namespace))

(defn- ->int [id] (Integer/parseInt (name id)))

(defn- dejsonify-collections [collections]
  (into {} (for [[collection-id perms] collections]
             [(if (= (keyword collection-id) :root)
                :root
                (->int collection-id))
              (keyword perms)])))

(defn- dejsonify-groups [groups]
  (into {} (for [[group-id collections] groups]
             {(->int group-id) (dejsonify-collections collections)})))

(defn- dejsonify-graph
  "Fix the types in the graph when it comes in from the API, e.g. converting things like `\"none\"` to `:none` and
  parsing object keys as integers."
  [graph]
  (update graph :groups dejsonify-groups))

(api/defendpoint PUT "/graph"
  "Do a batch update of Collections Permissions by passing in a modified graph."
  [:as {{:keys [namespace], :as body} :body}]
  {body      su/Map
   namespace (s/maybe su/NonBlankString)}
  (api/check-superuser)
  (->> (dissoc body :namespace)
       dejsonify-graph
       (collection.graph/update-graph! namespace))
  (collection.graph/graph namespace))

(api/define-routes)
