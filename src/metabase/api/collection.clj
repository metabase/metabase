(ns metabase.api.collection
  "`/api/collection` endpoints. By default, these endpoints operate on Collections in the 'default' namespace, which is
  the one that has things like Dashboards and Cards. Other namespaces of Collections exist as well, such as the
  `:snippet` namespace, (called 'Snippet folders' in the UI). These namespaces are completely independent hierarchies.
  To use these endpoints for other Collections namespaces, you can pass the `?namespace=` parameter (e.g.
  `?namespace=snippet`)."
  (:require [clojure.string :as str]
            [compojure.core :refer [GET POST PUT]]
            [metabase.api
             [card :as card-api]
             [common :as api]]
            [metabase.models
             [card :refer [Card]]
             [collection :as collection :refer [Collection]]
             [dashboard :refer [Dashboard]]
             [interface :as mi]
             [native-query-snippet :refer [NativeQuerySnippet]]
             [permissions :as perms]
             [pulse :as pulse :refer [Pulse]]]
            [metabase.models.collection
             [graph :as collection.graph]
             [root :as collection.root]]
            [metabase.util :as u]
            [metabase.util.schema :as su]
            [schema.core :as s]
            [toucan
             [db :as db]
             [hydrate :refer [hydrate]]]))

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
            :archived archived?
            :namespace namespace
            {:order-by [[:%lower.name :asc]]}) collections
      (filter mi/can-read? collections)
      ;; include Root Collection at beginning or results if archived isn't `true`
      (if archived?
        collections
        (cons (root-collection namespace) collections))
      (hydrate collections :can_write)
      ;; remove the :metabase.models.collection.root/is-root? tag since FE doesn't need it
      (for [collection collections]
        (dissoc collection ::collection.root/is-root?)))))


;;; --------------------------------- Fetching a single Collection & its 'children' ----------------------------------

(def ^:private valid-model-param-values
  "Valid values for the `?model=` param accepted by endpoints in this namespace."
  #{"card" "collection" "dashboard" "pulse" "snippet"})

(def ^:private CollectionChildrenOptions
  {:archived? s/Bool
   ;; when specified, only return results of this type.
   :model     (s/maybe (apply s/enum (map keyword valid-model-param-values)))})

(defmulti ^:private fetch-collection-children
  "Functions for fetching the 'children' of a `collection`, for different types of objects. Possible options are listed
  in the `CollectionChildrenOptions` schema above.

  NOTES:

  *  `collection` will be either a CollectionInstance, or the Root Collection special placeholder object, so do not use
     `u/get-id` on it! Use `:id`, which will return `nil` for the Root Collection, which is exactly what we want."
  {:arglists '([model collection options])}
  (fn [model _ _] (keyword model)))

(defmethod fetch-collection-children :card
  [_ collection {:keys [archived?]}]
  (-> (db/select [Card :id :name :description :collection_position :display]
        ;; use `:id` here so if it's the root collection we get `id = nil` (no ID)
        :collection_id (:id collection)
        :archived      (boolean archived?))
      (hydrate :favorite)))

(defmethod fetch-collection-children :dashboard
  [_ collection {:keys [archived?]}]
  (db/select [Dashboard :id :name :description :collection_position]
    :collection_id (:id collection)
    :archived      (boolean archived?)))

(defmethod fetch-collection-children :pulse
  [_ collection {:keys [archived?]}]
  (db/select [Pulse :id :name :collection_position]
    :collection_id   (:id collection)
    :archived        (boolean archived?)
    ;; exclude Alerts
    :alert_condition nil))

(defmethod fetch-collection-children :snippet
  [_ collection {:keys [archived?]}]
  (db/select [NativeQuerySnippet :id :name]
    :collection_id (:id collection)
    :archived      (boolean archived?)))

(defmethod fetch-collection-children :collection
  [_ collection {:keys [archived? collection-namespace]}]
  (-> (for [child-collection (collection/effective-children collection
                                                            [:= :archived archived?]
                                                            [:= :namespace (u/qualified-name collection-namespace)])]
        (assoc child-collection :model "collection"))
      (hydrate :can_write)))

(defn- model-name->toucan-model [model-name]
  (case (keyword model-name)
    :collection Collection
    :card       Card
    :dashboard  Dashboard
    :pulse      Pulse
    :snippet    NativeQuerySnippet))

(s/defn ^:private collection-children
  "Fetch a sequence of 'child' objects belonging to a Collection, filtered using `options`."
  [{collection-namespace :namespace, :as collection} :- collection/CollectionWithLocationAndIDOrRoot
   {:keys [model collections-only?], :as options}    :- CollectionChildrenOptions]
  (->> (for [model-kw [:collection :card :dashboard :pulse :snippet]
             ;; only fetch models that are specified by the `model` param; or everything if it's `nil`
             :when    (or (not model) (= model model-kw))
             :let     [toucan-model       (model-name->toucan-model model-kw)
                       allowed-namespaces (collection/allowed-namespaces toucan-model)]
             :when    (or (= model-kw :collection)
                          (contains? allowed-namespaces (keyword collection-namespace)))
             item     (fetch-collection-children model-kw collection (assoc options :collection-namespace collection-namespace))]
         (assoc item :model model-kw))
       ;; sorting by name should be fine for now.
       (sort-by (comp str/lower-case :name))))

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

  *  `model` - only include objects of a specific `model`. If unspecified, returns objects of all models
  *  `archived` - when `true`, return archived objects *instead* of unarchived ones. Defaults to `false`."
  [id model archived]
  {model    (s/maybe (apply s/enum valid-model-param-values))
   archived (s/maybe su/BooleanString)}
  (collection-children
    (api/read-check Collection id)
    {:model     (keyword model)
     :archived? (Boolean/parseBoolean archived)}))


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
  [model archived namespace]
  {model     (s/maybe (apply s/enum valid-model-param-values))
   archived  (s/maybe su/BooleanString)
   namespace (s/maybe su/NonBlankString)}
  ;; Return collection contents, including Collections that have an effective location of being in the Root
  ;; Collection for the Current User.
  (let [root-collection (assoc collection/root-collection :namespace namespace)]
    (collection-children
     root-collection
     {:model     (if (mi/can-read? root-collection)
                   (keyword model)
                   :collection)
      :archived? (Boolean/parseBoolean archived)})))


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
                                                                    :collection_id (u/get-id collection-before-update))))]
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
