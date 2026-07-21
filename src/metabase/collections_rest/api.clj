(ns metabase.collections-rest.api
  "`/api/collection` endpoints. By default, these endpoints operate on Collections in the 'default' namespace, which is
  the namespace that has things like Dashboards and Cards. Other namespaces of Collections exist as well, such as the
  `:snippet` namespace, ('Snippet folders' in the UI). These namespaces are independent hierarchies. To use these
  endpoints for other Collections namespaces, you can pass the `?namespace=` parameter (e.g., `?namespace=snippet`)."
  (:require
   [malli.core :as mc]
   [malli.transform :as mtx]
   [malli.util]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.collections.children :as collections.children]
   [metabase.collections.core :as collections]
   [metabase.collections.models.collection :as collection]
   [metabase.collections.models.collection.root :as collection.root]
   [metabase.eid-translation.core :as eid-translation]
   [metabase.events.core :as events]
   [metabase.models.interface :as mi]
   [metabase.notification.core :as notification]
   [metabase.permissions.core :as perms]
   [metabase.premium-features.core :as premium-features]
   [metabase.queries.core :as queries]
   [metabase.request.core :as request]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;; when alias defined for namespaced keywords is run through kondo macro, ns should be regarded as used
(comment collection.root/keep-me)

(declare root-collection)

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/"
  "Fetch a list of all Collections that the current user has read permissions for (`:can_write` is returned as an
  additional property of each Collection so you can tell which of these you have write permissions for.)

  By default, this returns non-archived Collections, but instead you can show archived ones by passing
  `?archived=true`.

  By default, admin users will see all collections. To hide other user's collections pass in
  `?exclude-other-user-collections=true`.

  If personal-only is `true`, then return only personal collections where `personal_owner_id` is not `nil`."
  [_route-params
   {:keys [archived exclude-other-user-collections namespace personal-only]} :- [:map
                                                                                 [:archived                       {:default false} [:maybe ms/BooleanValue]]
                                                                                 [:exclude-other-user-collections {:default false} [:maybe ms/BooleanValue]]
                                                                                 [:namespace                      {:optional true} [:maybe ms/NonBlankString]]
                                                                                 [:personal-only                  {:default false} [:maybe ms/BooleanValue]]]]
  (as->
   (collections.children/select-collections {:archived                       (boolean archived)
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

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/tree"
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
   :- [:map
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
        collections (-> (collections.children/select-collections {:archived                       archived
                                                                  :exclude-other-user-collections exclude-other-user-collections
                                                                  :namespaces                     namespaces
                                                                  :shallow                        shallow
                                                                  :collection-id                  collection-id
                                                                  :include-library?               include-library})
                        (t2/hydrate :can_write))]
    (if shallow
      (collections.children/shallow-tree-from-collection-id collections)
      (let [collection-type-ids (merge (reduce (fn [acc {collection-id :collection_id, card-type :type, :as _card}]
                                                 (update acc (case (keyword card-type)
                                                               :model :dataset
                                                               :metric :metric
                                                               :card) conj collection-id))
                                               {:dataset #{}
                                                :metric  #{}
                                                :card    #{}}
                                               (t2/reducible-query {:select-distinct [:collection_id :type]
                                                                    :from            [:report_card]
                                                                    :where           [:= :archived false]}))
                                       ;; Tables in collections are an EE feature (library)
                                       (when (premium-features/has-feature? :library)
                                         {:table (->> (t2/query {:select-distinct [:collection_id]
                                                                 :from :metabase_table
                                                                 :where [:and
                                                                         [:= :is_published true]
                                                                         [:= :archived_at nil]]})
                                                      (map :collection_id)
                                                      (into #{}))}))
            collections-with-details (map collections.children/prep-collection-for-export collections)]
        (collection/collections->tree collection-type-ids collections-with-details)))))

;;; --------------------------------- Fetching a single Collection & its 'children' ----------------------------------

(mu/defn- collection-detail
  "Add a standard set of details to `collection`, including things like `effective_location`.
  Works for either a normal Collection or the Root Collection."
  [collection :- collection/CollectionWithLocationAndIDOrRoot]
  (-> collection
      collections.children/prep-collection-for-export
      (t2/hydrate :parent_id
                  :effective_location
                  [:effective_ancestors :can_write]
                  :can_write
                  :is_personal
                  :can_restore
                  :can_delete)))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/trash"
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
  (let [all-cards-in-collection (t2/hydrate (t2/select :model/Card {:where [:and
                                                                            [:= :collection_id collection-id]
                                                                            [:= :dashboard_id nil]]
                                                                    :order-by [[:id :desc]]})
                                            :in_dashboards)]
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
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]]
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
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]
   _query-params
   {:keys [card_ids]} :- [:maybe
                          [:map [:card_ids {:optional true}
                                 [:set ms/PositiveInt]]]]]
  (api/read-check :model/Collection id)
  {:moved (move-dashboard-question-candidates id card_ids)})

(api.macros/defendpoint :post "/root/move-dashboard-question-candidates" :- ::MoveDashboardQuestionCandidatesResponse
  "Move candidate cards to the dashboards they appear in (for the root collection)"
  [_route-params
   _query-params
   {:keys [card_ids]} :- [:maybe
                          [:map [:card_ids {:optional true}
                                 [:set ms/PositiveInt]]]]]
  {:moved (move-dashboard-question-candidates nil card_ids)})

;;; -------------------------------------------- GET /api/collection/root --------------------------------------------

(defn- root-collection [collection-namespace]
  (collection-detail (collection/root-collection-with-ui-details collection-namespace)))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/root"
  "Return the 'Root' Collection object with standard details added"
  [_route-params
   {:keys [namespace]} :- [:map
                           [:namespace {:optional true} [:maybe ms/NonBlankString]]]]
  (-> (root-collection namespace)
      (api/read-check)
      (dissoc ::collection.root/is-root?)))

;; TODO (Cam 10/28/25) -- fix this endpoint so it uses kebab-case for query parameters for consistency with the rest
;; of the REST API
;;
;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-query-params-use-kebab-case
                      :metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/root/items"
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

  By default, library collections are excluded from the results; to include them, pass `?include_library=true`.

  Note that this endpoint should return results in a similar shape to `/api/dashboard/:id/items`, so if this is
  changed, that should too."
  [_route-params
   {:keys [models archived namespace pinned_state sort_column sort_direction official_collections_first
           include_can_run_adhoc_query include_library collection_type
           show_dashboard_questions]} :- [:map
                                          [:models                      {:optional true} [:maybe collections.children/Models]]
                                          [:collection_type             {:optional true} collections.children/CollectionType]
                                          [:include_can_run_adhoc_query {:default false} [:maybe ms/BooleanValue]]
                                          [:archived                    {:default false} [:maybe ms/BooleanValue]]
                                          [:namespace                   {:optional true} [:maybe ms/NonBlankString]]
                                          [:include_library             {:default false} [:maybe ms/BooleanValue]]
                                          [:pinned_state                {:optional true} [:maybe (into [:enum] collections.children/valid-pinned-state-values)]]
                                          [:sort_column                 {:optional true} [:maybe (into [:enum] collections.children/valid-sort-columns)]]
                                          [:sort_direction              {:optional true} [:maybe (into [:enum] collections.children/valid-sort-directions)]]
                                          [:official_collections_first  {:optional true} [:maybe ms/MaybeBooleanValue]]
                                          [:show_dashboard_questions    {:optional true} [:maybe ms/MaybeBooleanValue]]]]
  ;; Return collection contents, including Collections that have an effective location of being in the Root
  ;; Collection for the Current User.
  (let [root-collection (assoc collection/root-collection :namespace namespace)
        model-set       (set (map keyword (u/one-or-many models)))
        model-kwds      (collections.children/visible-model-kwds root-collection model-set)]
    (collections.children/collection-children
     root-collection
     {:archived?                   (boolean archived)
      :include-can-run-adhoc-query include_can_run_adhoc_query
      :show-dashboard-questions?   (boolean show_dashboard_questions)
      :collection-type             collection_type
      :include-library?            include_library
      :models                      (if-not (contains? collections.children/namespaces-holding-non-collection-types namespace)
                                     #{:collection}
                                     model-kwds)
      :pinned-state                (keyword pinned_state)
      :sort-info                   {:sort-column                 (or (some-> sort_column collections.children/normalize-sort-choice) :name)
                                    :sort-direction              (or (some-> sort_direction collections.children/normalize-sort-choice) :asc)
                                    ;; default to sorting official collections first, but provide the option not to
                                    :official-collections-first? (or (nil? official_collections_first)
                                                                     (boolean official_collections_first))}})))

;;; ----------------------------------------- Creating/Editing a Collection ------------------------------------------

;; Create-collection business logic lives in `metabase.collections.create` so that non-REST
;; callers (notably the agent API's MCP `create_collection` tool) can use the same entry point
;; without crossing the module-linter's non-rest -> rest barrier. Re-exported through
;; `metabase.collections.core` as `create-collection!`, `apply-defaults-to-collection`,
;; `validate-new-tenant-collection!`, etc.

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/"
  "Create a new Collection."
  [_route-params
   _query-params
   body :- [:map
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
    (doseq [card (t2/select :model/Card :collection_id (u/the-id collection-before-update))]
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
                          (t2/select-one [:model/Collection :location :id :type] :id new-parent-id)
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

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/graph"
  "Fetch a graph of all Collection Permissions."
  [_route-params
   {:keys [namespace]} :- [:map
                           [:namespace {:optional true} [:maybe ms/NonBlankString]]]]
  (api/check-superuser)
  (perms/graph namespace))

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

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :put "/graph"
  "Do a batch update of Collections Permissions by passing in a modified graph. Will overwrite parts of the graph that
  are present in the request, and leave the rest unchanged.

  If the `force` query parameter is `true`, a `revision` number is not required. The provided graph will be persisted
  as-is, and has the potential to clobber other writes that happened since the last read.

  If the `skip_graph` query parameter is `true`, it will only return the current revision, not the entire permissions
  graph."
  [_route-params
   {:keys [skip-graph force]} :- [:map
                                  [:force      {:default false} [:maybe ms/BooleanValue]]
                                  [:skip-graph {:default false} [:maybe ms/BooleanValue]]]
   {:keys [namespace revision groups]} :- [:map
                                           [:namespace {:optional true} [:maybe ms/NonBlankString]]
                                           [:revision  {:optional true} [:maybe ms/Int]]
                                           [:groups    :map]]]
  (api/check-superuser)
  (update-graph! namespace
                 (decode-graph {:revision revision :groups groups})
                 skip-graph
                 force))

;;; ------------------------------------------ Fetching a single Collection -------------------------------------------

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/:id"
  "Fetch a specific Collection with standard details added"
  [{:keys [id]} :- [:map
                    [:id [:or ms/PositiveInt ms/NanoIdString]]]]
  (let [resolved-id (eid-translation/->id-or-404 :collection id)]
    (collection-detail (api/read-check :model/Collection resolved-id))))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :put "/:id"
  "Modify an existing Collection, including archiving or unarchiving it, or moving it."
  [{:keys [id]} :- [:map
                    [:id ms/PositiveInt]]
   _query-params
   {authority-level :authority_level, :as collection-updates} :- [:map
                                                                  [:name             {:optional true} [:maybe ms/NonBlankString]]
                                                                  [:description      {:optional true} [:maybe ms/NonBlankString]]
                                                                  [:archived         {:default false} [:maybe ms/BooleanValue]]
                                                                  [:parent_id        {:optional true} [:maybe ms/PositiveInt]]
                                                                  [:type             {:optional true} [:maybe collections.children/CollectionType]]
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
    (let [updates (u/select-keys-when collection-updates :present [:name :description :authority_level :type])]
      (when (seq updates)
        (t2/update! :model/Collection id updates)))
    ;; if we're trying to move or archive the Collection, go ahead and do that
    (move-or-archive-collection-if-needed! collection-before-update collection-updates)
    (let [updated-collection (t2/select-one :model/Collection :id id)]
      (events/publish-event! :event/collection-update {:object updated-collection :user-id api/*current-user-id*})
      (events/publish-event! :event/collection-touch {:collection-id id :user-id api/*current-user-id*})))
  ;; finally, return the updated object
  (collection-detail (t2/select-one :model/Collection :id id)))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :delete "/:id"
  "Deletes a collection permanently"
  [{:keys [id]} :- [:map
                    [:id ms/PositiveInt]]]
  (api/check-403 api/*is-superuser?*)
  (let [collection (t2/select-one :model/Collection id)
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
      (doseq [child (t2/select :model/Collection
                               :location [:like (str old-children-location "%")]
                               :archived_directly true)]
        (collection/move-collection! child new-children-location))
      ;; Now we can safely delete this collection and anything left under it.
      (t2/delete! :model/Collection :id id))))

;; TODO (Cam 10/28/25) -- fix this endpoint so it uses kebab-case for query parameters for consistency with the rest
;; of the REST API
;;
;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-query-params-use-kebab-case
                      :metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/:id/items"
  "Fetch a specific Collection's items with the following options:

  *  `models` - only include objects of a specific set of `models`. If unspecified, returns objects of all models
  *  `archived` - when `true`, return archived objects *instead* of unarchived ones. Defaults to `false`.
  *  `pinned_state` - when `is_pinned`, return pinned objects only.
                   when `is_not_pinned`, return non pinned objects only.
                   when `all`, return everything. By default returns everything.
  *  `include_can_run_adhoc_query` - when this is true hydrates the `can_run_adhoc_query` flag on card models

  Note that this endpoint should return results in a similar shape to `/api/dashboard/:id/items`, so if this is
  changed, that should too."
  [{:keys [id]} :- [:map
                    [:id [:or ms/PositiveInt ms/NanoIdString]]]
   {:keys [models archived pinned_state sort_column sort_direction official_collections_first
           include_can_run_adhoc_query
           show_dashboard_questions]} :- [:map
                                          [:models                      {:optional true} [:maybe collections.children/Models]]
                                          [:archived                    {:default false} [:maybe ms/BooleanValue]]
                                          [:include_can_run_adhoc_query {:default false} [:maybe ms/BooleanValue]]
                                          [:pinned_state                {:optional true} [:maybe (into [:enum] collections.children/valid-pinned-state-values)]]
                                          [:sort_column                 {:optional true} [:maybe (into [:enum] collections.children/valid-sort-columns)]]
                                          [:sort_direction              {:optional true} [:maybe (into [:enum] collections.children/valid-sort-directions)]]
                                          [:official_collections_first  {:optional true} [:maybe ms/MaybeBooleanValue]]
                                          [:show_dashboard_questions    {:default false} [:maybe ms/BooleanValue]]]]
  (let [resolved-id (eid-translation/->id-or-404 :collection id)
        model-kwds (set (map keyword (u/one-or-many models)))
        collection (api/read-check :model/Collection resolved-id)]
    (u/prog1 (collections.children/collection-children collection
                                                       {:show-dashboard-questions?   show_dashboard_questions
                                                        :models                      model-kwds
                                                        :include-library?             true
                                                        :archived?                   (or archived (:archived collection) (collection/is-trash? collection))
                                                        :pinned-state                (keyword pinned_state)
                                                        :include-can-run-adhoc-query include_can_run_adhoc_query
                                                        :sort-info                   {:sort-column                 (or (some-> sort_column collections.children/normalize-sort-choice) :name)
                                                                                      :sort-direction              (or (some-> sort_direction collections.children/normalize-sort-choice) :asc)
                                                                                      ;; default to sorting official collections first, except for the trash.
                                                                                      :official-collections-first? (if (and (nil? official_collections_first)
                                                                                                                            (not (collection/is-trash? collection)))
                                                                                                                     true
                                                                                                                     (boolean official_collections_first))}})
      (events/publish-event! :event/collection-read {:object collection :user-id api/*current-user-id*}))))
