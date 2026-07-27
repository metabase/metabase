(ns metabase.documents.models.document
  (:require
   [clojure.string :as str]
   [metabase.api.common :as api]
   [metabase.collections.core :as collections]
   [metabase.collections.models.collection :as collection]
   [metabase.documents.prose-mirror :as prose-mirror]
   [metabase.events.core :as events]
   [metabase.models.interface :as mi]
   [metabase.models.serialization :as serdes]
   [metabase.public-sharing.core :as public-sharing]
   [metabase.queries.core :as card]
   [metabase.query-permissions.core :as query-perms]
   [metabase.search.config :as search.config]
   [metabase.search.spec :as search.spec]
   [metabase.util :as u]
   [metabase.util.i18n :refer [deferred-tru]]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
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

;;; ------------------------------------------------ Write orchestration -------------------------------------------

(def CardCreateSchema
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

(defn create-card!
  "Checks that the query is runnable by the current user then saves"
  [{query :dataset_query :as card} creator]
  (query-perms/check-run-permissions-for-query (dissoc query :query-permissions/perms))
  (card/create-card! (assoc card :type :question :dashboard_id nil) creator))

(mu/defn update-cards-in-ast :- [:map [:document :any]
                                 [:content_type :string]]
  "Rewrite the card FK (`[:attrs :id]`) of every cardEmbed node found in `card-id-map`.
  Touches nothing else on the node — in particular a node's `:_id` never changes here."
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

(mu/defn clone-cards-in-document! :- [:map-of ms/PositiveInt ms/PositiveInt]
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
  "Get document by id checking if the current user has permission to access and if the document exists.
  Pass `:log-view? false` to skip publishing the `:event/document-read` view event."
  [id & {:keys [log-view?] :or {log-view? true}}]
  (u/prog1 (api/check-404
            (api/read-check
             (t2/hydrate (t2/select-one :model/Document :id id) :creator :can_write :can_delete :can_restore :is_remote_synced)))
    (when log-view?
      (events/publish-event! :event/document-read
                             {:object-id id
                              :user-id api/*current-user-id*}))))

(defn create-document!
  "Create a Document from already-validated inputs, clone any embedded cards the document
  doesn't own, publish `:event/document-create`, and return the created document. Permission
  checks (`api/create-check`) are the caller's job, run before this — the same split the REST
  `POST /api/document/` handler uses."
  [{:keys [name document collection_id collection_position cards]}]
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

(defn update-document!
  "Apply `body` (already-validated update options: any of `:name`, `:document`,
  `:collection_id`, `:collection_position`, `:cards`, `:archived`) to `existing-document`,
  clone any newly-embedded cards the document doesn't own, publish `:event/document-update`
  (or `:event/document-delete` when archiving), and return the updated document. Permission
  checks (write-check, archived state, collection-move) are the caller's job, run before
  this — the same split the REST `PUT /api/document/:id` handler uses."
  [existing-document {:keys [name document collection_id collection_position cards] :as body}]
  (let [document-id (:id existing-document)
        document-updates (dissoc (api/updates-with-archived-directly existing-document body) :cards)]
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
      updated-document)))

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
  (when-not mi/*deserializing?*
    (events/publish-event! :event/document-update {:object instance}))
  instance)

(t2/define-after-select :model/Document
  [document]
  (public-sharing/remove-public-uuid-if-public-sharing-is-disabled document))

;;; ------------------------------------------------ Serdes Hashing -------------------------------------------------

;;; ----------------------------------------------- Search ----------------------------------------------------------

(defn- document->search-text
  "Extract the plain searchable text from a document's prose-mirror body for the search index.

  Receives the raw `:document` value as it comes off the ingestion query (a JSON string).
  Returns nil if it can't be parsed, so a malformed/oversized body never blocks the rest of the
  document (e.g. its name) from being indexed."
  [document]
  (when document
    (try
      (-> (cond-> document (string? document) json/decode+kw)
          prose-mirror/ast->text
          not-empty)
      (catch Throwable _ nil))))

;; The legacy (in-place) search engine LIKE-matches the raw `:document` JSON in SQL, but scores results
;; against this cleaned-up text. Extracting prose here means a query that only hits JSON structure
;; (e.g. "paragraph") matches no real content and is correctly dropped as a non-match.
(defmethod search.config/column->string [:document :document]
  [value _model _column]
  (or (document->search-text value) ""))

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
   :search-terms {:name true
                  :document document->search-text}
   ;; Document bodies are full-text searchable (via `document->search-text` above) but are
   ;; deliberately excluded from semantic-search embeddings.
   :embedding-exclude #{:document}
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
   :skip [:view_count :last_viewed_at :public_uuid :made_public_by_id]
   :transform {:created_at (serdes/date)
               :updated_at (serdes/date)
               :document {:export-with-context export-document-content
                          :import-with-context import-document-content}
               :collection_id (serdes/fk :model/Collection)
               :creator_id (serdes/fk :model/User)}
   :defaults {:archived          false
              :archived_directly false}})

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

(defmethod serdes/deserialization-dependencies "Document"
  [{:keys [collection_id] :as document}]
  (set (concat
        (document-deps document)
        (when collection_id #{[{:model "Collection" :id collection_id}]}))))

(defmethod serdes/serialization-dependencies "Document"
  ;; Embedded cards and smart-links become content references (each must be part of the export); the containing
  ;; Collection is included too, though a selective export may legitimately omit it.
  [_model-name {:keys [collection_id content_type] :as document}]
  (set
   (concat
    (when collection_id [[{:model "Collection" :id collection_id}]])
    (when (= content_type prose-mirror/prose-mirror-content-type)
      (concat
       (for [embedded-card-id (prose-mirror/card-ids document)]
         [{:model "Card" :id embedded-card-id}])
       (for [{model :model link-id :entityId}
             (prose-mirror/collect-ast document
                                       #(when (= prose-mirror/smart-link-type (:type %))
                                          (:attrs %)))
             :when (contains? model->serdes-model model)]
         [{:model (model->serdes-model model) :id link-id}]))))))

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
