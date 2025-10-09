(ns metabase-enterprise.documents.api.document
  "`/api/ee/document/` routes"
  (:require
   [metabase-enterprise.documents.models.document :as m.document]
   [metabase-enterprise.documents.prose-mirror :as prose-mirror]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.collections.models.collection :as collection]
   [metabase.events.core :as events]
   [metabase.models.interface :as mi]
   [metabase.public-sharing.validation :as public-sharing.validation]
   [metabase.queries.core :as card]
   [metabase.query-permissions.core :as query-perms]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(def ^:private CardCreateSchema
  "Schema for creating a new card - simplified version to avoid circular dependencies"
  [:map
   [:name ms/NonBlankString]
   [:dataset_query ms/Map]
   [:entity_id {:optional true} [:maybe ms/NonBlankString]]
   [:parameters {:optional true} [:maybe [:sequential ms/Map]]]
   [:parameter_mappings {:optional true} [:maybe [:sequential ms/Map]]]
   [:description {:optional true} [:maybe ms/NonBlankString]]
   [:display ms/NonBlankString]
   [:visualization_settings ms/Map]
   [:result_metadata {:optional true} [:maybe [:sequential ms/Map]]]
   [:cache_ttl {:optional true} [:maybe ms/PositiveInt]]])

(def ^:private DocumentCreateOptions
  [:map
   [:name m.document/DocumentName]
   [:document :any]
   [:collection_id {:optional true} [:maybe ms/PositiveInt]]
   [:collection_position {:optional true} [:maybe ms/PositiveInt]]
   [:cards {:optional true} [:maybe [:map-of [:int {:max -1}] CardCreateSchema]]]])

(def ^:private DocumentUpdateOptions
  [:map
   [:name {:optional true} m.document/DocumentName]
   [:document {:optional true} :any]
   [:collection_id {:optional true} [:maybe ms/PositiveInt]]
   [:collection_position {:optional true} [:maybe ms/PositiveInt]]
   [:cards {:optional true} [:maybe [:map-of :int CardCreateSchema]]]
   [:archived {:optional true} [:maybe :boolean]]])

(defn- create-card!
  "Checks that the query is runnable by the current user then saves"
  [{query :dataset_query :as card} creator]
  (query-perms/check-run-permissions-for-query query)
  (card/create-card! (assoc card :type :question :dashboard_id nil) creator))

(mu/defn- update-cards-in-ast :- [:map [:document :any]
                                  [:content_type :string]]

  [document :- [:map
                [:document :any]
                [:content_type :string]]
   card-id-map :- [:maybe [:map-of :int ms/PositiveInt]]]
  (cond-> document
    (map? document)
    (prose-mirror/update-ast (fn match-card-to-update [{:keys [type attrs]}]
                               (and (= type prose-mirror/card-embed-type)
                                    (contains? card-id-map (:id attrs))))
                             (fn update-card-id [embed]
                               (update-in embed [:attrs :id] card-id-map)))))

(mu/defn- create-cards-for-document! :- [:map-of ms/NegativeInt ms/PositiveInt]
  "Creates cards for a document from the cards map.
   Returns a mapping from the original negative integer keys to the newly created card IDs.

   Args:
   - cards-to-create: Map of negative-int -> CardCreateSchema data
   - document-id: ID of the document these cards belong to
   - document-collection-id: Collection ID of the document (for inheritance)
   - creator: User creating the cards

   Returns:
   - Map of negative-int -> actual-card-id"
  [cards-to-create :- [:map-of [:int {:max -1}] CardCreateSchema]
   document-id :- ms/PositiveInt
   document-collection-id :- [:or :nil ms/PositiveInt]
   creator :- [:map [:id ms/PositiveInt]]]
  (when (seq cards-to-create)
    (reduce-kv
     (fn [result-map original-key card-data]
       (let [;; Merge document info into card data
             ;; Cards inherit document's collection_id if not explicitly specified
             merged-card-data (-> card-data
                                  (assoc :document_id document-id)
                                  (cond-> (nil? (:collection_id card-data))
                                    (assoc :collection_id document-collection-id)))
             ;; Create the card using the queries core function
             new-card (create-card! merged-card-data creator)]
         (assoc result-map original-key (:id new-card))))
     {}
     cards-to-create)))

(mu/defn- clone-cards-in-document! :- [:map-of ms/PositiveInt ms/PositiveInt]
  "Finds all cards in the document that are not associated with the document and clones the cards.

  Args:
  - document: the document model to clone cards within

  Returns:
  - map of old-card-id -> cloned-card-id"
  [{:keys [id collection_id] :as document}]
  (let [card-ids (prose-mirror/collect-ast document #(when (and (= prose-mirror/card-embed-type (:type %))
                                                                (pos? (-> % :attrs :id)))
                                                       (-> % :attrs :id)))
        to-clone (when (seq card-ids)
                   (t2/select :model/Card {:where [:and [:in :id card-ids]
                                                   [:or [:<> :document_id id]
                                                    [:= :document_id nil]]]}))]
    (reduce (fn [accum card]
              (api/read-check card)
              (assoc accum
                     (:id card)
                     (:id (create-card! (assoc card :document_id id :collection_id collection_id)
                                        @api/*current-user*))))
            {}
            to-clone)))

(defn get-document
  "Get document by id checking if the current user has permission to access and if the document exists."
  [id]
  (u/prog1 (api/check-404
            (api/read-check
             (t2/hydrate (t2/select-one :model/Document :id id) :creator :can_write :can_delete :can_restore)))
    (events/publish-event! :event/document-read
                           {:object-id id
                            :user-id api/*current-user-id*})))

(api.macros/defendpoint :get "/"
  "Gets existing `Documents`."
  [_route-params
   _query-params]
  {:items (t2/hydrate (t2/select :model/Document {:where [:and
                                                          (collection/visible-collection-filter-clause)
                                                          [:= :archived false]]})
                      :creator :can_write)})

(api.macros/defendpoint :post "/"
  "Create a new `Document`."
  [_route-params
   _query-params
   {:keys [name document collection_id collection_position cards]} :- DocumentCreateOptions]
  (collection/check-write-perms-for-collection collection_id)
  (let [document-id (t2/with-transaction [_conn]
                      (when collection_position
                        (api/maybe-reconcile-collection-position! {:collection_id collection_id
                                                                   :collection_position collection_position}))
                      (let [document-id (t2/insert-returning-pk! :model/Document {:name name
                                                                                  :collection_id collection_id
                                                                                  :collection_position collection_position
                                                                                  :document document
                                                                                  :content_type prose-mirror/prose-mirror-content-type
                                                                                  :creator_id api/*current-user-id*})
                            cards-to-update-in-ast (merge (clone-cards-in-document! {:id document-id
                                                                                     :collection_id collection_id
                                                                                     :document document
                                                                                     :content_type prose-mirror/prose-mirror-content-type})
                                                          (when-not (empty? cards)
                                                            (create-cards-for-document! cards document-id collection_id @api/*current-user*)))]
                        (when (seq cards-to-update-in-ast)
                          (t2/update! :model/Document :id document-id
                                      (update-cards-in-ast
                                       {:document document
                                        :content_type prose-mirror/prose-mirror-content-type}
                                       cards-to-update-in-ast)))
                        document-id))
        created-document (get-document document-id)]
    ;; Publish event after successful creation
    (events/publish-event! :event/document-create
                           {:object created-document
                            :user-id api/*current-user-id*})
    created-document))

(api.macros/defendpoint :get "/:document-id"
  "Returns an existing Document by ID."
  [{:keys [document-id]} :- [:map [:document-id ms/PositiveInt]]]
  (api/read-check (get-document document-id)))

(api.macros/defendpoint :put "/:document-id"
  "Updates an existing `Document`."
  [{:keys [document-id]} :- [:map
                             [:document-id ms/PositiveInt]]
   _query-params
   {:keys [name document collection_id collection_position cards] :as body} :- DocumentUpdateOptions]
  (let [existing-document (api/check-404 (get-document document-id))]
    (api/check-403 (mi/can-write? existing-document))
    (when (api/column-will-change? :collection_id existing-document body)
      (m.document/validate-collection-move-permissions (:collection_id existing-document) collection_id))

    ;; Handle archiving logic
    (let [document-updates (dissoc (api/updates-with-archived-directly existing-document body) :cards)]
      (t2/with-transaction [_conn]
        (when collection_position
          (api/maybe-reconcile-collection-position! existing-document {:collection_id (if (contains? body :collection_id)
                                                                                        collection_id
                                                                                        (:collection_id existing-document))
                                                                       :collection_position collection_position}))
        (t2/update! :model/Document document-id
                    (cond-> document-updates
                      document (merge (update-cards-in-ast
                                       {:document document
                                        :content_type (:content_type existing-document)}
                                       (merge
                                        (clone-cards-in-document! (assoc existing-document :document document))
                                        (when-not (empty? cards) (create-cards-for-document! cards document-id collection_id @api/*current-user*)))))
                      name (assoc :name name)
                      (contains? body :collection_id) (assoc :collection_id collection_id))))
      (let [updated-document (get-document document-id)]
        ;; Publish appropriate events
        (if (:archived document-updates)
          (events/publish-event! :event/document-delete
                                 {:object updated-document
                                  :user-id api/*current-user-id*})
          (events/publish-event! :event/document-update
                                 {:object updated-document
                                  :user-id api/*current-user-id*}))
        updated-document))))

(api.macros/defendpoint :delete "/:document-id"
  "Permanently deletes an archived Document."
  [{:keys [document-id]} :- [:map [:document-id ms/PositiveInt]]]
  (let [document (api/check-404 (t2/select-one :model/Document :id document-id))]
    (api/check-403 (mi/can-write? document))
    (when-not (:archived document)
      (let [msg (tru "Document must be archived before it can be deleted.")]
        (throw (ex-info msg {:status-code 400, :errors {:archived msg}}))))
    (t2/delete! :model/Document :id document-id)
    (events/publish-event! :event/document-delete
                           {:object document
                            :user-id api/*current-user-id*})
    api/generic-204-no-content))

;;; ----------------------------------------------- Sharing is Caring ------------------------------------------------

(api.macros/defendpoint :post "/:document-id/public_link"
  "Generate publicly-accessible links for this Document. Returns UUID to be used in public links. (If this
  Document has already been shared, it will return the existing public link rather than creating a new one.) Public
  sharing must be enabled."
  [{:keys [document-id]} :- [:map
                              [:document-id ms/PositiveInt]]]
  (api/check-superuser)
  (public-sharing.validation/check-public-sharing-enabled)
  (api/check-404 (t2/select-one :model/Document :id document-id))
  (api/check-not-archived (api/read-check :model/Document document-id))
  {:uuid (or (t2/select-one-fn :public_uuid :model/Document :id document-id)
             (u/prog1 (str (random-uuid))
               (t2/update! :model/Document document-id
                           {:public_uuid       <>
                            :made_public_by_id api/*current-user-id*})))})

(api.macros/defendpoint :delete "/:document-id/public_link"
  "Delete the publicly-accessible link to this Document."
  [{:keys [document-id]} :- [:map
                              [:document-id ms/PositiveInt]]]
  (api/check-superuser)
  (public-sharing.validation/check-public-sharing-enabled)
  (api/check-exists? :model/Document :id document-id, :public_uuid [:not= nil], :archived false)
  (t2/update! :model/Document document-id
              {:public_uuid       nil
               :made_public_by_id nil})
  api/generic-204-no-content)

(api.macros/defendpoint :get "/public"
  "Fetch a list of Documents with public UUIDs. These documents are publicly-accessible *if* public sharing is
  enabled."
  []
  (api/check-superuser)
  (public-sharing.validation/check-public-sharing-enabled)
  (t2/select [:model/Document :name :id :public_uuid], :public_uuid [:not= nil], :archived false))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/document/` routes."
  (api.macros/ns-handler *ns* +auth))
