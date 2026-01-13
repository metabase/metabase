(ns metabase.documents.api.document
  "`/api/document/` routes"
  (:require
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.collections.core :as collections]
   [metabase.collections.models.collection :as collection]
   [metabase.documents.models.document :as m.document]
   [metabase.documents.prose-mirror :as prose-mirror]
   [metabase.events.core :as events]
   [metabase.public-sharing.validation :as public-sharing.validation]
   [metabase.queries.core :as card]
   [metabase.query-permissions.core :as query-perms]
   [metabase.query-processor.api :as api.dataset]
   [metabase.query-processor.card :as qp.card]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.json :as json]
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
             (t2/hydrate (t2/select-one :model/Document :id id) :creator :can_write :can_delete :can_restore :is_remote_synced)))
    (events/publish-event! :event/document-read
                           {:object-id id
                            :user-id api/*current-user-id*})))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/"
  "Gets existing `Documents`."
  [_route-params
   _query-params]
  {:items (t2/hydrate (t2/select :model/Document {:where [:and
                                                          (collection/visible-collection-filter-clause)
                                                          [:= :archived false]]})
                      :creator :can_write :is_remote_synced)})

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/"
  "Create a new `Document`."
  [_route-params
   _query-params
   {:keys [name document collection_id collection_position cards]} :- DocumentCreateOptions]
  (api/create-check :model/Document {:collection_id collection_id})
  (let [created-document (t2/with-transaction [_conn]
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
                             (u/prog1 (get-document document-id)
                               (when (collections/remote-synced-collection? (:collection_id <>))
                                 (collections/check-non-remote-synced-dependencies <>)))))]
    ;; Publish event after successful creation
    (events/publish-event! :event/document-create
                           {:object created-document
                            :user-id api/*current-user-id*})
    created-document))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/:document-id"
  "Returns an existing Document by ID."
  [{:keys [document-id]} :- [:map [:document-id ms/PositiveInt]]]
  (api/read-check (get-document document-id)))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :put "/:document-id"
  "Updates an existing `Document`."
  [{:keys [document-id]} :- [:map
                             [:document-id ms/PositiveInt]]
   _query-params
   {:keys [name document collection_id collection_position cards] :as body} :- DocumentUpdateOptions]
  (let [existing-document (api/check-404 (get-document document-id))]
    (when-not (contains? body :archived)
      (api/check-not-archived existing-document))
    (api/write-check existing-document)
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
                      (contains? body :collection_id) (assoc :collection_id collection_id)))
        (collections/check-for-remote-sync-update existing-document))
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

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :delete "/:document-id"
  "Permanently deletes an archived Document."
  [{:keys [document-id]} :- [:map [:document-id ms/PositiveInt]]]
  (let [document (api/check-404 (t2/select-one :model/Document :id document-id))]
    (api/write-check document)
    (when-not (:archived document)
      (let [msg (tru "Document must be archived before it can be deleted.")]
        (throw (ex-info msg {:status-code 400, :errors {:archived msg}}))))
    (t2/delete! :model/Document :id document-id)
    (events/publish-event! :event/document-delete
                           {:object document
                            :user-id api/*current-user-id*})
    api/generic-204-no-content))

;;; ---------------------------------------------------- Copy --------------------------------------------------------

(mu/defn- copy-cards-for-document! :- [:map-of ms/PositiveInt ms/PositiveInt]
  "Copies all cards that belong to the source document to the new document.

  Args:
  - source-document-id: ID of the document being copied
  - new-document-id: ID of the newly created document
  - new-collection-id: Collection ID for the new cards

  Returns:
  - Map of old-card-id -> new-card-id"
  [source-document-id :- ms/PositiveInt
   new-document-id :- ms/PositiveInt
   new-collection-id :- [:or :nil ms/PositiveInt]]
  (let [cards-to-copy (t2/select :model/Card :document_id source-document-id)]
    (reduce (fn [accum card]
              (let [new-card (create-card! (-> card
                                               (dissoc :id :entity_id :created_at :updated_at :creator_id
                                                       :public_uuid :made_public_by_id :cache_invalidated_at)
                                               (assoc :document_id new-document-id
                                                      :collection_id new-collection-id))
                                           @api/*current-user*)]
                (when (or (:archived card) (:archived_directly card))
                  (t2/update! :model/Card (:id new-card)
                              {:archived          (boolean (:archived card))
                               :archived_directly (boolean (:archived_directly card))}))
                (assoc accum (:id card) (:id new-card))))
            {}
            cards-to-copy)))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/:from-document-id/copy"
  "Copy a Document."
  [{:keys [from-document-id]} :- [:map
                                  [:from-document-id ms/PositiveInt]]
   _query-params
   {:keys [name collection_id collection_position]} :- [:map
                                                        [:name                {:optional true} [:maybe ms/NonBlankString]]
                                                        [:collection_id       {:optional true} [:maybe ms/PositiveInt]]
                                                        [:collection_position {:optional true} [:maybe ms/PositiveInt]]]]
  (api/create-check :model/Document {:collection_id collection_id})
  (let [existing-document (api/check-404
                           (api/read-check
                            (t2/select-one :model/Document :id from-document-id :archived false)))
        document-data {:name                (or name (:name existing-document))
                       :document            (:document existing-document)
                       :content_type        (:content_type existing-document)
                       :creator_id          api/*current-user-id*
                       :collection_id       collection_id
                       :collection_position collection_position}
        new-document (t2/with-transaction [_conn]
                       (when collection_position
                         (api/maybe-reconcile-collection-position! document-data))
                       (let [new-document-id (t2/insert-returning-pk! :model/Document document-data)
                             card-id-map (copy-cards-for-document! from-document-id new-document-id collection_id)]
                         (when (seq card-id-map)
                           (t2/update! :model/Document :id new-document-id
                                       (update-cards-in-ast
                                        {:document (:document existing-document)
                                         :content_type (:content_type existing-document)}
                                        card-id-map)))
                         (u/prog1 (get-document new-document-id)
                           (when (collections/remote-synced-collection? collection_id)
                             (collections/check-non-remote-synced-dependencies <>)))))]
    (events/publish-event! :event/document-create
                           {:object new-document
                            :user-id api/*current-user-id*})
    new-document))

;;; ----------------------------------------------- Sharing is Caring ------------------------------------------------

(api.macros/defendpoint :post "/:document-id/public-link" :- [:map [:uuid ms/UUIDString]]
  "Generate a publicly-accessible UUID for a Document.

  Creates a public link that allows viewing the Document without authentication. If the Document already has
  a public UUID, returns the existing one rather than generating a new one. This enables sharing the Document
  via `GET /api/ee/public/document/:uuid`.

  Returns a map containing `:uuid` (the public UUID string).

  Requires superuser permissions. Public sharing must be enabled via the `enable-public-sharing` setting."
  [{:keys [document-id]} :- [:map
                             [:document-id ms/PositiveInt]]]
  (api/check-superuser)
  (public-sharing.validation/check-public-sharing-enabled)
  (api/check-exists? :model/Document :id document-id, :archived false)
  ;; Use a transaction to prevent race conditions when two requests arrive simultaneously.
  ;; Only one request will successfully create the UUID; both will return the same value.
  (t2/with-transaction [_conn]
    (if-let [existing-uuid (t2/select-one-fn :public_uuid :model/Document :id document-id)]
      {:uuid existing-uuid}
      (do
        (t2/update! :model/Document document-id
                    {:public_uuid       (str (random-uuid))
                     :made_public_by_id api/*current-user-id*})
        ;; Always select after update to ensure we return what's actually stored
        {:uuid (t2/select-one-fn :public_uuid :model/Document :id document-id)}))))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :delete "/:document-id/public-link"
  "Remove the public link for a Document.

  Deletes the public UUID from the Document, making it no longer accessible via the public sharing endpoint.
  This revokes public access to the Document - the existing public link will no longer work.

  Returns a 204 No Content response on success.

  Requires superuser permissions. Public sharing must be enabled via the `enable-public-sharing` setting.
  Throws a 404 if the Document doesn't exist, is archived, or doesn't have a public link."
  [{:keys [document-id]} :- [:map
                             [:document-id ms/PositiveInt]]]
  (api/check-superuser)
  (public-sharing.validation/check-public-sharing-enabled)
  (api/check-exists? :model/Document :id document-id, :public_uuid [:not= nil], :archived false)
  (t2/update! :model/Document document-id
              {:public_uuid       nil
               :made_public_by_id nil})
  api/generic-204-no-content)

(api.macros/defendpoint :get "/public" :- [:sequential [:map
                                                        [:name :string]
                                                        [:id ms/PositiveInt]
                                                        [:public_uuid ms/UUIDString]]]
  "List all Documents that have public links.

  Returns a sequence of Documents that have been publicly shared. Each Document includes its `:id`, `:name`,
  and `:public_uuid`. Documents are only actually accessible via the public endpoint if public sharing is
  currently enabled. Archived Documents are excluded from the results.

  This endpoint is used to populate the public links listing in the Admin settings UI.

  Requires superuser permissions. Public sharing must be enabled via the `enable-public-sharing` setting."
  []
  (api/check-superuser)
  (public-sharing.validation/check-public-sharing-enabled)
  (t2/select [:model/Document :name :id :public_uuid], :public_uuid [:not= nil], :archived false))

;;; ------------------------------------------------ Card Downloads --------------------------------------------------

(defn- validate-card-in-document
  "Validates that the document and card exist, are not archived, and that the card belongs to the document.
   Also checks that the current user has read access to the document.

   Throws a 404 exception via `api/check-404` if any validation fails. Returns card-id on success."
  [document-id card-id]
  (let [document (api/check-404 (t2/select-one :model/Document :id document-id :archived false))]
    (api/read-check document)
    (api/check-404 (t2/exists? :model/Card :id card-id :document_id document-id :archived false))))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/:document-id/card/:card-id/query/:export-format"
  "Download query results for a Card embedded in a Document.

  Returns query results in the requested format. The user must have read access to the document
  to download results. If the card's query fails, standard query error responses are returned.

  Route parameters:
  - document-id: ID of the document containing the card
  - card-id: ID of the card to download results from
  - export-format: Output format (csv, xlsx, json)

  Body parameters (snake_case):
  - parameters: Optional query parameters (array of maps or JSON string)
  - format_rows: Whether to apply formatting to results (boolean, default false)
  - pivot_results: Whether to pivot results (boolean, default false)"
  [{:keys [document-id card-id export-format]} :- [:map
                                                   [:document-id   ms/PositiveInt]
                                                   [:card-id       ms/PositiveInt]
                                                   [:export-format :keyword]]
   _query-params
   {:keys          [parameters]
    pivot-results? :pivot_results
    format-rows?   :format_rows
    :as            _body}
   :- [:map
       [:parameters    {:optional true} [:maybe [:or
                                                 [:sequential ms/Map]
                                                 ms/JSONString]]]
       [:format_rows   {:default false} ms/BooleanValue]
       [:pivot_results {:default false} ms/BooleanValue]]]
  (validate-card-in-document document-id card-id)
  (qp.card/process-query-for-card
   card-id export-format
   :parameters  (cond-> parameters
                  (string? parameters) json/decode+kw)
   :constraints nil
   :context     (api.dataset/export-format->context export-format)
   :middleware  {:process-viz-settings?  true
                 :skip-results-metadata? true
                 :ignore-cached-results? true
                 :format-rows?           format-rows?
                 :pivot?                 pivot-results?
                 :js-int-to-string?      false}))

(def ^{:arglists '([request respond raise])} routes
  "`/api/document/` routes."
  (api.macros/ns-handler *ns* +auth))
