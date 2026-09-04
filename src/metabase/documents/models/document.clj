(ns metabase.documents.models.document
  (:require
   [clojure.string :as str]
   [metabase.api.common :as api]
   [metabase.collections.core :as collections]
   [metabase.collections.models.collection :as collection]
   [metabase.documents.db :as documents.db]
   [metabase.documents.prose-mirror :as prose-mirror]
   [metabase.events.core :as events]
   [metabase.lib-be.schema :as lib-be.schema]
   [metabase.models.interface :as mi]
   [metabase.models.serialization :as serdes]
   [metabase.parameters.params :as params]
   [metabase.parameters.schema :as parameters.schema]
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
   [toucan2.core :as t2]
   [toucan2.instance :as t2.instance]))

(methodical/defmethod t2/table-name :model/Document [_model] :document)

(methodical/defmethod t2/model-for-automagic-hydration [#_model :default #_k :document]
  [_original-model _k]
  :model/Document)

(t2/deftransforms :model/Document
  {:document    mi/transform-json
   :public_uuid (mi/transform-encrypted-text "document.public_uuid")})

(doto :model/Document
  (derive :metabase/model)
  (derive :perms/use-parent-collection-perms)
  (derive :hook/timestamped?)
  (derive :hook/entity-id))

(defonce ^{:doc "Predicate gating a document's *content* (not merely its existence) below
                 collection-read, for documents whose rendered body embeds data the viewer may not
                 be entitled to see. Installed at init.

                 The only user today is `explorations`: a Summary document belongs to an
                 exploration (the `:exploration_id` FK on the document table) and embeds verbatim —
                 possibly sandboxed/impersonated/routed — result values, so a collaborator whose
                 data-access lens differs from the creator's must not read it.

                 `documents` can't call the consumer directly — the module graph runs one way
                 (`explorations -> documents`) — so the consumer registers a callback here."}
  doc-content-visibility-fn
  (atom (fn [_doc] true)))

(defn register-doc-content-visibility-fn!
  "Install the content-visibility gate (see [[doc-content-visibility-fn]]). Called once at the
  consuming module's init. `f` takes a document and returns whether the current user may see its
  rendered content."
  [f]
  (reset! doc-content-visibility-fn f))

(def ^:private ^:dynamic *content-gate-pending*
  "Document ids whose content gate is currently being evaluated on this thread.

  The gate is re-entrant by construction: adjudicating a document's content runs query-permission
  checks, and those read-check the source Cards of the queries involved — a Card scoped to a
  Document delegates back to that Document's gate. A document whose visibility depends on itself
  has no answer, so deny rather than recur into a stack overflow inside an authorization check."
  #{})

(def ^:dynamic *cache*
  "Cache atom bound by [[with-content-gate-cache]], or nil to adjudicate on every call."
  nil)

(defmacro with-content-gate-cache
  "Adjudicate each document's content at most once for the duration of `body`. Nesting reuses the
  enclosing cache.

  The verdict is a rollup over the owning exploration's threads and costs roughly twenty app-DB
  queries, so anything looping over documents — or over the Cards scoped to one, which all resolve
  to the same document and so to the same verdict — otherwise pays it once per row. Scope it around
  such a loop; everywhere else reads through."
  {:style/indent 0}
  [& body]
  `(binding [*cache* (or *cache* (atom {}))]
     ~@body))

(defn content-visible?
  "Run the registered content-visibility gate for `document`, guarding against re-entry and reusing
  a verdict already reached under [[with-content-gate-cache]]."
  [document]
  (let [id      (:id document)
        ;; Keyed by viewer as well as document: a verdict is only ever valid for the user it was
        ;; computed for, so a cache that outlives or crosses a user binding misses rather than
        ;; handing back someone else's answer.
        k       [api/*current-user-id* api/*is-superuser?* id]
        adjudge (fn []
                  (if (contains? *content-gate-pending* id)
                    false
                    (binding [*content-gate-pending* (cond-> *content-gate-pending* id (conj id))]
                      (boolean (@doc-content-visibility-fn document)))))]
    (if (and id *cache*)
      (if-some [cached (get @*cache* k)]
        cached
        (let [verdict (adjudge)]
          (swap! *cache* assoc k verdict)
          verdict))
      (adjudge))))

;; can-read?/can-write? compose the collection-permission policy with the content-visibility gate:
;; a document's rendered body can embed data the viewer isn't entitled to, so content access can be
;; narrower than collection access.
(defmethod mi/can-read? :model/Document
  ([instance]
   (and (mi/current-user-has-full-permissions? :read instance)
        (content-visible? instance)))
  ([_model pk]
   (mi/can-read? (documents.db/document pk))))

(defmethod mi/can-write? :model/Document
  ([instance]
   (and (mi/current-user-has-full-permissions? :write instance)
        (content-visible? instance)))
  ([_model pk]
   (mi/can-write? (documents.db/document pk))))

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
    (api/check-400 (documents.db/unarchived-collection-exists? new-collection-id))
    (api/write-check :model/Collection new-collection-id)))

;;; ------------------------------------------------ Write orchestration -------------------------------------------

(def CardCreateSchema
  "Schema for a card created inline with a document (the `cards` map on create/update). The
  card fields are declared locally: the model layer doesn't depend on the REST card schema."
  [:map
   [:name ms/NonBlankString]
   [:dataset_query ::lib-be.schema/maybe-legacy-query]
   [:entity_id {:optional true} [:maybe ms/NonBlankString]]
   [:parameters {:optional true} [:maybe ::parameters.schema/parameters]]
   [:parameter_mappings {:optional true} [:maybe [:sequential ms/Map]]]
   [:description {:optional true} [:maybe ms/NonBlankString]]
   [:display ms/NonBlankString]
   [:visualization_settings ms/Map]
   [:result_metadata {:optional true} [:maybe [:sequential ms/Map]]]
   [:cache_ttl {:optional true} [:maybe ms/PositiveInt]]])

(defn- create-card!
  "The single choke point every document card-creation path (create, update, copy) funnels through. Runs the same
  checks `POST /api/card` runs before saving: create access to the target collection, run permission on the query,
  read access to any card the parameters draw values from, and query permission on the fields the parameter targets
  name."
  [{query :dataset_query :as card} creator]
  (api/create-check :model/Card {:collection_id (:collection_id card)})
  (query-perms/check-run-permissions-for-query (dissoc query :query-permissions/perms))
  (card/check-parameter-source-card-permissions (:parameters card))
  (query-perms/check-parameter-field-permissions
   (into []
         (keep #(some-> % :target (params/param-target->field-id {:dataset_query query})))
         (:parameters card)))
  (card/create-card! (assoc card :type :question :dashboard_id nil) creator))

(defn clone-card!
  "Saves a copy of an existing card the user can already read, e.g. when embedding it into a document.

  Still checks create access to the target collection, but unlike [[create-card!]] deliberately skips the authoring
  checks (run permission on the query, parameter source-card and parameter field permissions): the query and
  parameters come from an existing card row the caller passed a read check on rather than from the request, so the
  user is not authoring anything -- they may be able to view (and run) the source card without having permission to
  write such a query themselves, e.g. a native card when they lack native query editing perms (UXW-5037). Running the
  clone is still gated by the usual runtime permission checks, the same ones that gate running the source card."
  [card creator]
  (api/create-check :model/Card {:collection_id (:collection_id card)})
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
                                                                (pos-int? (-> % :attrs :id)))
                                                       (-> % :attrs :id)))
        to-clone (when (seq card-ids)
                   (documents.db/cards-not-in-document card-ids id))]
    (with-content-gate-cache
      (reduce (fn [accum card]
                (api/read-check card)
                (assoc accum
                       (:id card)
                       (:id (clone-card! (assoc card :document_id id :collection_id collection_id)
                                         @api/*current-user*))))
              {}
              to-clone))))

(defn- hydrate-document
  "Fetch a document by id along with the derived fields the API returns. Does *not* check permissions or
  publish a read event, so it is safe to use on write paths (PUT/POST) where recording a view would be
  both semantically wrong and an extra, avoidable round-trip."
  [id]
  (t2/hydrate (documents.db/document id) :creator :can_write :can_delete :can_restore :is_remote_synced))

(defn get-document
  "Get document by id checking if the current user has permission to access and if the document exists.
  Pass `:log-view? false` to skip publishing the `:event/document-read` view event."
  [id & {:keys [log-view?] :or {log-view? true}}]
  (u/prog1 (api/check-404
            (api/read-check
             (hydrate-document id)))
    (when log-view?
      (events/publish-event! :event/document-read
                             {:object-id id
                              :user-id api/*current-user-id*}))))

(defn- draft-stored-result-pairings
  "From the incoming document AST and a draft→new card-id map, collect distinct
  `[new-card-id stored-result-id]` pairs for draft embeds that carry a `stored_result_id`.

  Only negative keys from `card-id-map` are considered (the draft-created set); clone
  remappings are irrelevant here."
  [document content-type draft-card-id-map]
  (when (and (seq draft-card-id-map) document)
    (->> (prose-mirror/collect-ast
          {:document document :content_type content-type}
          (fn [{:keys [type attrs]}]
            (when (and (= prose-mirror/card-embed-type type)
                       (contains? draft-card-id-map (:id attrs))
                       (:stored_result_id attrs))
              [(get draft-card-id-map (:id attrs))
               (:stored_result_id attrs)])))
         distinct
         vec)))

(mu/defn create-document!
  "Create a Document, clone any embedded cards the document doesn't own, publish
  `:event/document-create`, and return the created document. Permission checks
  (`api/create-check`) are the caller's job, run before this — the same split the REST
  `POST /api/document/` handler uses."
  [{:keys [name document collection_id collection_position cards]}
   :- [:map
       [:name DocumentName]
       [:document :any]
       [:collection_id {:optional true} [:maybe ms/PositiveInt]]
       [:collection_position {:optional true} [:maybe ms/PositiveInt]]
       [:cards {:optional true} [:maybe [:map-of [:int {:max -1}] CardCreateSchema]]]]]
  (let [created-document (t2/with-transaction [_conn]
                           (when collection_position
                             (api/maybe-reconcile-collection-position! {:collection_id collection_id
                                                                        :collection_position collection_position}))
                           (let [document-id (documents.db/insert-document! {:name name
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
                               (documents.db/update-document! document-id
                                                              (update-cards-in-ast
                                                               {:document document
                                                                :content_type prose-mirror/prose-mirror-content-type}
                                                               cards-to-update-in-ast)))
                             (u/prog1 (hydrate-document document-id)
                               (when (collections/remote-synced-collection? (:collection_id <>))
                                 (collections/check-non-remote-synced-dependencies <>)))))]
    ;; Publish event after successful creation
    (events/publish-event! :event/document-create
                           {:object created-document
                            :user-id api/*current-user-id*})
    created-document))

(mu/defn update-document!
  "Apply `body` (any of `:name`, `:document`, `:collection_id`, `:collection_position`,
  `:cards`, `:archived`) to `existing-document`, clone any newly-embedded cards the document
  doesn't own, publish `:event/document-update` (or `:event/document-delete` when archiving),
  and return the updated document. Permission checks (write-check, archived state,
  collection-move) are the caller's job, run before this — the same split the REST
  `PUT /api/document/:id` handler uses."
  [existing-document :- [:map [:id ms/PositiveInt]]
   {:keys [name document collection_id collection_position cards] :as body}
   :- [:map
       [:name {:optional true} DocumentName]
       [:document {:optional true} :any]
       [:collection_id {:optional true} [:maybe ms/PositiveInt]]
       [:collection_position {:optional true} [:maybe ms/PositiveInt]]
       ;; Any int key, matching the REST `DocumentUpdateOptions` this backs: with no `:document`
       ;; in the body the map is ignored entirely, and [[create-cards-for-document!]] still holds
       ;; the actually-consumed keys to negative ints.
       [:cards {:optional true} [:maybe [:map-of :int CardCreateSchema]]]
       [:archived {:optional true} [:maybe :boolean]]]]
  (let [document-id (:id existing-document)
        document-updates (dissoc (api/updates-with-archived-directly existing-document body) :cards)]
    (t2/with-transaction [_conn]
      (when collection_position
        (api/maybe-reconcile-collection-position! existing-document {:collection_id (if (contains? body :collection_id)
                                                                                      collection_id
                                                                                      (:collection_id existing-document))
                                                                     :collection_position collection_position}))
      (let [card-id-map (when document
                          (merge
                           (clone-cards-in-document! (assoc existing-document :document document))
                           (when-not (empty? cards)
                             (create-cards-for-document! cards document-id collection_id @api/*current-user*))))
            draft-card-id-map (into {} (filter (comp neg? key) card-id-map))
            pairings (draft-stored-result-pairings document
                                                   (:content_type existing-document)
                                                   draft-card-id-map)]
        (documents.db/update-document! document-id
                                       (cond-> document-updates
                                         document (merge (update-cards-in-ast
                                                          {:document document
                                                           :content_type (:content_type existing-document)}
                                                          card-id-map))
                                         name (assoc :name name)
                                         (contains? body :collection_id) (assoc :collection_id collection_id)
                                         ;; First body save clears the auto-created Summary placeholder flag.
                                         (and (:is_placeholder existing-document)
                                              (contains? body :document))
                                         (assoc :is_placeholder false)))
        (when (seq pairings)
          (card/carry-pairings-for-document! document-id pairings)))
      (collections/check-for-remote-sync-update existing-document))
    (let [updated-document (hydrate-document document-id)]
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
   #(when-let [creator-ids (seq (keep :creator_id documents))]
      (-> (documents.db/user-columns creator-ids)
          (map (juxt :id identity))
          (into {})))
   :creator_id {:default {}}))

(methodical/defmethod t2/batched-hydrate [:model/Document :cards]
  "Hydrate cards associated with documents via document_id FK, returning as a map keyed by card ID.
  Fetches all cards for all documents in a single batched query to avoid N+1 queries."
  [_model k documents]
  (let [document-ids (keep :id documents)
        ;; Fetch all cards for all documents in one batched query
        all-cards (when (seq document-ids)
                    (documents.db/unarchived-cards-for-documents document-ids))
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
    (documents.db/update-cards-for-document! document-id update-map)))

(t2/define-after-update :model/Document
  [{:keys [id collection_id archived archived_directly] :as instance}]
  (sync-document-cards-collection! id collection_id
                                   :archived archived
                                   :archived-directly archived_directly)
  (when-not mi/*deserializing?*
    ;; Toucan2 hands `define-after-update` a `TransientRow` for each updated row,
    ;; which is *not* a `mi/instance-of? :model/Document`. The revisions handler
    ;; rejects non-instances with "object must be a model instance" — caught and
    ;; logged at `revisions/events.clj:30`, but as a result no revision row is
    ;; recorded for content updates. Promote it to a real instance here so the
    ;; revisions push can complete cleanly.
    (events/publish-event! :event/document-update
                           {:object (if (t2/instance-of? :model/Document instance)
                                      instance
                                      (t2.instance/instance :model/Document instance))}))
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
           :exploration-id :exploration_id
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

(defn- ast-model->entity
  "The database row identified by the smart-link/card-embed `model` (\"card\", \"dataset\", \"table\", or
  \"dashboard\") and `id`, or nil."
  [model id]
  (case model
    ("card" "dataset") (documents.db/card id)
    "table"            (documents.db/table id)
    "dashboard"        (documents.db/dashboard id)))

(def ^:private model->serdes-model
  {"card"      "Card"
   "dataset"   "Card"
   "dashboard" "Dashboard"
   "table"     "Table"})

(def ^:private non-portable-card-embed-attrs
  "`cardEmbed` attrs holding a raw local database id that serdes cannot rewrite into a portable
  reference, and so must not travel. `:stored_result_id` points at a `stored_result` row — an
  ephemeral cached-snapshot record, not a first-class serdes entity — so exporting the integer
  verbatim would, on import, either dangle or silently resolve to an unrelated instance's
  snapshot. Dropping it degrades a static (snapshot-backed) embed to a live embed of the Card,
  which is portable and renders the same query."
  [:stored_result_id])

(defn- id->entity-id
  [{{:keys [model] :or {model "card"}} :attrs type :type :as node}]
  (let [id-key (if (= prose-mirror/smart-link-type type) :entityId :id)
        id (prose-mirror/node-entity-id node)
        node (cond-> node
               (= prose-mirror/card-embed-type type)
               (update :attrs #(apply dissoc % non-portable-card-embed-attrs)))]
    (if-let [db-model (and id (ast-model->entity model id))]
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

(defn- serdes-rewritable-node?
  "The AST nodes whose ids serdes rewrites between database ids and entity ids.

  Matches on node *type* only. The id itself cannot be part of this test, because the same predicate
  runs in both directions and the two directions see different shapes: on export `:id` is a raw
  database id, but on import it is a serdes path (a vector of `{:model :id}` maps). A guard that
  expected a positive integer would therefore pass on export and silently skip every node on import,
  leaving the path unresolved. The id-shape checks belong in the readers — [[id->entity-id]] guards
  on `prose-mirror/node-entity-id`, and [[entity-id->id]] on what `load-find-local` resolves to."
  [node]
  (contains? #{prose-mirror/smart-link-type prose-mirror/card-embed-type} (:type node)))

(defn- export-document-content
  "Transform cardEmbed / smartLink nodes to use entity IDs instead of database IDs"
  [document serdes-key _]
  (serdes-key
   (if (= (:content_type document) prose-mirror/prose-mirror-content-type)
     (prose-mirror/update-ast document serdes-rewritable-node? id->entity-id)
     document)))

(defn- import-document-content
  "Transform live cardEmbed / smartLink nodes to use database IDs instead of entity IDs"
  [document serdes-key _]
  (serdes-key
   (if (= (:content_type document) prose-mirror/prose-mirror-content-type)
     (prose-mirror/update-ast document serdes-rewritable-node? entity-id->id)
     document)))

(defmethod serdes/make-spec "Document"
  [_model-name _opts]
  {:copy [:archived :archived_directly :content_type :entity_id :name :collection_position]
   :skip [:view_count :last_viewed_at :public_uuid :public_uuid_prefix :made_public_by_id :exploration_id :is_placeholder]
   :transform {:created_at (serdes/date)
               :updated_at (serdes/date)
               :document {:export-with-context export-document-content
                          :import-with-context import-document-content}
               :collection_id (serdes/fk :model/Collection)
               :creator_id (serdes/fk :model/User)}
   :defaults {:archived          false
              :archived_directly false}})

(defmethod serdes/extract-query "Document"
  [model-name opts]
  ;; An exploration document is not first-class content: it is reachable only through its owning
  ;; exploration, its body embeds values computed under its creator's data-access lens, and
  ;; `:exploration_id` is in this spec's `:skip` list — so an exported document would import as an
  ;; ordinary, ungated document detached from any exploration.
  ((get-method serdes/extract-query :default)
   model-name
   (update opts :where (fn [where]
                         (let [clause [:= :exploration_id nil]]
                           (if where [:and where clause] clause))))))

(defn- document-deps
  [{:keys [content_type] :as document}]
  (when (= content_type prose-mirror/prose-mirror-content-type)
    ;; NOTE: unlike the readers below, this feeds `deserialization-dependencies`, which runs on the already-serialized
    ;; form where `:entityId` is a serdes path (a vector of {:model :id} maps), not a raw id — so it is not guarded
    ;; with `node-entity-id` here.
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
       (for [{{model :model} :attrs :as node}
             (prose-mirror/collect-ast document
                                       #(when (= prose-mirror/smart-link-type (:type %)) %))
             :let  [link-id (prose-mirror/node-entity-id node)]
             :when (and link-id (contains? model->serdes-model model))]
         [{:model (model->serdes-model model) :id link-id}]))))))

(defmethod serdes/descendants "Document"
  [_model-name id _opts]
  (when-let [document (documents.db/document id)]
    (when (= prose-mirror/prose-mirror-content-type (:content_type document))
      (merge
       (into {}
             (for [embedded-card-id (prose-mirror/card-ids document)]
               {["Card" embedded-card-id] {"Document" id}}))
       (into {}
             (for [{{model :model} :attrs :as node} (prose-mirror/collect-ast document
                                                                              #(when (= prose-mirror/smart-link-type (:type %)) %))
                   :let  [link-id (prose-mirror/node-entity-id node)]
                   :when (and link-id (contains? model->serdes-model model))]
               {[(model->serdes-model model) link-id] {"Document" id}}))))))

(t2/define-before-insert :model/Document [model]
  (collection/check-allowed-content :model/Document (:collection_id model))
  (public-sharing/add-public-uuid-prefix model))

(t2/define-before-update :model/Document [model]
  (collection/check-allowed-content :model/Document (:collection_id (t2/changes model)))
  (public-sharing/add-public-uuid-prefix-if-changed model))
