(ns metabase.api.collection
  "`/api/collection` endpoints. By default, these endpoints operate on Collections in the 'default' namespace, which is
  the one that has things like Dashboards and Cards. Other namespaces of Collections exist as well, such as the
  `:snippet` namespace, (called 'Snippet folders' in the UI). These namespaces are completely independent hierarchies.
  To use these endpoints for other Collections namespaces, you can pass the `?namespace=` parameter (e.g.
  `?namespace=snippet`)."
  (:require [compojure.core :refer [GET POST PUT]]
            [honeysql.helpers :as h]
            [metabase.api.card :as card-api]
            [metabase.api.common :as api]
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
  []
  (collection/collections->tree
   (db/select Collection
     {:where (collection/visible-collection-ids->honeysql-filter-clause
              :id
              (collection/permissions-set->visible-collection-ids @api/*current-user-permissions-set*))})))


;;; --------------------------------- Fetching a single Collection & its 'children' ----------------------------------

(def ^:private valid-model-param-values
  "Valid values for the `?model=` param accepted by endpoints in this namespace."
  #{"card" "collection" "dashboard" "pulse" "snippet"})

(def ^:private ModelString
  (apply s/enum valid-model-param-values))

; This is basically a union type. defendpoint splits the string if it only gets one
(def ^:private models-schema (s/conditional #(vector? %) [ModelString] :else ModelString))

(def ^:private valid-pinned-state-values
  "Valid values for the `?pinned_state` param accepted by endpoints in this namespace."
  #{"all" "is_pinned" "is_not_pinned"})


(def ^:private CollectionChildrenOptions
  {:archived?      s/Bool
   :pinned-state   (s/maybe (apply s/enum (map keyword valid-pinned-state-values)))
   ;; when specified, only return results of this type.
   :models         (s/maybe #{(apply s/enum (map keyword valid-model-param-values))})})

(defmulti ^:private collection-children-query
  "Query that will fetch the 'children' of a `collection`, for different types of objects. Possible options are listed
  in the `CollectionChildrenOptions` schema above.

  NOTES:

  *  `collection` will be either a CollectionInstance, or the Root Collection special placeholder object, so do not use
     `u/the-id` on it! Use `:id`, which will return `nil` for the Root Collection, which is exactly what we want."
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
                   [nil :p.description]
                   :p.collection_position
                   [nil :p.display]
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
  {:select [:id :name [nil :description] [nil :collection_position] [nil :display] [(hx/literal "snippet") :model]]
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
  (-> {:select [:id :name :description :collection_position :display [(hx/literal "card") :model]]
       :from   [[Card :c]]
       :where  [:and
                [:= :collection_id (:id collection)]
                [:= :archived (boolean archived?)]]}
      (h/merge-where (pinned-state->clause pinned-state))))

(defmethod post-process-collection-children :card
  [_ rows]
  (let [last-edits (last-edit/fetch-last-edited-info {:card-ids (->> rows (map :id))})]
    (for [row (hydrate rows :favorite)]
        (if-let [edit-info (get-in last-edits [:card (:id row)])]
          (assoc row :last-edit-info edit-info)
          row))))

(defmethod collection-children-query :dashboard
  [_ collection {:keys [archived? pinned-state]}]
  (-> {:select [:id :name :description :collection_position [nil :display] [(hx/literal "dashboard") :model]]
       :from   [[Dashboard :d]]
       :where  [:and
                [:= :collection_id (:id collection)]
                [:= :archived (boolean archived?)]]}
      (h/merge-where (pinned-state->clause pinned-state))))

(defmethod post-process-collection-children :dashboard
  [_ rows]
  (let [last-edits (last-edit/fetch-last-edited-info {:dashboard-ids (->> rows (map :id))})]
    (for [row (hydrate rows :favorite)]
      (let [res (dissoc row :display)]
        (if-let [edit-info (get-in last-edits [:dashboard (:id res)])]
          (assoc res :last-edit-info edit-info)
          res)))))

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
                      [nil :collection_position]
                      [nil :display]
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

(defn- post-process-rows [rows]
  (mapcat
    (fn [[model rows]]
      (post-process-collection-children (keyword model) rows))
    (group-by :model rows)))

(defn- model-name->toucan-model [model-name]
  (case (keyword model-name)
    :collection Collection
    :card       Card
    :dashboard  Dashboard
    :pulse      Pulse
    :snippet    NativeQuerySnippet))

(defn- collection-children*
  [collection models options]
  (let [models            (sort (map keyword models))
        queries           (for [model models]
                            (collection-children-query model collection options))
        total-query       {:select [[:%count.* :count]]
                           :from   [[{:union-all queries} :dummy_alias]]}
        rows-query        {:select   [:*]
                           :from     [[{:union-all queries} :dummy_alias]]
                           :order-by [[:%lower.name :asc]]
                           :limit    offset-paging/*limit*
                           :offset   offset-paging/*offset*}]
    {:total  (-> (db/query total-query) first :count)
     :data   (-> (db/query rows-query) post-process-rows)
     :limit  offset-paging/*limit*
     :offset offset-paging/*offset*
     :models models}))

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
    (collection-children* collection valid-models (assoc options :collection-namespace collection-namespace))))

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
  [id models archived pinned_state]
  {models       (s/maybe models-schema)
   archived     (s/maybe su/BooleanString)
   pinned_state (s/maybe (apply s/enum valid-pinned-state-values))}
  (let [model-kwds    (set (map keyword (u/one-or-many models)))]
    (collection-children (api/read-check Collection id)
                         {:models       model-kwds
                          :archived?    (Boolean/parseBoolean archived)
                          :pinned-state (keyword pinned_state)})))


;;; -------------------------------------------- GET /api/collection/root --------------------------------------------

(defn- root-collection [collection-namespace]
  (collection-detail (collection/root-collection-with-ui-details collection-namespace)))

(api/defendpoint GET "/root"
  "Return the 'Root' Collection object with standard details added"
  [namespace]
  {namespace (s/maybe su/NonBlankString)}
  (dissoc (root-collection namespace) ::collection.root/is-root?))

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
  [models archived namespace pinned_state]
  {models       (s/maybe models-schema)
   archived     (s/maybe su/BooleanString)
   namespace    (s/maybe su/NonBlankString)
   pinned_state (s/maybe (apply s/enum valid-pinned-state-values))}
  ;; Return collection contents, including Collections that have an effective location of being in the Root
  ;; Collection for the Current User.
  (let [root-collection (assoc collection/root-collection :namespace namespace)
        model-kwds      (if (mi/can-read? root-collection)
                          (set (map keyword (u/one-or-many models)))
                          #{:collection})]
    (collection-children
      root-collection
      {:models         model-kwds
       :archived?      (Boolean/parseBoolean archived)
       :pinned-state   (keyword pinned_state)})))


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
  [:as {{:keys [name color description parent_id namespace]} :body}]
  {name        su/NonBlankString
   color       collection/hex-color-regex
   description (s/maybe su/NonBlankString)
   parent_id   (s/maybe su/IntGreaterThanZero)
   namespace   (s/maybe su/NonBlankString)}
  ;; To create a new collection, you need write perms for the location you are going to be putting it in...
  (write-check-collection-or-root-collection parent_id)
  ;; Now create the new Collection :)
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
  [id, :as {{:keys [name color description archived parent_id], :as collection-updates} :body}]
  {name        (s/maybe su/NonBlankString)
   color       (s/maybe collection/hex-color-regex)
   description (s/maybe su/NonBlankString)
   archived    (s/maybe s/Bool)
   parent_id   (s/maybe su/IntGreaterThanZero)}
  ;; do we have perms to edit this Collection?
  (let [collection-before-update (api/write-check Collection id)]
    ;; if we're trying to *archive* the Collection, make sure we're allowed to do that
    (check-allowed-to-archive-or-unarchive collection-before-update collection-updates)
    ;; ok, go ahead and update it! Only update keys that were specified in the `body`. But not `parent_id` since
    ;; that's not actually a property of Collection, and since we handle moving a Collection separately below.
    (let [updates (u/select-keys-when collection-updates :present [:name :color :description :archived])]
      (when (seq updates)
        (db/update! Collection id updates)))
    ;; if we're trying to *move* the Collection (instead or as well) go ahead and do that
    (move-collection-if-needed! collection-before-update collection-updates)
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
