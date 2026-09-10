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
   [metabase.collections-rest.db :as collections-rest.db]
   [metabase.collections.children :as collections.children]
   [metabase.collections.core :as collections]
   [metabase.collections.models.collection :as collection]
   [metabase.collections.models.collection.root :as collection.root]
   [metabase.documents.core :as documents]
   [metabase.eid-translation.core :as eid-translation]
   [metabase.events.core :as events]
   [metabase.models.interface :as mi]
   [metabase.permissions.core :as perms]
   [metabase.premium-features.core :as premium-features]
   [metabase.queries.core :as queries]
   [metabase.request.core :as request]
   [metabase.util :as u]
   [metabase.util.i18n :as i18n]
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
                                               (collections-rest.db/unarchived-card-collection-types-reducible))
                                       ;; Tables in collections are an EE feature (library)
                                       (when (premium-features/has-feature? :library)
                                         {:table (->> (collections-rest.db/published-table-collection-ids)
                                                      (map :collection_id)
                                                      (into #{}))}))
            collections-with-details (map collections.children/prep-collection-for-export collections)]
        (collection/collections->tree collection-type-ids collections-with-details)))))

;;; --------------------------------- Fetching a single Collection & its 'children' ----------------------------------

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
   options         :- collections.children/CollectionChildrenOptions]
  (let [options (dissoc options :models :search-text)
        models  (set (collections.children/filterable-models collection restrict-models))]
    (assoc (collections.children/collection-filter-metadata collection restrict-models options)
           ;; An empty model set means "nothing to count"; `collection-children` would read it as "no restriction".
           :total_items (if (empty? models)
                          0
                          (request/with-limit-and-offset 0 0
                            (:total (collections.children/collection-children collection (assoc options :models models))))))))

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

  By default, library collections are excluded from the results; to include them, pass `?include-library=true`.

  Pass `?q=` to filter items by name or last editor. Pass `?include-available-models=true` to include the models that
  have at least one visible item in the requested scope.

  Note that this endpoint should return results in a similar shape to `/api/dashboard/:id/items`, so if this is
  changed, that should too."
  [_route-params
   {:keys [models archived namespace pinned-state sort-column sort-direction official-collections-first
           include-library collection-type show-dashboard-questions
           q include-available-models show-exploration-documents]} :- [:map {:closed true}
                                                                       [:models                      {:optional true} [:maybe collections.children/Models]]
                                                                       [:collection-type             {:optional true} collections.children/CollectionType]
                                                                       [:archived                    {:default false} [:maybe ms/BooleanValue]]
                                                                       [:namespace                   {:optional true} [:maybe ms/NonBlankString]]
                                                                       [:include-library             {:default false} [:maybe ms/BooleanValue]]
                                                                       [:pinned-state                {:optional true} [:maybe (into [:enum] collections.children/valid-pinned-state-values)]]
                                                                       [:sort-column                 {:optional true} [:maybe (into [:enum] collections.children/valid-sort-columns)]]
                                                                       [:sort-direction              {:optional true} [:maybe (into [:enum] collections.children/valid-sort-directions)]]
                                                                       [:official-collections-first  {:optional true} [:maybe ms/MaybeBooleanValue]]
                                                                       [:show-dashboard-questions    {:optional true} [:maybe ms/MaybeBooleanValue]]
                                                                       [:q                           {:optional true} [:maybe :string]]
                                                                       [:include-available-models    {:default false} [:maybe ms/BooleanValue]]
                                                                       [:show-exploration-documents  {:optional true} [:maybe ms/MaybeBooleanValue]]]]
  ;; Return collection contents, including Collections that have an effective location of being in the Root
  ;; Collection for the Current User.
  (let [root-collection (assoc collection/root-collection :namespace namespace)
        model-set       (set (map keyword (u/one-or-many models)))
        model-kwds      (collections.children/visible-model-kwds root-collection model-set)
        restrict-models (when (or (not (contains? collections.children/namespaces-holding-non-collection-types namespace))
                                  (not (mi/can-read? root-collection)))
                          #{:collection})
        options         {:archived?                   (boolean archived)
                         :show-dashboard-questions?   (boolean show-dashboard-questions)
                         :show-exploration-documents? (boolean show-exploration-documents)
                         :collection-type             collection-type
                         :include-library?            include-library
                         :models                      (if-not (contains? collections.children/namespaces-holding-non-collection-types namespace)
                                                        #{:collection}
                                                        model-kwds)
                         :pinned-state                (keyword pinned-state)
                         :search-text                 q
                         :sort-info                   {:sort-column                 (or (some-> sort-column collections.children/normalize-sort-choice) :name)
                                                       :sort-direction              (or (some-> sort-direction collections.children/normalize-sort-choice) :asc)
                                                       ;; default to sorting official collections first, but provide the option not to
                                                       :official-collections-first? (or (nil? official-collections-first)
                                                                                        (boolean official-collections-first))}}]
    ;; scope the document content-gate cache over the listing: each document row's hydration
    ;; adjudicates the gate, and the cache keeps that to once per document (see
    ;; `post-process-collection-children :document` in `metabase.collections.children`)
    (documents/with-content-gate-cache
      (cond-> (collections.children/collection-children root-collection options)
        include-available-models
        (merge (collections.children/collection-filter-metadata root-collection restrict-models options))))))

(api.macros/defendpoint :get "/root/items/metadata" :- ::ItemsMetadata
  "Metadata about the Root Collection's items list: the models with at least one visible item plus the item count.
  Unlike `GET /api/collection/root/items`, the result does not depend on search text; pass that endpoint's other
  scope params so the metadata describes the list being shown."
  [_route-params
   {:keys [models archived namespace pinned-state collection-type include-library
           show-dashboard-questions show-exploration-documents]} :- [:map {:closed true}
                                                                     [:models                     {:optional true} [:maybe collections.children/Models]]
                                                                     [:archived                   {:default false} [:maybe ms/BooleanValue]]
                                                                     [:namespace                  {:optional true} [:maybe ms/NonBlankString]]
                                                                     [:pinned-state               {:optional true} [:maybe (into [:enum] collections.children/valid-pinned-state-values)]]
                                                                     [:collection-type            {:optional true} collections.children/CollectionType]
                                                                     [:include-library            {:default false} [:maybe ms/BooleanValue]]
                                                                     [:show-dashboard-questions   {:default false} [:maybe ms/BooleanValue]]
                                                                     [:show-exploration-documents {:default false} [:maybe ms/BooleanValue]]]]
  (let [root-collection (assoc collection/root-collection :namespace namespace)
        model-set       (set (map keyword (u/one-or-many models)))
        restrict-models (collections.children/visible-model-kwds root-collection model-set)]
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

;; Update-collection business logic lives in `metabase.collections.update` so that non-REST
;; callers (the MCP `collection_write` tool) run the identical permission checks and move/archive
;; handling.

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
   collection-updates :- [:map {:closed true}
                          [:name             {:optional true} [:maybe ms/NonBlankString]]
                          [:description      {:optional true} [:maybe ms/NonBlankString]]
                          [:archived         {:default false} [:maybe ms/BooleanValue]]
                          [:parent_id        {:optional true} [:maybe ms/PositiveInt]]
                          [:authority_level  {:optional true} [:maybe collection/AuthorityLevel]]]]
  (collection-detail (collections/update-collection! id collection-updates)))

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
                                            [:models                      {:optional true} [:maybe collections.children/Models]]
                                            [:archived                    {:default false} [:maybe ms/BooleanValue]]
                                            [:pinned-state                {:optional true} [:maybe (into [:enum] collections.children/valid-pinned-state-values)]]
                                            [:sort-column                 {:optional true} [:maybe (into [:enum] collections.children/valid-sort-columns)]]
                                            [:sort-direction              {:optional true} [:maybe (into [:enum] collections.children/valid-sort-directions)]]
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
                     :sort-info                   {:sort-column                 (or (some-> sort-column collections.children/normalize-sort-choice) :name)
                                                   :sort-direction              (or (some-> sort-direction collections.children/normalize-sort-choice) :asc)
                                                   ;; default to sorting official collections first, except for the trash.
                                                   :official-collections-first? (if (and (nil? official-collections-first)
                                                                                         (not (collection/is-trash? collection)))
                                                                                  true
                                                                                  (boolean official-collections-first))}}
        children    (documents/with-content-gate-cache
                      (cond-> (collections.children/collection-children collection options)
                        include-available-models
                        (merge (collections.children/collection-filter-metadata collection nil options))))]
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
                                                                     [:models                     {:optional true} [:maybe collections.children/Models]]
                                                                     [:archived                   {:default false} [:maybe ms/BooleanValue]]
                                                                     [:pinned-state               {:optional true} [:maybe (into [:enum] collections.children/valid-pinned-state-values)]]
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
