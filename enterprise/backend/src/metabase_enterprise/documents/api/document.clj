(ns metabase-enterprise.documents.api.document
  (:require
   [metabase-enterprise.documents.models.document :as m.document]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.collections.models.collection :as collection]
   [metabase.models.interface :as mi]
   [metabase.queries.models.card :as card]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(def ^:private CardCreateSchema
  "Schema for creating a new card - simplified version to avoid circular dependencies"
  [:map
   [:name ms/NonBlankString]
   [:type {:optional true} [:maybe [:= "question"]]]
   [:dataset_query ms/Map]
   [:entity_id {:optional true} [:maybe ms/NonBlankString]]
   [:parameters {:optional true} [:maybe [:sequential ms/Map]]]
   [:parameter_mappings {:optional true} [:maybe [:sequential ms/Map]]]
   [:description {:optional true} [:maybe ms/NonBlankString]]
   [:display ms/NonBlankString]
   [:visualization_settings ms/Map]
   [:result_metadata {:optional true} [:maybe [:sequential ms/Map]]]
   [:cache_ttl {:optional true} [:maybe ms/PositiveInt]]])

(mu/defn- create-cards-for-document! :- [:map-of [:int {:max -1}] ms/PositiveInt]
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
             new-card (card/create-card! merged-card-data creator)]
         (assoc result-map original-key (:id new-card))))
     {}
     cards-to-create)))

(defn get-document
  "Get document by id checking if the current user has permission to access and if the document exists."
  [id]
  (api/check-404
   (api/read-check
    (t2/hydrate (t2/select-one :model/Document :id id) :creator))))

(api.macros/defendpoint :get "/"
  "Gets existing `Documents`."
  [_route-params
   _query-params]
  (t2/hydrate (t2/select :model/Document {:where (collection/visible-collection-filter-clause)}) :creator))

(def ^:private prose-mirror-content-type "application/json+vnd.prose-mirro")

(api.macros/defendpoint :post "/"
  "Create a new `Document`."
  [_route-params
   _query-params
   {:keys [name document collection_id cards]}
   :- [:map
       [:name :string]
       [:document :string]
       [:collection_id {:optional true} [:maybe ms/PositiveInt]]
       [:cards {:optional true} [:maybe [:map-of [:int {:max -1}] CardCreateSchema]]]]]
  (collection/check-write-perms-for-collection collection_id)
  (let [result (t2/with-transaction [_conn]
                 ;; Validate existing cards first if provided
                 (let [document-id (t2/insert-returning-pk! :model/Document {:name name
                                                                             :collection_id collection_id
                                                                             :document document
                                                                             :content_type prose-mirror-content-type
                                                                             :creator_id api/*current-user-id*})
                       ;; Create new cards if provided
                       _created-cards-mapping (when-not (empty? cards) (create-cards-for-document! cards document-id collection_id @api/*current-user*))]
                   ;; Return document ID only
                   {:document_id document-id}))]
    ;; Return the document without created cards mapping
    (get-document (:document_id result))))

(api.macros/defendpoint :get "/:document-id"
  "Returns an existing Document by ID."
  [{:keys [document-id]} :- [:map [:document-id ms/PositiveInt]]]
  (get-document document-id))

(api.macros/defendpoint :put "/:document-id"
  "Updates an existing `Document`."
  [{:keys [document-id]} :- [:map
                             [:document-id ms/PositiveInt]]
   _query-params
   {:keys [name document collection_id cards] :as body} :- [:map
                                                            [:name {:optional true} :string]
                                                            [:document {:optional true} :string]
                                                            [:collection_id {:optional true} [:maybe ms/PositiveInt]]
                                                            [:cards {:optional true} [:maybe [:map-of :int CardCreateSchema]]]]]
  (let [existing-document (api/check-404 (get-document document-id))]
    (api/check-403 (mi/can-write? existing-document))
    (when (api/column-will-change? :collection_id existing-document body)
      (m.document/validate-collection-move-permissions (:collection_id existing-document) collection_id))
    (t2/with-transaction [_conn]
      (let [;; Create new cards if provided
            _created-cards-mapping (when-not (empty? cards) (create-cards-for-document! cards document-id collection_id @api/*current-user*))]
        ;; Update the document itself
        (t2/update! :model/Document document-id (cond-> {}
                                                  document (assoc :document document)
                                                  name (assoc :name name)
                                                  (contains? body :collection_id) (assoc :collection_id collection_id)))))
    ;; Return the document without created cards mapping
    (get-document document-id)))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/document/` routes."
  (api.macros/ns-handler *ns* +auth))
