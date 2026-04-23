(ns metabase.documents.card-ops
  "Card-level helpers shared between the document API and the collab
   persistence extension. Extracted here so the collab save path can reuse
   the same clone/update logic the API endpoints run on POST/PUT, without
   pulling the API namespace (and its routing surface) into the collab
   thread pool."
  (:require
   [metabase.api.common :as api]
   [metabase.documents.prose-mirror :as prose-mirror]
   [metabase.queries.core :as card]
   [metabase.query-permissions.core :as query-perms]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(defn create-card!
  "Checks that the query is runnable by the current user then saves."
  [{query :dataset_query :as the-card} creator]
  (query-perms/check-run-permissions-for-query query)
  (card/create-card! (assoc the-card :type :question :dashboard_id nil) creator))

(mu/defn update-cards-in-ast :- [:map [:document :any]
                                 [:content_type :string]]
  "Walk the prose-mirror AST on `document` and rewrite every cardEmbed
   `:attrs :id` that appears in `card-id-map`."
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

(mu/defn clone-cards-in-document! :- [:map-of ms/PositiveInt ms/PositiveInt]
  "Finds all cards referenced in the document's AST that are not yet
   associated with the document and clones them. Returns a map of
   `old-card-id -> cloned-card-id`.

   `opts` may contain:
   - `:on-card-error` — `(fn [card ^Throwable e] ...)` invoked when either
     the per-card read-check or the clone insert fails. Default rethrows,
     which matches the API behavior (a failed clone aborts the whole save).
     The collab path passes a log-and-skip handler so one bad card can't
     break the debounced save cycle for all edits."
  ([document]
   (clone-cards-in-document! document nil))
  ([{:keys [id collection_id] :as document}
    {:keys [on-card-error] :as _opts}]
   (let [card-ids (prose-mirror/collect-ast
                   document
                   #(when (and (= prose-mirror/card-embed-type (:type %))
                               (pos? (-> % :attrs :id)))
                      (-> % :attrs :id)))
         to-clone (when (seq card-ids)
                    (t2/select :model/Card {:where [:and [:in :id card-ids]
                                                    [:or [:<> :document_id id]
                                                     [:= :document_id nil]]]}))
         on-err   (or on-card-error (fn [_card ^Throwable e] (throw e)))]
     (reduce (fn [accum the-card]
               (try
                 (api/read-check the-card)
                 (assoc accum
                        (:id the-card)
                        (:id (create-card! (assoc the-card :document_id id :collection_id collection_id)
                                           @api/*current-user*)))
                 (catch Throwable t
                   (on-err the-card t)
                   accum)))
             {}
             to-clone))))

(mu/defn copy-cards-for-document! :- [:map-of ms/PositiveInt ms/PositiveInt]
  "Copies all cards that belong to the source document to the new document.
   Returns a map of `old-card-id -> new-card-id`."
  [source-document-id :- ms/PositiveInt
   new-document-id :- ms/PositiveInt
   new-collection-id :- [:or :nil ms/PositiveInt]]
  (let [cards-to-copy (t2/select :model/Card :document_id source-document-id)]
    (reduce (fn [accum the-card]
              (let [new-card (create-card! (-> the-card
                                               (dissoc :id :entity_id :created_at :updated_at :creator_id
                                                       :public_uuid :made_public_by_id :cache_invalidated_at)
                                               (assoc :document_id new-document-id
                                                      :collection_id new-collection-id))
                                           @api/*current-user*)]
                (when (or (:archived the-card) (:archived_directly the-card))
                  (t2/update! :model/Card (:id new-card)
                              {:archived          (boolean (:archived the-card))
                               :archived_directly (boolean (:archived_directly the-card))}))
                (assoc accum (:id the-card) (:id new-card))))
            {}
            cards-to-copy)))
