(ns metabase.documents.models.document
  (:require
   [metabase.api.common :as api]
   [metabase.collections.models.collection :as collection]
   [metabase.documents.db :as documents.db]
   [metabase.documents.prose-mirror :as prose-mirror]
   [metabase.documents.schema :as documents.schema]
   [metabase.documents.serialization :as documents.serialization]
   [metabase.events.core :as events]
   [metabase.lib-be.schema :as lib-be.schema]
   [metabase.lib.schema.visualization :as lib.schema.visualization]
   [metabase.models.interface :as mi]
   [metabase.parameters.params :as params]
   [metabase.parameters.schema :as parameters.schema]
   [metabase.public-sharing.core :as public-sharing]
   [metabase.queries.core :as card]
   [metabase.queries.schema :as queries.schema]
   [metabase.query-permissions.core :as query-perms]
   [metabase.remote-sync.core :as remote-sync]
   [metabase.revisions.core :as revisions]
   [metabase.search.config :as search.config]
   [metabase.search.spec :as search.spec]
   [metabase.serialization.core :as serialization]
   [metabase.settings.core :as setting]
   [metabase.staleness.core :as staleness]
   [metabase.util :as u]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.json :as json]
   [metabase.util.malli :as mu]
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
  (derive :hook/entity-id)
  (derive :hook/events))

(defmethod events/spec :model/Document
  [_model]
  {:create :event/document-create
   :update :event/document-update
   :delete :event/document-delete})

(defmethod revisions/spec :model/Document [_model]
  {:track [:name :document :content_type :exploration_id :is_placeholder :archived :archived_directly]
   :skip  [:collection_id :collection_position :creator_id :entity_id :last_viewed_at :made_public_by_id
           :public_uuid :public_uuid_prefix :view_count]})

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

;;; ---------- Write orchestration -------------------------------------------------------------------------------

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

(defn- create-card!
  "The single choke point every document card-creation path (create, update, copy) funnels through. Runs the same
  checks `POST /api/card` runs before saving: create access to the target collection, run permission on the query,
  read access to any card the parameters draw values from, and query permission on the fields the parameter targets
  name."
  [{query :dataset_query :as card} creator]
  (api/create-check :model/Card card)
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
  [source-card creator]
  (card/with-copy-source-card source-card
    (api/create-check :model/Card source-card))
  (card/create-card! (assoc source-card :type :question :dashboard_id nil) creator))

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
    (reduce-kv
     (fn [result-map original-key card-data]
       (let [source-card-id   (:source_card_id card-data)
             ;; Merge document info into card data
             ;; Cards inherit document's collection_id if not explicitly specified
             merged-card-data (-> card-data
                                  (dissoc :source_card_id)
                                  (assoc :document_id document-id)
                                  (cond-> (nil? (:collection_id card-data))
                                    (assoc :collection_id document-collection-id)))
             new-card         (card/with-copy-source-card (some->> source-card-id (api/read-check :model/Card))
                                (create-card! merged-card-data creator))]
         (assoc result-map original-key (:id new-card))))
     {}
     cards-to-create)))

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
                   (documents.db/cards-not-in-document card-ids id))]
    (with-content-gate-cache
      (reduce (fn [accum card]
                (api/read-check card)
                (assoc accum
                       (:id card)
                       (:id (clone-card! (assoc card :document_id id :collection_id collection_id)
                                         @api/*current-user*))))
              {}
              (t2/hydrate to-clone :can_read)))))

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
  "Create a Document, clone any embedded cards the document doesn't own, and return the created document. Permission checks
  (`api/create-check`) are the caller's job, run before this — the same split the REST
  `POST /api/document/` handler uses."
  [{:keys [name document collection_id collection_position cards]}
   :- [:map {:closed true}
       [:name documents.schema/DocumentName]
       [:document ::documents.schema/document.document]
       [:collection_id {:optional true} [:maybe ms/PositiveInt]]
       [:collection_position {:optional true} [:maybe ms/PositiveInt]]
       [:cards {:optional true} [:maybe [:map-of [:int {:max -1}] CardCreateSchema]]]]]
  (let [created-document (events/with-batched-events
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
                             ;; `get-document`, so `:event/document-read` fires: the creator has to find the
                             ;; document they just made in their recents, and that row is written only by this
                             ;; event's handler. Creating is arguably not viewing — but the view count and
                             ;; `view_log` row it also writes are the cost of the recents entry until the two
                             ;; are decoupled; suppressing the event silently drops the document out of the
                             ;; command palette (UXW-1786).
                             ;;
                             ;; The read check inside it still has to run: `can-read?` on a Document is
                             ;; collection permissions *and* the content gate, and the gate adjudicates the
                             ;; warehouse data the body embeds, so a document the creator may not read must not
                             ;; come back rendered.
                             (get-document document-id)))]
    created-document))

(mu/defn update-document!
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
    (events/with-batched-events
      (when collection_position
        (api/maybe-reconcile-collection-position! (select-keys existing-document [:collection_id :collection_position])
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
          (card/carry-pairings-for-document! document-id pairings))))
    (hydrate-document document-id)))

;;; ---------- Serialization -------------------------------------------------------------------------------------

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

;;; ---------- Remote sync ---------------------------------------------------------------------------------------

(defmethod remote-sync/spec :model/Document
  [_model]
  {:synced-items         documents.db/synced-document-items
   :synced-filter-clause documents.db/synced-documents-clause})

;;; ---------- Search --------------------------------------------------------------------------------------------

(defn- document->search-text
  "Extract the plain searchable text from a document's prose-mirror body for the search index.

  Receives the raw `:document` value as it comes off the ingestion query (a JSON string), which it parses and
  normalizes before `ast->text` reads it. Returns nil if it can't be parsed, so a
  malformed/oversized body never blocks the rest of the document (e.g. its name) from being indexed."
  [document]
  (when document
    (try
      (-> (cond-> document (string? document) json/decode+kw)
          prose-mirror/normalize-document
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

;;; ------------------------------------------------- Staleness ---------------------------------------------------

(defmethod staleness/find-stale-query :model/Document
  [_model args]
  ^:allow-subquery
  {:select [:document.id
            [(h2x/literal "Document") :model]
            [:document.name :name]
            ;; last_viewed_at is NOT NULL (default current_timestamp), so it's storage noise for a
            ;; never-viewed doc — null the anchor when view_count = 0 to keep "never used" distinguishable.
            [[:case [:= :document.view_count [:inline 0]] nil :else :document.last_viewed_at] :last_used_at]
            :document.collection_id]
   :from :document
   :left-join [:collection [:= :collection.id :document.collection_id]]
   :where [:and
           [:= :document.archived false]
           ;; stale = not viewed since the cutoff, OR never viewed and created before the cutoff.
           [:or
            [:<= :document.last_viewed_at (-> args :cutoff-date)]
            [:and
             [:= :document.view_count 0]
             [:<= :document.created_at (-> args :cutoff-date)]]]
           ;; only regular user collections (type nil), not system collections like
           ;; `instance-analytics`, `trash`, or the `library` collections.
           [:= :collection.type nil]
           (when (setting/get :enable-public-sharing)
             [:= :document.public_uuid nil])
           (staleness/collection-filter :document.collection_id args)]})
