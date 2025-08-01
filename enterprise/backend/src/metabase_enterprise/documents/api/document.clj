(ns metabase-enterprise.documents.api.document
  (:require
   [clojure.set :as set]
   [metabase-enterprise.documents.models.document :as m.document]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.collections.models.collection :as collection]
   [metabase.models.interface :as mi]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(defn- document-query [where-clause]
  {:select [:document.id
            :name
            :document
            :content_type
            :collection_id
            [:version_identifier :version]
            [:document.created_at :created_at]
            [:document.updated_at :updated_at]]
   :from [[(t2/table-name :model/Document) :document]]
   :join [[(t2/table-name :model/DocumentVersion) :ver] [:= :document.id :ver.document_id]]
   :order-by [[:document.id :asc]]
   :where where-clause})

(defn- validate-cards-for-document
  "Validates that all provided card-ids exist and have type :in_document.
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
      ;; Check all cards have type :in_document
      (let [invalid-cards (remove #(= :in_document (keyword (:type %))) cards)]
        (when (seq invalid-cards)
          (throw (ex-info (tru "The following cards cannot be used in documents because they have the wrong type: {0}. Only cards with type ''in_document'' can be associated with documents. Please change the card type to ''in_document'' or use different cards."
                               (mapv #(str "card " (:id %) " (type: " (:type %) ")") invalid-cards))
                          {:status-code 400
                           :error-type :invalid-card-type
                           :invalid-cards (mapv #(select-keys % [:id :type]) invalid-cards)}))))
      cards)))

(defn get-document [id version]
  (api/check-404
   (api/read-check
    (t2/select-one :model/Document
                   (document-query [:and
                                    [:= :document.id id]
                                    (if (some? version)
                                      [:= :version_identifier version]
                                      [:= :document.current_version_id :ver.id])])))))

(api.macros/defendpoint :get "/"
  "Gets existing `Documents`."
  [_route-params
   _query-params]
  (t2/query (document-query (collection/visible-collection-filter-clause))))

(api.macros/defendpoint :post "/"
  "Create a new `Document`."
  [_route-params
   _query-params
   {:keys [name document version created_at updated_at collection_id card_ids]}
   :- [:map
       [:name :string]
       [:document :string]
       [:collection_id {:optional true} [:maybe ms/PositiveInt]]
       [:card_ids {:optional true} [:vector ms/PositiveInt]]]]
  (api/check-superuser)
  (collection/check-write-perms-for-collection collection_id)
  (get-document (t2/with-transaction [_conn]
                ;; Validate cards first if provided
                  (let [validated-cards (validate-cards-for-document card_ids)
                        document-id (t2/insert-returning-pk! :model/Document {:name name
                                                                              :collection_id collection_id})
                        document-version-id (t2/insert-returning-pk! :model/DocumentVersion
                                                                     {:document_id document-id
                                                                      :document document
                                                                      :content_type "text/markdown"
                                                                      :version_identifier 1
                                                                      :user_id api/*current-user-id*})
                        _ (t2/select-one :model/Document :id document-id)
                        _ (t2/select-one :model/DocumentVersion :document_id document-id)
                        _ (t2/update! :model/Document document-id {:current_version_id document-version-id})]
                  ;; Update cards with the new document-id if cards were validated
                    (when (seq validated-cards)
                      (t2/update! :model/Card :id [:in (map u/the-id validated-cards)] {:document_id document-id})
                      (m.document/sync-document-cards-collection! document-id collection_id))
                    document-id)) nil))

(api.macros/defendpoint :get "/:document-id"
  "Returns an existing Document by ID."
  [{:keys [document-id]} :- [:map [:document-id ms/PositiveInt]]
   {:keys [version]} :- [:map [:version {:optional true} ms/PositiveInt]]]
  (get-document document-id version))

(api.macros/defendpoint :put "/:document-id"
  "Updates an existing `Document`."
  [{:keys [document-id]} :- [:map
                             [:document-id ms/PositiveInt]]
   {:keys [version]}
   body :- [:map
            [:name {:optional true} :string]
            [:document {:optional true} :string]
            [:collection_id {:optional true} [:maybe ms/PositiveInt]]
            [:card_ids {:optional true} [:vector ms/PositiveInt]]]]
  (api/check-superuser)
  (let [existing-document (api/check-404 (get-document document-id nil))]
    (when (api/column-will-change? :collection_id existing-document body)
      (m.document/validate-collection-move-permissions (:collection_id existing-document) (:collection_id body)))
    (get-document
     (t2/with-transaction [_conn]
       ;; Validate cards first if provided
       (let [validated-cards (when (:card_ids body)
                               (validate-cards-for-document (:card_ids body)))
             new-document-version-id (when (:document body)
                                       (t2/insert-returning-pk! :model/DocumentVersion
                                                                {:document_id document-id
                                                                 :document (:document body)
                                                                 :content_type "text/markdown"
                                                                 :version_identifier (inc (:version existing-document))
                                                                 :user_id api/*current-user-id*}))]        ;; Update cards with the document-id if cards were validated
         (when (seq validated-cards)
           (t2/update! :model/Card :id [:in (map u/the-id validated-cards)] {:document_id document-id}))
         (t2/update! :model/Document document-id {:name (if (contains? body :name)
                                                          (:name body)
                                                          :name)
                                                  :collection_id (if (contains? body :collection_id)
                                                                   (:collection_id body)
                                                                   :collection_id)
                                                  :current_version_id (or new-document-version-id
                                                                          :current_version_id)
                                                  :updated_at (mi/now)})
         document-id)) nil)))

(api.macros/defendpoint :get "/:document-id/versions"
  "Returns the versions of a given document."
  [{:keys [document-id]} :- [:map
                             [:document-id ms/PositiveInt]]]
  (api/check-404 (t2/exists? :model/Document :id document-id))
  (map #(-> %
            (select-keys [:id :document :content_type :version_identifier :user_id :created_at :parent_version_id])
            (set/rename-keys {:version_identifier :version
                              :user_id :creator}))
       (t2/select :model/DocumentVersion :document_id document-id)))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/document/` routes."
  (api.macros/ns-handler *ns* +auth))
