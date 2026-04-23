(ns metabase.documents.collab.persistence
  "YHocuspocus `DatabaseExtension` backed by the `document.ydoc` column plus
   a derived ProseMirror-JSON mirror in the existing `document.document`
   column. Both columns are written in a single transaction so viewers of
   `/api/document/:id` never see them drift.

   Writes deliberately skip the `:model/Document` `define-after-update` hook
   (which syncs associated cards on every update — unnecessary and expensive
   for ydoc-only writes that fire every few seconds during active editing).
   The `:event/document-update` event is re-emitted here explicitly so
   downstream consumers still observe the change.

   `loadFromDatabase` hydrates from the ProseMirror-JSON column when there is
   no ydoc yet, so documents created before collab existed automatically
   seed an empty-but-correct YDoc on first connect."
  (:require
   [clojure.string :as str]
   [metabase.documents.card-ops :as card-ops]
   [metabase.documents.collab.prose-mirror :as collab.prose-mirror]
   [metabase.documents.prose-mirror :as prose-mirror]
   [metabase.events.core :as events]
   [metabase.request.session :as request.session]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [toucan2.core :as t2])
  (:import
   (java.util.concurrent CompletableFuture)
   (net.carcdr.ycrdt YDoc YTransaction YXmlElement YXmlFragment)
   (net.carcdr.yhocuspocus.extension DatabaseExtension OnStoreDocumentPayload)))

(set! *warn-on-reflection* true)

(def ^:private document-prefix "document:")
(def ^:private fragment-name "default")
(def ^:private card-embed-tag "cardEmbed")

(defn parse-doc-name
  "Parse a yhocuspocus document name like `document:<entity-id>` into
   `{:type :document :entity-id ...}`. Throws `ex-info` for unknown prefixes
   so new protocols (future `card:<id>`, etc.) surface explicitly."
  [s]
  (cond
    (or (nil? s) (not (string? s)) (str/blank? s))
    (throw (ex-info "document name is required"
                    {:doc-name s}))

    (str/starts-with? s document-prefix)
    (let [entity-id (subs s (count document-prefix))]
      (if (str/blank? entity-id)
        (throw (ex-info "document name missing entity-id"
                        {:doc-name s}))
        {:type :document :entity-id entity-id}))

    :else
    (throw (ex-info "unsupported document name prefix"
                    {:doc-name s :known-prefixes #{document-prefix}}))))

(defn- load-snapshot
  "Return the document's Y-CRDT state bytes. If no ydoc has been saved yet
   but the document has existing ProseMirror JSON, synthesize bytes from the
   JSON so the first collab session seeds correctly. Returns nil for unknown
   entity-ids and for empty-or-missing documents."
  ^bytes [entity-id]
  (let [{:keys [ydoc document]} (t2/select-one [:model/Document :ydoc :document]
                                               :entity_id entity-id)]
    (or ydoc
        (when (seq document)
          (collab.prose-mirror/pm-json->ydoc-bytes document)))))

(defn- save-snapshot!
  "Dual-write the ydoc bytes + derived ProseMirror JSON in a single
   transaction. UPDATE + SELECT wrapped together so the event payload always
   reflects the post-update state.

   Don't use the UPDATE row-count to decide whether to emit the event — on
   MySQL with default driver settings, an UPDATE that sets identical bytes
   reports 0 affected rows. The SELECT inside the transaction is the
   authoritative existence check."
  [entity-id ^bytes state-bytes]
  (let [pm-json   (collab.prose-mirror/ydoc-bytes->pm-json state-bytes)
        pm-string (json/encode pm-json)]
    (t2/with-transaction [_conn]
      (t2/query-one {:update :document
                     :set    {:ydoc       state-bytes
                              :document   pm-string
                              :updated_at :%now}
                     :where  [:= :entity_id entity-id]})
      (when-let [doc (t2/select-one :model/Document :entity_id entity-id)]
        (events/publish-event! :event/document-update {:object doc})))))

(defn- rewrite-card-embed-attrs!
  "Recursive walk helper for [[rewrite-card-embed-ids!]]. Requires an already
   open write transaction. `visit` is applied to the element itself and its
   descendants."
  [^YXmlElement el ^YTransaction txn id-map]
  (when (= card-embed-tag (.getTag el))
    (when-let [new-id (get id-map (.getAttribute el txn "id"))]
      (.setAttribute el txn "id" new-id)))
  (dotimes [i (.childCount el txn)]
    (let [child (.getChild el txn i)]
      (when (instance? YXmlElement child)
        (rewrite-card-embed-attrs! ^YXmlElement child txn id-map)))))

(defn- rewrite-card-embed-ids!
  "Walk the `\"default\"` YXmlFragment tree of `ydoc` and rewrite any
   `cardEmbed` element's `id` attribute according to `id-map`
   (old-card-id → new-card-id, integers). All writes happen inside a single
   `YTransaction` so the update observer fires once regardless of how many
   elements were rewritten — one broadcast per batch, not N.

   The fragment is acquired *before* `beginTransaction`; calling
   `getXmlFragment` while a write transaction is already open deadlocks
   because the lookup tries to start its own implicit transaction.

   ycrdt v0.2+ preserves attr types, so the `id` attribute read back from
   yrs is a `Long` when set as a number. Clojure's numeric equality lets
   us look up in the int-keyed `id-map` directly without stringifying."
  [^YDoc ydoc id-map]
  (when (seq id-map)
    (with-open [^YXmlFragment frag (.getXmlFragment ydoc fragment-name)
                ^YTransaction txn  (.beginTransaction ydoc)]
      ;; YXmlFragment exposes only a 1-arg getChild; descend into each
      ;; top-level element with the txn-taking overload on YXmlElement.
      (dotimes [i (.length frag txn)]
        (let [child (.getChild frag i)]
          (when (instance? YXmlElement child)
            (rewrite-card-embed-attrs! ^YXmlElement child txn id-map)))))))

(defn- compute-clone-id-map
  "Run the card-cloning step for a collab save. Returns a map of
   `{old-id → new-id}` for every external card referenced by `pm-json` that
   was successfully cloned. Permission errors on a single card are logged
   and skipped so a broken embed does not abort the debounced save."
  [{doc-id :id collection-id :collection_id} pm-json]
  (card-ops/clone-cards-in-document!
   {:id doc-id
    :collection_id collection-id
    :document pm-json
    :content_type prose-mirror/prose-mirror-content-type}
   {:on-card-error
    (fn [the-card ^Throwable t]
      (log/warnf t "collab: skipping clone of card %s (doc %s)"
                 (:id the-card) doc-id))}))

(defn- persist-post-clone-state!
  "Second half of [[save-with-cloning!]]: re-encode the ydoc, derive the PM
   JSON mirror, update the row, emit the event."
  [entity-id ^YDoc ydoc id-map pm-json]
  (let [fresh-state (.encodeStateAsUpdate ydoc)
        fresh-pm    (if (seq id-map)
                      (collab.prose-mirror/ydoc-bytes->pm-json fresh-state)
                      pm-json)
        pm-string   (json/encode fresh-pm)]
    (t2/query-one {:update :document
                   :set    {:ydoc       fresh-state
                            :document   pm-string
                            :updated_at :%now}
                   :where  [:= :entity_id entity-id]})
    (when-let [doc (t2/select-one :model/Document :entity_id entity-id)]
      (events/publish-event! :event/document-update {:object doc}))))

(defn- save-with-cloning!
  "Collab save path. Runs the clone step under the user's auth context
   (matching the non-collab API behavior), rewrites `cardEmbed.id` attrs in
   the live YDoc so connected clients converge via yhocuspocus's update
   observer, then persists the post-rewrite state + derived PM JSON. All
   DB work runs in one transaction so a mid-flight failure rolls back both
   the new card rows and the snapshot."
  [entity-id user-id ^YDoc ydoc]
  (request.session/with-current-user user-id
    (t2/with-transaction [_conn]
      (let [doc     (t2/select-one [:model/Document :id :collection_id]
                                   :entity_id entity-id)
            pm-json (collab.prose-mirror/ydoc-bytes->pm-json
                     (.encodeStateAsUpdate ydoc))
            id-map  (when (:id doc)
                      (compute-clone-id-map doc pm-json))]
        (when (seq id-map)
          (rewrite-card-embed-ids! ydoc id-map))
        (persist-post-clone-state! entity-id ydoc id-map pm-json)))))

(defn- on-store-document!
  "Body of the [[DatabaseExtension]]'s `onStoreDocument` hook. Pulled out of
   the proxy so the proxy stays a thin dispatch shell. Runs on the
   yhocuspocus executor; blocking is safe."
  [^OnStoreDocumentPayload payload]
  (try
    (let [ctx      (.getContext payload)
          user-id  (.get ctx "userId")
          doc-name (.getDocumentName payload)
          ydoc     (.getDoc (.getDocument payload))
          {:keys [entity-id]} (parse-doc-name doc-name)]
      (if user-id
        (save-with-cloning! entity-id user-id ydoc)
        (save-snapshot! entity-id (.encodeStateAsUpdate ydoc))))
    (catch Throwable t
      (log/warnf t "collab: onStoreDocument failed for %s"
                 (.getDocumentName payload))
      (throw t))))

(defn create-persistence-extension
  "Build a `DatabaseExtension` proxy that yhocuspocus calls to load and save
   Y-CRDT state. yhocuspocus runs these on its executor; blocking is safe.

   `onStoreDocument` is overridden so we can access the connection context
   (for the `userId` stashed at ws upgrade) and the live `YDocument`, which
   are both dropped by the inherited `DatabaseExtension.onStoreDocument`
   default. We need them to run the card-clone logic under the user's auth
   context and to rewrite the YDoc's `cardEmbed.id` attrs in place (the live
   rewrite fires the update observer, so connected clients converge without
   extra broadcast plumbing).

   When the context has no `userId` — e.g. the unload path invokes
   `storeDocument` with an empty context — we fall back to the plain
   `save-snapshot!` path with no cloning."
  ^DatabaseExtension []
  (proxy [DatabaseExtension] []
    (loadFromDatabase [^String doc-name]
      (try
        (let [{:keys [entity-id]} (parse-doc-name doc-name)]
          (load-snapshot entity-id))
        (catch Throwable t
          (log/warnf t "collab: loadFromDatabase failed for %s" doc-name)
          (throw t))))
    (saveToDatabase [^String doc-name ^bytes state]
      (try
        (let [{:keys [entity-id]} (parse-doc-name doc-name)]
          (save-snapshot! entity-id state))
        (catch Throwable t
          (log/warnf t "collab: saveToDatabase failed for %s" doc-name)
          (throw t))))
    (onStoreDocument [^OnStoreDocumentPayload payload]
      (CompletableFuture/runAsync
       ^Runnable (^:once fn* [] (on-store-document! payload))))))
