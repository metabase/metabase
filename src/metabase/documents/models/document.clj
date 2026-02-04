(ns metabase.documents.models.document
  (:require
   [clojure.string :as str]
   [metabase.api.common :as api]
   [metabase.collections.models.collection :as collection]
   [metabase.documents.prose-mirror :as prose-mirror]
   [metabase.events.core :as events]
   [metabase.models.interface :as mi]
   [metabase.models.serialization :as serdes]
   [metabase.public-sharing.core :as public-sharing]
   [metabase.search.spec :as search.spec]
   [metabase.util :as u]
   [metabase.util.i18n :refer [deferred-tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/Document [_model] :document)

(methodical/defmethod t2/model-for-automagic-hydration [#_model :default #_k :document]
  [_original-model _k]
  :model/Document)

(t2/deftransforms :model/Document
  {:document mi/transform-json})

(doto :model/Document
  (derive :metabase/model)
  (derive :perms/use-parent-collection-perms)
  (derive :hook/timestamped?)
  (derive :hook/entity-id))

(def DocumentName
  "Validations for the name of a document"
  (mu/with-api-error-message
   [:and
    {:error/message "invalid document name"
     :json-schema   {:type "string" :minLength 1 :maxLength 254}}
    [:string {:min 1 :max 254}]
    [:fn
     {:error/message "invalid document name"}
     (complement str/blank?)]]
   (deferred-tru "value must be a non-blank string between 1 and 254 characters.")))

(defn validate-collection-move-permissions
  "Validates that the current user has write permissions for both old and new collections
   when moving a document. Uses the same permission pattern as check-allowed-to-change-collection.
   Throws 403 exception if permissions are insufficient."
  [old-collection-id new-collection-id]
  (when old-collection-id
    (api/write-check :model/Collection old-collection-id))
  (when new-collection-id
    (api/check-400 (t2/exists? :model/Collection :id new-collection-id :archived false))
    (api/write-check :model/Collection new-collection-id)))

(methodical/defmethod t2/batched-hydrate [:model/Document :creator]
  "Hydrate the creator (user) of a document based on the creator_id."
  [_model k documents]
  (mi/instances-with-hydrated-data
   documents k
   #(-> (t2/select [:model/User :id :email :first_name :last_name] :id (keep :creator_id documents))
        (map (juxt :id identity))
        (into {}))
   :creator_id {:default {}}))

(methodical/defmethod t2/batched-hydrate [:model/Document :cards]
  "Hydrate cards associated with documents via document_id FK, returning as a map keyed by card ID.
  Fetches all cards for all documents in a single batched query to avoid N+1 queries."
  [_model k documents]
  (let [document-ids (keep :id documents)
        ;; Fetch all cards for all documents in one batched query
        all-cards (when (seq document-ids)
                    (t2/select :model/Card
                               :document_id [:in document-ids]
                               :archived false))
        ;; Group cards by document_id, then convert each group to a map keyed by card ID
        cards-by-doc-id (group-by :document_id all-cards)
        cards-maps-by-doc-id (update-vals cards-by-doc-id
                                          (fn [cards]
                                            (zipmap (map :id cards) cards)))]
    (for [doc documents]
      (assoc doc k (get cards-maps-by-doc-id (:id doc) {})))))

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
  [{:keys [id collection_id archived archived_directly] :as instance}]
  (sync-document-cards-collection! id collection_id
                                   :archived archived
                                   :archived-directly archived_directly)
  (events/publish-event! :event/document-update {:object instance})
  instance)

(t2/define-after-select :model/Document
  [document]
  (public-sharing/remove-public-uuid-if-public-sharing-is-disabled document))

;;; ------------------------------------------------ Serdes Hashing -------------------------------------------------

(defmethod serdes/hash-fields :model/Document
  [_table]
  [:name (serdes/hydrated-hash :collection) :created-at])

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
   :joins {:collection [:model/Collection [:= :collection.id :this.collection_id]]}
   :render-terms {:document-name :name
                  :document-id :id
                  :collection-authority_level :collection.authority_level
                  :collection-location        :collection.location
                  :collection-name            :collection.name
                  ;; This is used for legacy ranking, in future it will be replaced by :pinned
                  :collection-position        true
                  :collection-type            :collection.type
                  :archived-directly          true}})

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
   :skip [:view_count :last_viewed_at :public_uuid :made_public_by_id :dependency_analysis_version]
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
  [_model-name id _opts]
  (when-let [document (t2/select-one :model/Document :id id)]
    (when (= prose-mirror/prose-mirror-content-type (:content_type document))
      (merge
       (into {}
             (for [embedded-card-id (prose-mirror/card-ids document)]
               {["Card" embedded-card-id] {"Document" id}}))
       (into {}
             (for [{model :model link-id :entityId} (prose-mirror/collect-ast document
                                                                              #(when (= prose-mirror/smart-link-type (:type %))
                                                                                 (:attrs %)))
                   :when (contains? model->serdes-model model)]
               {[(model->serdes-model model) link-id] {"Document" id}}))))))

(t2/define-before-insert :model/Document [model]
  (collection/check-allowed-content :model/Document (:collection_id model))
  model)

(t2/define-before-update :model/Document [model]
  (collection/check-allowed-content :model/Document (:collection_id (t2/changes model)))
  model)
