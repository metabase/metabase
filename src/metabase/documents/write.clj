(ns metabase.documents.write
  "The full write of a Document with the Cards embedded in it, as the REST endpoints and the MCP and Metabot tools make it."
  (:require
   [metabase.api.common :as api]
   [metabase.documents.db :as documents.db]
   [metabase.documents.models.document :as m.document]
   [metabase.documents.prose-mirror :as prose-mirror]
   [metabase.documents.schema :as documents.schema]
   [metabase.events.core :as events]
   [metabase.lib-be.schema :as lib-be.schema]
   [metabase.lib.schema.visualization :as lib.schema.visualization]
   [metabase.parameters.params :as params]
   [metabase.parameters.schema :as parameters.schema]
   [metabase.queries.core :as card]
   [metabase.queries.schema :as queries.schema]
   [metabase.query-permissions.core :as query-perms]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

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
    (m.document/with-content-gate-cache
      (reduce (fn [accum card]
                (api/read-check card)
                (assoc accum
                       (:id card)
                       (:id (clone-card! (assoc card :document_id id :collection_id collection_id)
                                         @api/*current-user*))))
              {}
              (t2/hydrate to-clone :can_read)))))

(defn- insert-card-embed!
  "Persist an embed for `card-id` into document `document-id`, re-reading the document inside the
  transaction so a concurrent edit cannot be overwritten. Returns the updated row, unchecked."
  [document-id card-id position extra-attrs]
  (let [updated (events/with-batched-events
                  (let [document (api/check-404 (documents.db/document document-id))
                        updated  (prose-mirror/insert-card-embed document card-id position extra-attrs)
                        updates  (cond-> (select-keys updated [:document])
                                   (:is_placeholder document) (assoc :is_placeholder false))]
                    (documents.db/update-document! document-id updates)
                    (merge document updates)))]
    updated))

(defn add-card-to-document!
  "Insert an embed for the already-created card with `card-id` into the prose-mirror ast of the
  document with `document-id` and persist it. `position` is a 0-based index among the document's
  top-level blocks; `nil` appends the embed at the end and out-of-range indexes are clamped.

  Optional kwargs:
  - `:extra-attrs` — map merged onto the `cardEmbed` attrs (e.g. `:stored_result_id`,
    `:chart_href`, `:child_target_id`, `:host_data`).

  Adding a card clears `:is_placeholder` when it was set. The caller is responsible for
  write-checking the document first. The document is re-read inside the transaction so a
  concurrent edit cannot be overwritten. Returns the updated document, hydrated as by
  [[m.document/get-document]]; [[add-card-to-document-row!]] skips the hydration."
  [document-id card-id position & {:keys [extra-attrs]}]
  (insert-card-embed! document-id card-id position extra-attrs)
  (m.document/get-document document-id :log-view? false))

(defn add-card-to-document-row!
  "[[add-card-to-document!]] for callers that don't need the hydrated document result."
  [document-id card-id position & {:keys [extra-attrs]}]
  (api/read-check (insert-card-embed! document-id card-id position extra-attrs)))

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
                             (m.document/get-document document-id)))]
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
    (m.document/hydrate-document document-id)))

(mu/defn- copy-cards-for-document! :- [:map-of ms/PositiveInt ms/PositiveInt]
  "Copies all cards that belong to the source document to the new document.

  Args:
  - source-document-id: ID of the document being copied
  - new-document-id: ID of the newly created document
  - new-collection-id: Collection ID for the new cards

  Returns:
  - Map of old-card-id -> new-card-id"
  [source-document-id :- ms/PositiveInt
   new-document-id :- ms/PositiveInt
   new-collection-id :- [:or :nil ms/PositiveInt]]
  (let [cards-to-copy (documents.db/cards-for-document source-document-id)]
    (reduce (fn [accum card]
              ;; The document_id FK can outlive a card's presence in the document body, and the card may sit in a
              ;; collection the caller cannot read. Read-check each card before copying, mirroring
              ;; `clone-cards-in-document!`.
              (api/read-check card)
              (let [new-card (clone-card! (-> card
                                              (dissoc :id :entity_id :created_at :updated_at :creator_id
                                                      :public_uuid :made_public_by_id :cache_invalidated_at)
                                              (assoc :document_id new-document-id
                                                     :collection_id new-collection-id))
                                          @api/*current-user*)]
                (when (or (:archived card) (:archived_directly card))
                  (documents.db/update-card! (:id new-card)
                                             {:archived          (boolean (:archived card))
                                              :archived_directly (boolean (:archived_directly card))}))
                (assoc accum (:id card) (:id new-card))))
            {}
            (t2/hydrate cards-to-copy :can_read))))

(defn copy-document!
  "Copies the document with `from-document-id` into `:collection_id` (nil is the root) along with the questions saved
  inside it and returns the new document, requiring read permission on the source and create permission on the
  destination collection."
  [from-document-id {:keys [name collection_id collection_position]}]
  (api/create-check :model/Document {:collection_id collection_id})
  (let [existing-document (api/check-404
                           (api/read-check
                            (documents.db/unarchived-document from-document-id)))
        document-data {:name                (or name (:name existing-document))
                       :document            (:document existing-document)
                       :content_type        (:content_type existing-document)
                       :creator_id          api/*current-user-id*
                       :collection_id       collection_id
                       :collection_position collection_position}
        new-document (events/with-batched-events
                       (when collection_position
                         (api/maybe-reconcile-collection-position! (select-keys document-data [:collection_id :collection_position])))
                       (let [new-document-id (documents.db/insert-document! document-data)
                             card-id-map (copy-cards-for-document! from-document-id new-document-id collection_id)]
                         (when (seq card-id-map)
                           (documents.db/update-document! new-document-id
                                                          (update-cards-in-ast
                                                           {:document (:document existing-document)
                                                            :content_type (:content_type existing-document)}
                                                           card-id-map)))
                         (m.document/get-document new-document-id)))]
    new-document))

(defn delete-document!
  "Permanently delete the archived `document`, which the caller write-checked."
  [{:keys [id archived]}]
  (when-not archived
    (let [msg (tru "Document must be archived before it can be deleted.")]
      (throw (ex-info msg {:status-code 400, :errors {:archived msg}}))))
  (documents.db/delete-document! id))

(defn create-public-link!
  "The public UUID of the Document with `document-id`, generated for `user-id` in one transaction when it has none, so concurrent requests agree."
  [document-id user-id]
  (t2/with-transaction [_conn]
    (or (documents.db/document-public-uuid document-id)
        (do
          (documents.db/update-document! document-id
                                         {:public_uuid       (str (random-uuid))
                                          :made_public_by_id user-id})
          (documents.db/document-public-uuid document-id)))))

(defn delete-public-link!
  "Remove the public UUID of the Document with `document-id`."
  [document-id]
  (documents.db/update-document! document-id
                                 {:public_uuid       nil
                                  :made_public_by_id nil}))
