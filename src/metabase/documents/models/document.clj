(ns metabase.documents.models.document
  (:require
   [medley.core :as m]
   [metabase.activity-feed.recent-views.spec :as recent-views]
   [metabase.api.common :as api]
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.app-db.core :as app-db]
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
   [metabase.lib-be.schema :as lib-be.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.visualization :as lib.schema.visualization]
   [metabase.models.interface :as mi]
   [metabase.parameters.params :as params]
   [metabase.parameters.schema :as parameters.schema]
   [metabase.public-sharing.core :as public-sharing]
   [metabase.queries.core :as card]
   [metabase.queries.models.card :as queries.card]
   [metabase.queries.schema :as queries.schema]
   [metabase.query-permissions.core :as query-perms]
   [metabase.remote-sync.core :as remote-sync]
   [metabase.revisions.core :as revisions]
   [metabase.search.spec :as search]
   [metabase.serialization.core :as serialization]
   [metabase.staleness.core :as staleness]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
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
  (derive :hook/entity-id))

;;; ---------- Hooks ---------------------------------------------------------------------------------------------

(t2/define-before-insert :model/Document
  [document]
  (public-sharing/add-public-uuid-prefix document))

(t2/define-before-update :model/Document
  [document]
  (let [changes (t2/changes document)]
    (when (and (contains? changes :public_uuid_prefix)
               (not (contains? changes :public_uuid)))
      (throw (ex-info (tru "The public UUID prefix of a Document follows its public UUID; change the public UUID instead.")
                      {:status-code 400})))
    (cond-> (public-sharing/add-public-uuid-prefix-if-changed document)
      (and (contains? changes :archived) (not (contains? changes :archived_directly)))
      (assoc :archived_directly (documents.db/archived-directly-clause changes)))))

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

(defn- check-new-card!
  "The checks a new Card of a Document goes through, those `POST /api/card` runs before saving: create access to the
  target collection, run permission on the query, read access to any card the parameters draw values from, and query
  permission on the fields the parameter targets name."
  [{query :dataset_query :as card}]
  (api/create-check :model/Card card)
  (query-perms/check-run-permissions-for-query (dissoc query :query-permissions/perms))
  (card/check-parameter-source-card-permissions (:parameters card))
  (query-perms/check-parameter-field-permissions
   (into []
         (keep #(some-> % :target (params/param-target->field-id {:dataset_query query})))
         (:parameters card))))

(defn- check-clone!
  "Throws unless the user may create `source-card`, a copy of a Card they can already read, in its Collection: create
  access to the target collection, without the authoring checks of [[check-new-card!]] (UXW-5037)."
  [source-card]
  (card/with-copy-source-card source-card
    (api/create-check :model/Card source-card)))

(defn- new-cards-permitted?
  "Whether [[check-new-card!]] passes for each of `entries`, `{:data :source-card-id}`, answered for all of them from
  reads that do not grow with their number, the query permissions asked once for each distinct query. False when a check
  does not pass or throws, which [[check-new-cards!]] then tells apart by asking one by one, in order."
  [entries]
  (try
    (let [sources (queries.card/readable-cards-by-id (into #{} (keep :source-card-id) entries))]
      (and sources
           (queries.card/can-create-all? (mapv (fn [{:keys [data source-card-id]}] [data (get sources source-card-id)]) entries))
           (do (run! #(query-perms/check-run-permissions-for-query (dissoc % :query-permissions/perms))
                     (into #{} (keep (comp :dataset_query :data)) entries))
               true)
           (card/parameter-source-cards-readable? (into [] (mapcat (comp :parameters :data)) entries))
           (do (query-perms/check-parameter-field-permissions
                (into []
                      (comp (mapcat (fn [{{:keys [parameters dataset_query]} :data}]
                                      (keep #(some-> % :target (params/param-target->field-id {:dataset_query dataset_query}))
                                            parameters)))
                            (distinct))
                      entries))
               true)))
    (catch Exception _
      false)))

(defn- check-new-cards!
  "Throws, for the first of `entries`, `{:data :source-card-id}`, in order that the current user may not create, what
  [[check-new-card!]] throws for it, after reading the source Card it copies, if any."
  [entries]
  (when-not (new-cards-permitted? entries)
    (run! (fn [{:keys [data source-card-id]}]
            (card/with-copy-source-card (some->> source-card-id (api/read-check :model/Card))
              (check-new-card! data)))
          entries)))

(defn check-clone-cards!
  "Throws, for the first of `cards`, Cards that are copied into a Document in order, what its read check, then
  [[check-clone!]] of its copy in `sources`, throws, from reads that do not grow with their number when the user may
  read and create all of them."
  [cards sources]
  (with-content-gate-cache
    (let [cards (t2/hydrate cards :can_read)]
      (when-not (and (every? mi/can-read? cards)
                     (try (queries.card/can-create-all? (mapv (fn [source] [source source]) sources))
                          (catch Exception _ false)))
        (doseq [[card source] (map vector cards sources)]
          (api/read-check card)
          (check-clone! source))))))

(defn- embedded-cards-to-clone
  "The existing Cards that the `document`, an AST of `content-type`, embeds and the Document with `document-id`, nil for
  one not created yet, does not hold."
  [document-id document content-type]
  (let [card-ids (prose-mirror/collect-ast {:document document :content_type content-type}
                                           #(when (and (= prose-mirror/card-embed-type (:type %))
                                                       (pos-int? (:id (:attrs %))))
                                              (:id (:attrs %))))]
    (when (seq card-ids)
      (if document-id
        (documents.db/cards-not-in-document card-ids document-id)
        (documents.db/cards-by-ids card-ids)))))

(defn- check-document-cards!
  "Throws what the checks of the Cards a write of a Document makes throw, for the first Card in order that the current
  user may not create: the existing `to-clone` Cards copied into `clone-collection-id`, then the `new-cards`, a map of
  temporary id to data, put in `new-collection-id` unless they name another Collection."
  [to-clone clone-collection-id new-cards new-collection-id]
  (when (seq to-clone)
    (check-clone-cards! to-clone (mapv #(assoc % :collection_id clone-collection-id) to-clone)))
  (when (seq new-cards)
    (check-new-cards! (mapv (fn [[_ card-data]]
                              {:source-card-id (:source_card_id card-data)
                               :data           (cond-> (dissoc card-data :source_card_id)
                                                 (nil? (:collection_id card-data)) (assoc :collection_id new-collection-id))})
                            new-cards))))

(defn check-creating-document-cards!
  "Throws what [[create-document-with-cards!]] must not do for the current user: copy a Card that they may not read or
  create in the Collection, or create the new `cards` of `body`, the body of the creation, that they may not create or
  whose query, parameters or source Card they may not use. Call it before the write, with fixed statements for any
  number of Cards."
  [{:keys [document collection_id cards]}]
  (with-content-gate-cache
    (check-document-cards! (embedded-cards-to-clone nil document prose-mirror/prose-mirror-content-type)
                           collection_id
                           cards
                           collection_id)))

(defn check-updating-document-cards!
  "Throws what [[update-document-with-cards!]] must not do for the current user, as [[check-creating-document-cards!]]
  does for a creation, for `body` applied to `existing-document`. Nothing is checked unless `body` has a `:document`."
  [existing-document {:keys [document collection_id cards] :as body}]
  (when document
    (with-content-gate-cache
      (check-document-cards! (embedded-cards-to-clone (:id existing-document) document (:content_type existing-document))
                             (:collection_id existing-document)
                             cards
                             (if (contains? body :collection_id) collection_id (:collection_id existing-document))))))

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

;;; ---------- Writes --------------------------------------------------------------------------------------------

(defn- check-documents
  "Throw a 400 unless each of `rows`, holding the `:collection_id` and `:archived` state a Document is about to have,
  satisfies these rules, checked for the first row that breaks one, with one read of the Collections:

  - its Collection is in a namespace that holds Documents
  - its Collection is not the library, its Data or its Metrics collection
  - its Collection is not archived, unless the Document is"
  [rows]
  (collection/check-collections-for-model! :model/Document rows))

(mr/def ::write-opts
  "The options of a write function of Documents: `:writer`, who writes when it matters, and the context of its events."
  [:maybe [:map {:closed true}
           [:writer  {:optional true} [:enum :import :revert]]
           [:context {:optional true} [:maybe :metabase.events.schema/context]]]])

(mu/defn create-documents! :- [:sequential (ms/InstanceOf :model/Document)]
  "Insert the Document `rows` and return the inserted instances in the order of the rows, publishing their create event.
  Each Collection must be able to hold a Document."
  [rows :- [:sequential ::documents.schema/document.create]]
  (if (empty? rows)
    []
    (t2/with-transaction [_conn]
      (check-documents (map #(update % :archived boolean) rows))
      (let [documents (documents.db/insert-documents! rows)]
        (events/publish-event! :event/document-create (events/create-event documents))
        documents))))

(defn- changed?
  "Whether `row`, the columns to write, changes the column `k` of `stored`."
  [stored row k]
  (and (contains? row k) (not= (get row k) (get stored k))))

(defn- move-cards!
  "Moves the cards of the Documents with `ids` to `collection-id`."
  [ids collection-id]
  (when-let [card-ids (not-empty (documents.db/card-ids-of-documents ids))]
    (queries.card/update-cards! (mapv (fn [id] {:id id :collection_id collection-id}) card-ids))))

(defn- set-cards-archived!
  "Archives the cards of the Documents with `ids`, which the Document archives, when `archived?`, and restores those that
  its archive took down otherwise, their events carrying `context` or else the archive of the Document."
  [ids archived? context]
  (when-let [card-ids (not-empty (if archived?
                                   (documents.db/card-ids-archived-with-documents ids)
                                   (documents.db/card-ids-restored-with-documents ids)))]
    (queries.card/update-cards! (mapv (fn [id] {:id id :archived archived?}) card-ids) {:context (or context {:archived-with [:model/Document (first ids)]})})))

(defn- move-cards-of-moved!
  "Moves the cards of the Documents of `moved`, rows holding the new `:collection_id`, to it, with one write for each
  Collection."
  [moved]
  (doseq [[collection-id group] (group-by :collection_id moved)]
    (move-cards! (mapv :id group) collection-id)))

(defn- set-cards-archived-of!
  "Archives or restores the cards of the Documents of `rows`, which change `archived`, with one write for each direction."
  [rows context]
  (doseq [[archived? group] (group-by (comp boolean :archived) rows)]
    (set-cards-archived! (mapv :id group) archived? context)))

(defn- derive-archived-directly
  "`rows`, with the `archived_directly` that the write gave each of those that change `archived`, read from `updated`, the
  Documents by id after the write."
  [rows updated]
  (mapv (fn [{:keys [id] :as row}]
          (cond-> row
            (contains? row :archived) (assoc :archived_directly (:archived_directly (get updated id)))))
        rows))

(defn- moved-documents
  "The rows of `rows`, updates of the `stored` Documents, that change `:collection_id`, each with the `archived` state the
  Document is about to have."
  [stored rows]
  (for [row   (filterv #(changed? (get stored (:id %)) % :collection_id) rows)]
    (assoc row :archived (boolean (if (contains? row :archived) (:archived row) (:archived (get stored (:id row))))))))

(defn- check-document-updates
  "Throw a 400 unless every one of `rows`, updates of the `stored` Documents that move, satisfies these rules:

  - its Collection is in a namespace that holds Documents
  - its Collection is not the library, its Data or its Metrics collection
  - its Collection is not archived, unless the Document is"
  [stored rows]
  (check-documents (moved-documents stored rows)))

(defn- write-document-updates!
  "Writes `rows`, updates of the `stored` Documents: moves their cards, writes the columns and archives or restores their
  cards, and returns what the event needs, the changes of each row and the Documents after the write."
  [stored rows opts]
  (move-cards-of-moved! (moved-documents stored rows))
  (doseq [{:keys [id] :as row} rows
          :let [changes (dissoc row :id)]
          :when (seq changes)]
    (documents.db/update-documents! [id] changes))
  (set-cards-archived-of! (filterv #(changed? (get stored (:id %)) % :archived) rows) (:context opts))
  (let [updated (m/index-by :id (documents.db/documents (mapv :id rows)))]
    {:stored stored :rows (derive-archived-directly rows updated)}))

(defn- update-document-batch!
  "Checks and writes the Documents of `batch`, up to one partition of the call, and returns what the event needs."
  [batch opts]
  (let [stored (m/index-by :id (documents.db/documents (mapv :id batch)))
        rows   (filterv #(contains? stored (:id %)) batch)]
    (check-document-updates stored rows)
    (write-document-updates! stored rows opts)))

(defn- publish-document-updates!
  "Publishes the update event of the Documents that `batches`, what [[update-document-batch!]] returned, wrote."
  [batches opts]
  (when (some (comp seq :rows) batches)
    (events/publish-event! :event/document-update
                           (events/update-event (into {} (map :stored) batches)
                                                (into [] (mapcat :rows) batches)
                                                opts))))

(mu/defn update-documents! :- :nil
  "Apply `updates`, each the `:id` of a Document with the columns to give it, in one transaction, publishing their update
  event with the `:context` of `opts`."
  ([updates :- [:sequential ::documents.schema/document.import-row]]
   (update-documents! updates nil))
  ([updates :- [:sequential ::documents.schema/document.import-row]
    opts    :- ::write-opts]
   (t2/with-transaction [_conn]
     (let [batches (mapv #(update-document-batch! % opts) (partition-all app-db/update-partition-size updates))]
       (publish-document-updates! batches opts)))
   nil))

(mu/defn delete-documents! :- :nil
  "Delete the Documents with `ids` in one transaction, publishing their delete event right before the first statement."
  [ids :- [:sequential ms/PositiveInt]]
  (t2/with-transaction [_conn]
    (let [batches (partition-all app-db/delete-partition-size ids)]
      (when (seq batches)
        (events/publish-event! :event/document-delete
                               (events/delete-event (into [] (mapcat #(documents.db/documents (vec %))) batches))))
      (run! #(documents.db/delete-documents! (vec %)) batches)))
  nil)

(def CardCreateSchema
  "Schema for a card created inline with a document (the `cards` map on create/update). The
  card fields are declared locally: the model layer doesn't depend on the REST card schema. `source_card_id`, if
  given, must be a Card the user can read; the new card inherits its timeline selection for permission purposes."
  [:map {:closed true}
   [:name ms/NonBlankString]
   [:dataset_query ::lib-be.schema/maybe-legacy-query]
   [:entity_id {:optional true} [:maybe ms/NonBlankString]]
   [:parameters {:optional true} [:maybe ::parameters.schema/parameters]]
   [:parameter_mappings {:optional true} [:maybe ::parameters.schema/parameter-mappings]]
   [:description {:optional true} [:maybe ms/NonBlankString]]
   [:display ms/NonBlankString]
   [:visualization_settings ::lib.schema.visualization/visualization-settings]
   [:result_metadata {:optional true} [:maybe ::queries.schema/card.result-metadata]]
   [:cache_ttl {:optional true} [:maybe ms/PositiveInt]]
   [:source_card_id {:optional true} [:maybe ms/PositiveInt]]])

(defn- create-card-rows!
  "Creates a Card from each of `rows`, the rows [[queries.card/new-card-row]] gives, reconciling the positions in their
  Collections, in one call of [[queries.card/create-cards!]], and returns the new Cards in order."
  [rows]
  (t2/with-transaction [_conn]
    (run! #(collection/maybe-reconcile-collection-position! (select-keys % [:collection_id :collection_position])) rows)
    (vec (queries.card/create-cards! rows))))

(defn- new-document-card-row
  "The row for [[create-card-rows!]] that `card`, a new Card of a Document, takes for `creator`."
  [card creator]
  (queries.card/new-card-row (assoc card :type :question :dashboard_id nil) (:id creator)))

(defn clone-card!
  "Saves a copy of an existing card the user can already read, e.g. when embedding it into a document.

  Checks nothing about the user: the caller has run [[check-clone-cards!]], which checks create access to the target
  collection but, unlike the checks of new cards, not the authoring checks (run permission on the query, parameter
  source-card and parameter field permissions), since the query and parameters come from an existing card the caller
  passed a read check on rather than from the request (UXW-5037)."
  [source-card creator]
  (first (create-card-rows! [(new-document-card-row source-card creator)])))

(mu/defn update-cards-in-ast :- [:map [:document :any]
                                 [:content_type :string]]
  "Rewrite the card FK (`[:attrs \"id\"]`) of every cardEmbed node found in `card-id-map`.
  Touches nothing else on the node — in particular a node's `:_id` never changes here."
  [document :- [:map {:closed true}
                [:document ::documents.schema/document.document]
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
   creator :- :metabase.users.schema/user]
  (when (seq cards-to-create)
    (let [entries (mapv (fn [[original-key card-data]]
                          ;; Merge document info into card data
                          ;; Cards inherit document's collection_id if not explicitly specified
                          {:key            original-key
                           :source-card-id (:source_card_id card-data)
                           :data           (-> card-data
                                               (dissoc :source_card_id)
                                               (assoc :document_id document-id)
                                               (cond-> (nil? (:collection_id card-data))
                                                 (assoc :collection_id document-collection-id)))})
                        cards-to-create)
          created (create-card-rows! (mapv #(new-document-card-row (:data %) creator) entries))]
      (zipmap (map :key entries) (map :id created)))))

(mu/defn clone-cards-in-document! :- [:map-of ms/PositiveInt ms/PositiveInt]
  "Finds all cards in the document that are not associated with the document and clones the cards.

  Args:
  - document: the document model to clone cards within

  Returns:
  - map of old-card-id -> cloned-card-id"
  [{:keys [id collection_id] :as document} :- ::documents.schema/document]
  (let [card-ids (prose-mirror/collect-ast document #(when (and (= prose-mirror/card-embed-type (:type %))
                                                                (pos-int? (:id (:attrs %))))
                                                       (:id (:attrs %))))
        to-clone (when (seq card-ids)
                   (documents.db/cards-not-in-document card-ids id))
        sources  (mapv #(assoc % :document_id id :collection_id collection_id) to-clone)
        created  (when (seq sources)
                   (create-card-rows! (mapv #(new-document-card-row % @api/*current-user*) sources)))]
    (zipmap (map :id sources) (map :id created))))

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

(mu/defn create-document-with-cards!
  "Create a Document, clone any embedded cards the document doesn't own, and return the id of the created Document.
  Permission checks (`api/create-check`) and the read of the result ([[get-document]]) are the caller's job."
  [{:keys [name document collection_id collection_position cards]}
   :- [:map {:closed true}
       [:name documents.schema/DocumentName]
       [:document ::documents.schema/document.document]
       [:collection_id {:optional true} [:maybe ms/PositiveInt]]
       [:collection_position {:optional true} [:maybe ms/PositiveInt]]
       [:cards {:optional true} [:maybe [:map-of [:int {:max -1}] CardCreateSchema]]]]]
  (t2/with-transaction [_conn]
    (when collection_position
      (collection/maybe-reconcile-collection-position! {:collection_id collection_id
                                                        :collection_position collection_position}))
    (let [document-id (:id (first (create-documents! [{:name name
                                                       :collection_id collection_id
                                                       :collection_position collection_position
                                                       :document document
                                                       :content_type prose-mirror/prose-mirror-content-type
                                                       :creator_id api/*current-user-id*}])))
          cards-to-update-in-ast (merge (clone-cards-in-document! {:id document-id
                                                                   :collection_id collection_id
                                                                   :document document
                                                                   :content_type prose-mirror/prose-mirror-content-type})
                                        (when-not (empty? cards)
                                          (create-cards-for-document! cards document-id collection_id @api/*current-user*)))]
      (when (seq cards-to-update-in-ast)
        (update-documents! [(assoc (update-cards-in-ast
                                    {:document document
                                     :content_type prose-mirror/prose-mirror-content-type}
                                    cards-to-update-in-ast) :id document-id)]))
      document-id)))

(mu/defn update-document-with-cards!
  "Apply `body` (any of `:name`, `:document`, `:collection_id`, `:collection_position`,
  `:cards`, `:archived`) to `existing-document`, clone any newly-embedded cards the document
  doesn't own, and return the updated document. Permission checks (write-check, archived state,
  collection-move) are the caller's job, run before this — the same split the REST
  `PUT /api/document/:id` handler uses."
  [existing-document :- ::documents.schema/document
   {:keys [name document collection_id collection_position cards] :as body}
   :- [:map {:closed true}
       [:name {:optional true} documents.schema/DocumentName]
       [:document {:optional true} ::documents.schema/document.document]
       [:collection_id {:optional true} [:maybe ms/PositiveInt]]
       [:collection_position {:optional true} [:maybe ms/PositiveInt]]
       ;; Any int key, matching the REST `DocumentUpdateOptions` this backs: with no `:document`
       ;; in the body the map is ignored entirely, and [[create-cards-for-document!]] still holds
       ;; the actually-consumed keys to negative ints.
       [:cards {:optional true} [:maybe [:map-of :int CardCreateSchema]]]
       [:archived {:optional true} [:maybe :boolean]]]]
  (let [document-id (:id existing-document)
        document-updates (dissoc (api/updates-without-collection-when-archiving existing-document body) :cards)
        ;; The frontend omits `:collection_id` when saving an existing document, so fall back to the document's
        ;; current collection rather than root.
        target-collection-id (if (contains? body :collection_id)
                               collection_id
                               (:collection_id existing-document))]
    (t2/with-transaction [_conn]
      (when collection_position
        (collection/maybe-reconcile-collection-position! (select-keys existing-document [:collection_id :collection_position])
                                                         {:collection_id       target-collection-id
                                                          :collection_position collection_position}))
      (let [card-id-map (when document
                          (merge
                           (clone-cards-in-document! (assoc existing-document :document document))
                           (when-not (empty? cards)
                             (create-cards-for-document! cards document-id target-collection-id @api/*current-user*))))
            draft-card-id-map (into {} (filter (comp neg? key) card-id-map))
            pairings (draft-stored-result-pairings document
                                                   (:content_type existing-document)
                                                   draft-card-id-map)]
        (update-documents! [(assoc (cond-> document-updates
                                     document (merge (update-cards-in-ast
                                                      {:document document
                                                       :content_type (:content_type existing-document)}
                                                      card-id-map))
                                     name (assoc :name name)
                                     (contains? body :collection_id) (assoc :collection_id collection_id)
                                     ;; First body save clears the auto-created Summary placeholder flag.
                                     (and (:is_placeholder existing-document)
                                          (contains? body :document))
                                     (assoc :is_placeholder false)) :id document-id)])
        (when (seq pairings)
          (card/carry-pairings-for-document! document-id pairings))))
    (hydrate-document document-id)))

(mu/defn increment-view-counts! :- :int
  "Add, for each `[count ids]` entry of `count->ids`, `count` to the `view_count` of the Documents with `ids`, in one plain
  statement that publishes no event: a usage stat no rule reads. Returns the number updated."
  [count->ids :- [:map-of ms/PositiveInt [:sequential ms/PositiveInt]]]
  (documents.db/increment-document-view-counts! count->ids))

(mu/defn set-last-viewed-at! :- :int
  "Set `last_viewed_at` of the Document with `id`, through the model, returning the number updated. The testing API backdates
  it."
  [id   :- ms/PositiveInt
   time :- ms/TemporalInstant]
  (t2/with-transaction [_conn]
    (let [previous (documents.db/document id)
          updated  (documents.db/set-document-last-viewed-at! id time)]
      (when previous
        (events/publish-event! :event/document-update
                               (events/update-event {id previous} [{:id id :last_viewed_at time}])))
      updated)))

(defmethod collection/shift-positions-in-collection! :model/Document
  [_model collection-id positions direction]
  (documents.db/shift-document-positions! collection-id positions direction))

(mu/defn revert-document! :- :int
  "Write the revision `snapshot` to the Document with `id` in one statement without the cascades of an update."
  [id        :- ms/PositiveInt
   _user-id  :- [:maybe ::lib.schema.id/user]
   snapshot  :- ::documents.schema/document.revision]
  (t2/with-transaction [_conn]
    (let [previous (documents.db/document id)
          updated  (documents.db/update-document-columns! id snapshot)]
      (when previous
        (events/publish-event! :event/document-update
                               (events/update-event {id previous} [(assoc snapshot :id id)]
                                                    {:writer :revert})))
      updated)))

(defmethod collection/archive-in-collections! :model/Document
  [model collection-ids opts]
  (when-let [ids (not-empty (collection/item-ids-to-archive model collection-ids))]
    (update-documents! (mapv (fn [id] {:id id :archived true}) ids) opts)))

(defmethod collection/restore-in-collections! :model/Document
  [model collection-ids opts]
  (when-let [ids (not-empty (collection/item-ids-to-restore model collection-ids))]
    (update-documents! (mapv (fn [id] {:id id :archived false}) ids) opts)))

;;; ---------- Specs ---------------------------------------------------------------------------------------------

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
   :export-dependencies documents.serialization/export-dependencies
   :insert!             create-documents!
   :update!             #(do (update-documents! % {:writer :import}) %)
   :delete!             delete-documents!})

(defmethod remote-sync/spec :model/Document
  [_model]
  {:synced-items         documents.db/synced-document-items
   :synced-filter-clause documents.db/synced-documents-clause})

(defmethod revisions/spec :model/Document [_model]
  {:track   [:name :document :content_type :exploration_id :is_placeholder :archived :archived_directly]
   :skip    [:collection_id :collection_position :creator_id :entity_id :last_viewed_at :made_public_by_id
             :public_uuid :public_uuid_prefix :view_count]
   :schema  ::documents.schema/document.revision
   :revert! revert-document!})

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
