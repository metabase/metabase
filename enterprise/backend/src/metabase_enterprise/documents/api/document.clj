(ns metabase-enterprise.documents.api.document
  (:require
   [metabase-enterprise.documents.models.document :as m.document]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.collections.models.collection :as collection]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(defn- validate-cards-for-document
  "Validates that all provided card-ids exist.
   Returns the card records if all are valid, throws exception otherwise."
  [card-ids]
  (when (seq card-ids)
    (let [cards (t2/select :model/Card :id [:in card-ids])]
      ;; Check all cards were found
      (when (not= (count cards) (count card-ids))
        (let [found-ids (set (map :id cards))
              missing-ids (remove found-ids card-ids)]
          (throw (ex-info (tru "The following card IDs do not exist: {0}. Please verify the card IDs are correct and the cards have not been deleted." (vec missing-ids))
                          {:status-code 404
                           :error-type :cards-not-found
                           :missing-card-ids missing-ids}))))
      cards)))

(defn get-document
  "Get document by id checking if the current user has permission to access and if the document exists."
  [id]
  (api/check-404
   (api/read-check
    (t2/select-one :model/Document :id id))))

(api.macros/defendpoint :get "/"
  "Gets existing `Documents`."
  [_route-params
   _query-params]
  (t2/select :model/Document {:where (collection/visible-collection-filter-clause)}))

(def ^:private prose-mirror-content-type "application/json+vnd.prose-mirro")

(api.macros/defendpoint :post "/"
  "Create a new `Document`."
  [_route-params
   _query-params
   {:keys [name document collection_id card_ids]}
   :- [:map
       [:name :string]
       [:document :string]
       [:collection_id {:optional true} [:maybe ms/PositiveInt]]
       [:card_ids {:optional true} [:vector ms/PositiveInt]]]]
  (collection/check-write-perms-for-collection collection_id)
  (get-document (t2/with-transaction [_conn]
                ;; Validate cards first if provided
                  (let [validated-cards (validate-cards-for-document card_ids)]
                    (u/prog1 (t2/insert-returning-pk! :model/Document {:name name
                                                                       :collection_id collection_id
                                                                       :document document
                                                                       :content_type prose-mirror-content-type
                                                                       :creator_id api/*current-user-id*})
                  ;; Update cards with the new document-id if cards were validated
                      (when (seq validated-cards)
                        (t2/update! :model/Card :id [:in (map u/the-id validated-cards)] {:document_id <>})
                        (m.document/sync-document-cards-collection! <> collection_id)))))))

(api.macros/defendpoint :get "/:document-id"
  "Returns an existing Document by ID."
  [{:keys [document-id]} :- [:map [:document-id ms/PositiveInt]]]
  (get-document document-id))

(api.macros/defendpoint :put "/:document-id"
  "Updates an existing `Document`."
  [{:keys [document-id]} :- [:map
                             [:document-id ms/PositiveInt]]
   _query-params
   {:keys [name document collection_id card_ids] :as body} :- [:map
                                                               [:name {:optional true} :string]
                                                               [:document {:optional true} :string]
                                                               [:collection_id {:optional true} [:maybe ms/PositiveInt]]
                                                               [:card_ids {:optional true} [:vector ms/PositiveInt]]]]
  (let [existing-document (api/check-404 (get-document document-id))]
    (when (api/column-will-change? :collection_id existing-document body)
      (m.document/validate-collection-move-permissions (:collection_id existing-document) collection_id))
    (t2/with-transaction [_conn]
       ;; Validate cards first if provided
      (let [validated-cards (validate-cards-for-document card_ids)]
        (when (seq validated-cards)
          (t2/update! :model/Card :id [:in (map u/the-id validated-cards)] {:document_id document-id}))
        (t2/update! :model/Document document-id (cond-> {}
                                                  document (assoc :document document)
                                                  name (assoc :name name)
                                                  (contains? body :collection_id) (assoc :collection_id collection_id)))))
    (get-document document-id)))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/document/` routes."
  (api.macros/ns-handler *ns* +auth))
