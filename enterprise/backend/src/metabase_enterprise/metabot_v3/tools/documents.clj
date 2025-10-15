(ns metabase-enterprise.metabot-v3.tools.documents
  "Business logic for memory operations using Metabase Documents as the storage layer.
   Memories are stored one per document in user-specific collections."
  (:require
   [clojure.string :as str]
   [metabase-enterprise.documents.pm2 :refer [prosemirror->markdown]]
   [metabase.collections.models.collection :as collection]
   [toucan2.core :as t2]))

;;; ----------------------------------------------------------------------------------------------------------------
;;; Collection Management
;;; ----------------------------------------------------------------------------------------------------------------

(def ^:private memory-root-collection-name "__METABOT_MEMORY__")
(def ^:private memory-kvcache-collection-name "KVCACHE")
(def ^:private memory-profile-collection-name "PROFILE")

(defn- get-or-create-collection!
  "Gets or creates a collection with the given name under the parent collection ID.
   Returns the collection ID."
  [collection-name parent-id]
  (or
   ;; Try to find existing collection
   (t2/select-one-pk :model/Collection
                     :name collection-name
                     :location (if parent-id
                                 (collection/children-location (t2/select-one :model/Collection :id parent-id))
                                 "/"))
   ;; Create if it doesn't exist
   (:id (t2/insert-returning-instance! :model/Collection
                                       {:name collection-name
                                        :location (if parent-id
                                                    (collection/children-location (t2/select-one :model/Collection :id parent-id))
                                                    "/")
                                        :namespace nil}))))

(defn- ensure-memory-collection!
  "Ensures the memory collection path exists for the current user.
   Creates the collection structure if it doesn't exist.
   Path: __METABOT_MEMORY__/KVCACHE/<username>
   Returns the collection ID."
  [user-id]
  (let [user-name (or (:common_name (t2/select-one :model/User :id user-id))
                      (str "user-" user-id))
        ;; Create root collection: __METABOT_MEMORY__
        root-collection-id (get-or-create-collection! memory-root-collection-name nil)
        ;; Create KVCACHE subdirectory
        kvcache-collection-id (get-or-create-collection! memory-kvcache-collection-name root-collection-id)
        ;; Create user-specific collection
        user-collection-id (get-or-create-collection! user-name kvcache-collection-id)]
    user-collection-id))

(defn- ensure-profile-collection!
  "Ensures the profile collection path exists.
   Creates the collection structure if it doesn't exist.
   Path: __METABOT_MEMORY__/PROFILES
   Returns the collection ID."
  []
  (let [;; Create root collection: __METABOT_MEMORY__
        root-collection-id (get-or-create-collection! memory-root-collection-name nil)
          ;; Create PROFILE subdirectory
        profile-collection-id (get-or-create-collection! memory-profile-collection-name root-collection-id)]
    profile-collection-id))

(defn create-user-profile-document!
  "Creates the user profile document. Returns the profile content"
  [{:keys [user-id content]}]
  {:pre [(string? content) (seq content)
         (int? user-id)]}
  (let [user-name (or (:common_name (t2/select-one :model/User :id user-id))
                      (str "user-" user-id))
        collection-id (ensure-profile-collection!)
        _ (t2/insert-returning-instance! :model/Document
                                         {:name user-name
                                          :document content
                                          :content_type "application/json+vnd.prose-mirror"
                                          :collection_id collection-id
                                          :creator_id user-id})]
    content))

(defn get-user-profile
  "Retrieves a specific memory entry by document ID.
   Returns full memory details or nil if not found/not authorized."
  [user-id]
  {:pre [(int? user-id)]}
  (let [user-name (or (:common_name (t2/select-one :model/User :id user-id))
                      (str "user-" user-id))
        collection-id (ensure-profile-collection!)
        document (t2/select-one :model/Document
                                :collection_id collection-id
                                :name user-name
                                {:order-by [[:created_at :desc]]})]
    (-> document :document prosemirror->markdown)))
;;; ----------------------------------------------------------------------------------------------------------------
;;; Document Transformation
;;; ----------------------------------------------------------------------------------------------------------------

(defn- document->memory
  "Transforms a document record into memory format."
  [document]
  (when document
    {:id (:id document)
     :name (:name document)
     :content (:document document)
     :created_at (:created_at document)
     :updated_at (:updated_at document)}))

;;; ----------------------------------------------------------------------------------------------------------------
;;; Memory Operations
;;; ----------------------------------------------------------------------------------------------------------------

(defn create-memory!
  "Creates a new memory entry as a document.
   Returns the created document transformed to memory format."
  [{:keys [name content user-id]}]
  {:pre [(string? name) (seq name)
         (string? content) (seq content)
         (int? user-id)]}
  (let [collection-id (ensure-memory-collection! user-id)
        document (t2/insert-returning-instance! :model/Document
                                                {:name name
                                                 :document content
                                                 :content_type "application/json+vnd.prose-mirror"
                                                 :collection_id collection-id
                                                 :creator_id user-id})]
    (document->memory document)))

(defn list-memories
  "Lists all memory entries for a user with full details.
   Returns vector of maps with full memory details.
   Ordered by created_at descending."
  [user-id]
  {:pre [(int? user-id)]}
  (try
    (let [collection-id (ensure-memory-collection! user-id)
          documents (t2/select :model/Document
                               :collection_id collection-id
                               :archived false
                               {:order-by [[:created_at :desc]]})]
      (mapv document->memory documents))
    (catch Exception _e
      ;; If collection doesn't exist or any error, return empty vector
      [])))

(defn get-memory
  "Retrieves a specific memory entry by document ID.
   Returns full memory details or nil if not found/not authorized."
  [document-id user-id]
  {:pre [(int? document-id)
         (int? user-id)]}
  (when-let [document (t2/select-one :model/Document :id document-id)]
    ;; Verify the document belongs to the user's memory collection
    (let [user-collection-id (ensure-memory-collection! user-id)]
      (when (= (:collection_id document) user-collection-id)
        (document->memory document)))))

(comment
  (t2/delete! :model/Document :creator_id (metabase.test/user->id :crowberto))
  (t2/delete! :model/Document :creator_id (metabase.test/user->id :rasta))
  (metabase.test/with-current-user (metabase.test/user->id :crowberto)
    (create-memory! {:name "FOO"
                     :content "GREAT SUCCESS!"
                     :user-id (metabase.test/user->id :crowberto)}))
  (metabase.test/with-current-user (metabase.test/user->id :crowberto)
    (list-memories (metabase.test/user->id :crowberto)))
  (metabase.test/with-current-user (metabase.test/user->id :crowberto)
    (get-memory 6 (metabase.test/user->id :crowberto))))

(defn collection-exists?
  "Helper function to check if a collection path exists.
   Used primarily for testing."
  [path]
  (let [path-parts (str/split path #"/")
        root-name (first path-parts)]
    (boolean (t2/select-one :model/Collection :name root-name))))
