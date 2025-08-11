(ns metabase-enterprise.documents.models.document
  (:require
   [metabase-enterprise.documents.prose-mirror :as prose-mirror]
   [metabase.api.common :as api]
   [metabase.collections.models.collection :as collection]
   [metabase.models.interface :as mi]
   [metabase.models.serialization :as serdes]
   [metabase.search.spec :as search.spec]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/Document [_model] :document)

(t2/deftransforms :model/Document
  {:document mi/transform-json})

(doto :model/Document
  (derive :metabase/model)
  (derive :perms/use-parent-collection-perms)
  (derive :hook/timestamped?)
  (derive :hook/entity-id))

(defn validate-collection-move-permissions
  "Validates that the current user has write permissions for both old and new collections
   when moving a document. Uses the same permission pattern as check-allowed-to-change-collection.
   Throws 403 exception if permissions are insufficient."
  [old-collection-id new-collection-id]
  (when old-collection-id
    (collection/check-write-perms-for-collection old-collection-id))
  (when new-collection-id
    (collection/check-write-perms-for-collection new-collection-id))
  (when new-collection-id
    (api/check-400 (t2/exists? :model/Collection :id new-collection-id :archived false))))

(methodical/defmethod t2/batched-hydrate [:model/Document :creator]
  "Hydrate the creator (user) of a document based on the creator_id."
  [_model k documents]
  (mi/instances-with-hydrated-data
   documents k
   #(-> (t2/select [:model/User :id :email :first_name :last_name] :id (keep :creator_id documents))
        (map (juxt :id identity))
        (into {}))
   :creator_id {:default {}}))

(defn sync-document-cards-collection!
  "Updates all cards associated with a document to match the document's collection.
  If the document is archived, also archives all associated cards. "
  [document-id collection-id & {:keys [archived archived-directly]}]
  (let [update-map {:collection_id collection-id
                    :archived (boolean archived)
                    :archived_directly (boolean archived-directly)}]
    (t2/update! :model/Card
                :document_id document-id
                update-map)))

(t2/define-after-update :model/Document
  [{:keys [id collection_id archived archived_directly]}]
  (sync-document-cards-collection! id collection_id
                                   :archived archived
                                   :archived-directly archived_directly))

;;; ------------------------------------------------ Serdes Hashing -------------------------------------------------

(defmethod serdes/hash-fields :model/Document
  [_table]
  [:name (serdes/hydrated-hash :collection) :created-at])

(defmethod serdes/make-spec "Document"
  [_model-name _opts]
  {:copy [:archived :archived_directly :collection_position :description :entity_id :name :view_count]
   :skip [;; instance-specific stats
          :last_viewed_at
               ;; skip until we implement serdes for documents
          :document_id]
   :transform {:created_at (serdes/date)
               :updated_at (serdes/date)
               :collection_id (serdes/fk :model/Collection)
               :creator_id (serdes/fk :model/User)
               :document :skip}})

;;; ----------------------------------------------- Search ----------------------------------------------------------

(search.spec/define-spec "document"
  {:model :model/Document
   :attrs {:archived true
           :collection-id :collection_id
           :creator-id :creator_id
           :view-count :view_count
           :created-at :created_at
           :updated-at :updated_at
           :last-viewed-at :last_viewed_at
           :pinned [:> [:coalesce :collection_position [:inline 0]] [:inline 0]]}
   :search-terms [:name]
   :render-terms {:document-name :name
                  :document-id :id
                  :collection-position true}})

;;; ----------------------------------------------- Serdes Hashing -------------------------------------------------

(defmethod serdes/hash-fields :model/Document
  [_table]
  [:name (serdes/hydrated-hash :collection) :created-at])

;;; ---------------------------------------------- Serialization --------------------------------------------------

(def ^:private ast-model->db-model
  {"card"      :model/Card
   "dataset"   :model/Card
   "table"     :model/Table
   "dashboard" :model/Dashboard})

(def ^:private model->serdes-model
  {"card"      "Card"
   "dataset"   "Card"
   "dashboard" "Dashboard"
   "table"     "Table"})

(defn- id->entity-id
  [{{:keys [model] :or {model "card"} :as attrs} :attrs type :type :as node}]
  (let [id-key (if (= prose-mirror/smart-link-type type) :entityId :id)
        id (id-key attrs)]
    (if-let [db-model (t2/select-one (ast-model->db-model model) :id id)]
      (assoc-in node [:attrs id-key] (mapv #(dissoc % :label) (serdes/generate-path (model->serdes-model model) db-model)))
      (u/prog1 node
        (log/warnf "entity_id not found for %s at id: %s" model id)))))

(defn- entity-id->id
  [{:keys [attrs type] :as node}]
  (let [id-key (if (= prose-mirror/smart-link-type type) :entityId :id)
        id (:id (serdes/load-find-local (id-key attrs)))]
    (if id
      (assoc-in node [:attrs id-key] id)
      (u/prog1 node
        (log/warn "Model not found at path" (id-key attrs))))))

(defn- export-document-content
  "Transform cardEmbed/smartLink nodes to use entity IDs instead of database IDs"
  [document serdes-key _]
  (serdes-key
   (if (= (:content_type document) prose-mirror/prose-mirror-content-type)
     (prose-mirror/update-ast
      document
      #(contains? #{prose-mirror/smart-link-type prose-mirror/card-embed-type} (:type %))
      id->entity-id)
     document)))

(defn- import-document-content
  "Transform cardEmbed/smartLink nodes to use database IDs instead of entity IDs"
  [document serdes-key _]
  (serdes-key
   (if (= (:content_type document) prose-mirror/prose-mirror-content-type)
     (prose-mirror/update-ast
      document
      #(contains? #{prose-mirror/smart-link-type prose-mirror/card-embed-type} (:type %))
      entity-id->id)
     document)))

(defmethod serdes/make-spec "Document"
  [_model-name _opts]
  {:copy [:archived :archived_directly :content_type :entity_id :name :collection_position]
   :skip [:view_count :last_viewed_at]
   :transform {:created_at (serdes/date)
               :updated_at (serdes/date)
               :document {:export-with-context export-document-content
                          :import-with-context import-document-content}
               :collection_id (serdes/fk :model/Collection)
               :creator_id (serdes/fk :model/User)}})

(defn- document-deps
  [{:keys [content_type] :as document}]
  (when (= content_type prose-mirror/prose-mirror-content-type)
    (set (prose-mirror/collect-ast document (fn document-deps [{:keys [type attrs]}]
                                              (cond
                                                (and (= prose-mirror/smart-link-type type)
                                                     (contains? model->serdes-model (:model attrs)))
                                                (:entityId attrs)

                                                (= prose-mirror/card-embed-type type)
                                                (:id attrs)

                                                :else
                                                nil))))))

(defmethod serdes/dependencies "Document"
  [{:keys [collection_id] :as document}]
  (set (concat
        (document-deps document)
        (when collection_id #{[{:model "Collection" :id collection_id}]}))))

(defmethod serdes/descendants "Document"
  [_model-name id]
  (when-let [document (t2/select-one :model/Document :id id)]
    (when (= prose-mirror/prose-mirror-content-type (:content_type document))
      (merge
       (into {}
             (for [embedded-card-id (prose-mirror/card-ids document)]
               {["Card" embedded-card-id] {"Document" id}}))
       (into {}
             (for [{model :model link-id :id} (prose-mirror/collect-ast document
                                                                        #(when (= prose-mirror/smart-link-type (:type %))
                                                                           (:attrs %)))
                   :when (contains? model->serdes-model model)]
               {[(model->serdes-model model) link-id] {"Document" id}}))))))
