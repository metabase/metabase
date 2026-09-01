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
   [metabase.search.config :as search.config]
   [metabase.search.spec :as search.spec]
   [metabase.util :as u]
   [metabase.util.i18n :refer [deferred-tru]]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [methodical.core :as methodical]
   [toucan2.core :as t2]
   [toucan2.instance :as t2.instance]))

(methodical/defmethod t2/table-name :model/Document [_model] :document)

(methodical/defmethod t2/model-for-automagic-hydration [#_model :default #_k :document]
  [_original-model _k]
  :model/Document)

(t2/deftransforms :model/Document
  {:document    mi/transform-json
   :public_uuid (mi/transform-encrypted-text :encryption/document.public_uuid)})

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
  ([model pk]
   (mi/can-read? (t2/select-one model pk))))

(defmethod mi/can-write? :model/Document
  ([instance]
   (and (mi/current-user-has-full-permissions? :write instance)
        (content-visible? instance)))
  ([model pk]
   (mi/can-write? (t2/select-one model pk))))

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
    (if-let [db-model (and id (t2/select-one (ast-model->db-model model) :id id))]
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
  (when-let [document (t2/select-one :model/Document :id id)]
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
