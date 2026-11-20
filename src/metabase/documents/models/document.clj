(ns metabase.documents.models.document
  (:require
   [metabase.activity-feed.recent-views.spec :as recent-views]
   [metabase.api.common :as api]
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.audit-app.core :as audit]
   [metabase.collection-items.spec :as collection-items]
   [metabase.collections.models.collection :as collection]
   [metabase.dependencies.core :as dependencies]
   [metabase.documents.audit :as documents.audit]
   [metabase.documents.collection-items :as documents.collection-items]
   [metabase.documents.db :as documents.db]
   [metabase.documents.dependencies :as documents.dependencies]
   [metabase.documents.prose-mirror :as prose-mirror]
   [metabase.documents.recent-views :as documents.recent-views]
   [metabase.documents.schema :as documents.schema]
   [metabase.documents.search :as documents.search]
   [metabase.documents.serialization :as documents.serialization]
   [metabase.eid-translation.spec :as eid-translation]
   [metabase.events.core :as events]
   [metabase.models.interface :as mi]
   [metabase.public-sharing.core :as public-sharing]
   [metabase.remote-sync.core :as remote-sync]
   [metabase.revisions.core :as revisions]
   [metabase.search.spec :as search]
   [metabase.serialization.core :as serialization]
   [metabase.staleness.core :as staleness]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/Document [_model] :document)

(methodical/defmethod t2/model-for-automagic-hydration [#_model :default #_k :document]
  [_original-model _k]
  :model/Document)

(t2/deftransforms :model/Document
  {:document    {:in  (comp mi/json-in prose-mirror/normalize-document)
                 :out (comp (mi/catch-normalization-exceptions prose-mirror/normalize-document)
                            mi/json-out-with-keywordization)}
   :public_uuid (mi/transform-encrypted-text "document.public_uuid")})

(doto :model/Document
  (derive :metabase/model)
  (derive :hook/timestamped?)
  (derive :hook/entity-id)
  (derive :hook/events))

;;; ---------- Hooks ---------------------------------------------------------------------------------------------

(defn- document-parent-archived?
  "Whether the Collection that `document` is in, or the Exploration it summarizes, is archived."
  [{:keys [collection_id exploration_id]}]
  (boolean (or (collection/archived? collection_id)
               (and exploration_id (documents.db/exploration-archived? exploration_id)))))

(defmethod mi/after-archived-change :model/Document
  [_model rows changes]
  (doseq [{:keys [id]} rows]
    (events/with-event-context {:archived-with [:model/Document id]}
      (if (:archived changes)
        (documents.db/archive-document-cards! id)
        (documents.db/restore-document-cards! id)))))

(t2/define-before-insert :model/Document
  [document]
  (collection/check-collection-for :model/Document document)
  (public-sharing/add-public-uuid-prefix document))

(t2/define-before-update :model/Document
  [{:keys [id] :as document}]
  (let [changes (t2/changes document)]
    (when (contains? changes :collection_id)
      (collection/check-collection-for :model/Document document))
    (when (and (contains? changes :public_uuid_prefix)
               (not (contains? changes :public_uuid)))
      (throw (ex-info (tru "The public UUID prefix of a Document follows its public UUID; change the public UUID instead.")
                      {:status-code 400})))
    (when (contains? changes :collection_id)
      (documents.db/update-cards-for-document! id {:collection_id (:collection_id document)}))
    (cond-> (public-sharing/add-public-uuid-prefix-if-changed document)
      (contains? changes :archived) (assoc :archived_directly (mi/archived-directly document #(document-parent-archived? document))))))

(mi/define-update-in-transaction :model/Document)
(t2/define-after-select :model/Document
  [document]
  (public-sharing/remove-public-uuid-if-public-sharing-is-disabled document))

;;; ---------- Permissions ---------------------------------------------------------------------------------------

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

#_{:clj-kondo/ignore [:metabase/discourage-dynamic-vars]}
(def ^:private ^:dynamic *content-gate-pending*
  "Document ids whose content gate is currently being evaluated on this thread.

  The gate is re-entrant by construction: adjudicating a document's content runs query-permission
  checks, and those read-check the source Cards of the queries involved — a Card scoped to a
  Document delegates back to that Document's gate. A document whose visibility depends on itself
  has no answer, so deny rather than recur into a stack overflow inside an authorization check."
  #{})

#_{:clj-kondo/ignore [:metabase/discourage-dynamic-vars]}
(def ^:dynamic *content-gate-cache*
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
  `(binding [*content-gate-cache* (or *content-gate-cache* (atom {}))]
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
    (if (and id *content-gate-cache*)
      (if-some [cached (get @*content-gate-cache* k)]
        cached
        (let [verdict (adjudge)]
          (swap! *content-gate-cache* assoc k verdict)
          verdict))
      (adjudge))))

;; can-read?/can-write? compose the collection-permission policy with the content-visibility gate:
;; a document's rendered body can embed data the viewer isn't entitled to, so content access can be
;; narrower than collection access.
(methodical/defmethod t2/batched-hydrate [:model/Document :can_read]
  "Whether the current user reads each of `documents`, as the content of its Collection."
  [_model _k documents]
  (collection/hydrate-content-can-read :model/Document documents {:audit-rules? false, :visible? content-visible?}))

(methodical/defmethod t2/batched-hydrate [:model/Document :can_write]
  "Whether the current user writes each of `documents`, as the content of its Collection."
  [_model _k documents]
  (collection/hydrate-content-can-write :model/Document documents {:audit-rules? false, :visible? content-visible?}))

(defn- collection-writable?
  "Whether the current user writes the Collection with `collection-id`, or the root Collection for nil."
  [collection-id]
  (collection/can-write-collection-or-root? collection-id {:root-namespace nil}))

(defmethod mi/can-create? :model/Document
  [_model {collection-id :collection_id}]
  (collection-writable? collection-id))

(defn- following-cards
  "The Cards of the Document with `document-id` that archiving it, when `archive?`, or restoring it takes along."
  [document-id archive?]
  (if archive?
    (documents.db/cards-archived-with-document document-id)
    (documents.db/cards-restored-with-document document-id)))

(defn- archive-followers-updatable?
  "Whether the current user may apply `changes` to the Cards of `document` that archiving or restoring it takes along."
  [document changes]
  (mi/archive-followers-updatable? document changes :model/Card (partial following-cards (:id document))))

(defn- summary-owner-writable
  "A function from one of `documents` to whether the current user writes the Exploration whose Summary it is, or nil
  for a Document of no Exploration, with the Explorations loaded once, and only when `changes` archive or restore one
  of `documents` alone."
  [documents changes]
  (let [exploration-ids (when (some #(mi/changes-only-archived? % changes) documents)
                          (not-empty (into [] (comp (keep :exploration_id) (distinct)) documents)))
        writable        (when exploration-ids
                          (into #{} (comp (filter mi/can-write?) (map :id))
                                (t2/hydrate (documents.db/explorations exploration-ids) :can_write)))]
    (fn [document]
      (when-let [exploration-id (:exploration_id document)]
        (contains? writable exploration-id)))))

(defn- can-update-with?
  "Whether the current user may apply `changes` to `document`, where `summary-owner-writable` answers an archive or
  restore of a Summary, whose content its Exploration's data decides, at its Exploration."
  [document changes summary-owner-writable]
  (boolean
   (and (let [owner-writable (when (mi/changes-only-archived? document changes) (summary-owner-writable document))]
          (if (some? owner-writable)
            owner-writable
            (mi/can-write? document)))
        (archive-followers-updatable? document changes)
        (collection/can-move? document changes)
        (or (not-any? #(contains? changes %) [:public_uuid :made_public_by_id])
            (mi/superuser?)))))

(defmethod mi/can-update? :model/Document
  [document changes]
  (can-update-with? document changes (summary-owner-writable [document] changes)))

(defmethod mi/can-update-all? :model/Document
  [_model documents changes]
  (let [owner-writable (summary-owner-writable documents changes)]
    (every? #(can-update-with? % changes owner-writable) documents)))

;;; ---------- Hydration -----------------------------------------------------------------------------------------

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

;;; ---------- Reading ----------------------------------------------------------------------------------------

(defn hydrate-document
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

;;; --------------------------------------------------- Specs ----------------------------------------------------

(defmethod events/spec :model/Document
  [_model]
  {:create :event/document-create
   :update :event/document-update
   :delete :event/document-delete})

(defmethod app-db-copy/spec :model/Document [_model]
  {:skip? false})

(defmethod serialization/spec :model/Document [_]
  {:schema              ::documents.schema/external-document
   :copy                [:archived :archived_directly :content_type :entity_id :name :collection_position]
   :skip                [:view_count :last_viewed_at :public_uuid :public_uuid_prefix :made_public_by_id
                         :exploration_id :is_placeholder]
   :transform           {:document      documents.serialization/document-transform
                         :collection_id (serialization/fk-transform :model/Collection)
                         :creator_id    serialization/user-transform}
   :defaults            {:archived          false
                         :archived_directly false}
   :import-dependencies documents.serialization/import-dependencies
   :export-dependencies documents.serialization/export-dependencies})

(defmethod remote-sync/spec :model/Document
  [_model]
  {:synced-items         documents.db/synced-document-items
   :synced-filter-clause documents.db/synced-documents-clause})

(defmethod revisions/spec :model/Document [_model]
  {:track [:name :document :content_type :exploration_id :is_placeholder :archived :archived_directly]
   :skip  [:collection_id :collection_position :creator_id :entity_id :last_viewed_at :made_public_by_id
           :public_uuid :public_uuid_prefix :view_count]})

(defmethod audit/spec :model/Document [_model]
  {:track          [:name :collection_id]
   :track-redacted [:archived :archived_directly :content_type :creator_id :document :exploration_id :is_placeholder
                    :made_public_by_id :public_uuid :public_uuid_prefix]
   :skip           [:collection_position :entity_id :last_viewed_at :view_count]
   :topics         {:create documents.audit/create-topic
                    :update documents.audit/update-topic
                    :delete documents.audit/delete-topic}})

(defmethod search/spec :model/Document
  [_model]
  {"document"
   {:attrs {:archived true
            :collection-id :collection_id
            :creator-id :creator_id
            :exploration-id :exploration_id
            :view-count :view_count
            :created-at :created_at
            :updated-at :updated_at
            :last-viewed-at :last_viewed_at
            :pinned [:> [:coalesce :collection_position [:inline 0]] [:inline 0]]}
    :search-terms {:name true
                   :document documents.search/document->search-text}
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
                   :archived-directly          true}}})

(defmethod dependencies/spec :model/Document [_model]
  {:type  :document
   :items documents.db/dependency-document-items

   :dependencies documents.dependencies/dependencies

   :dependency-columns #{:content_type :document}})

(defmethod collection-items/spec :model/Document [_model]
  {"document" {:items   documents.db/collection-document-items
               :hydrate documents.collection-items/hydrate}})

(defmethod recent-views/spec :model/Document [_model]
  {"document" {:load   documents.db/recent-view-documents
               :render documents.recent-views/render}})

(defmethod staleness/spec :model/Document [_model]
  {:candidates documents.db/stale-document-candidates})

(defmethod eid-translation/spec :model/Document [_model]
  {:names [:document]})
