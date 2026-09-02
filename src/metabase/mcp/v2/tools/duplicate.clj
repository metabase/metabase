(ns metabase.mcp.v2.tools.duplicate
  "The v2 MCP `duplicate_content` tool: copy a question, dashboard, or document into a collection.

   The input contract doesn't vary with type, but the backing does — a dashboard copy takes name,
   collection, and the deep-copy flag; a document copy takes name and collection; a card copy takes
   neither, so the new name and collection are folded into the create itself. The tool absorbs that
   difference so one call is one copy, and the caller never has to follow a copy with a move."
  (:require
   [metabase.api.common :as api]
   [metabase.dashboards.write :as dashboards.write]
   [metabase.documents.core :as documents]
   [metabase.mcp.v2.common :as common]
   [metabase.mcp.v2.registry :as registry]
   [metabase.mcp.v2.resolve :as v2.resolve]
   [metabase.mcp.v2.write :as v2.write]
   [metabase.metabot.scope :as metabot.scope]
   [metabase.queries.core :as queries]
   [metabase.util.i18n :refer [tru]]))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------- per-type copies ----------------------------------------------

(defn- check-not-archived!
  "Refuse a trashed source. Archived content keeps its real `collection_id` (the trash is
   presentational), and neither copy path carries `:archived` over — so duplicating a trashed item
   would resurrect it as a live copy in the collection it was trashed from. Runs after the read
   check, so an unreadable source still collapses to not-found rather than admitting it exists."
  [model item]
  (when (:archived item)
    (common/throw-teaching-error
     (format "%s %s is in the trash — restore it before duplicating." (name model) (:id item))))
  item)

(defn- fetch-question
  [id-or-eid]
  (let [card   (->> (v2.resolve/resolve-and-read :model/Card id-or-eid)
                    (check-not-archived! :model/Card))]
    (when (not= :question (:type card))
      (common/throw-teaching-error
       (format "Card %s is a %s — duplicate_content supports type \"question\" only."
               (:id card) (name (:type card)))))
    card))

(defn- copy-question!
  "Create the card copy directly rather than copying then moving: `POST /api/card/:id/copy` takes no
   arguments, so a two-step copy would leave a wrongly-named card behind on any failure. Clears
   `dashboard_id`/`document_id` — the copy is a standalone question in `collection-id`, not a second
   card saved inside the source's dashboard or document."
  [card collection-id new-name]
  (let [new-card (-> card
                     (assoc :name new-name :collection_id collection-id)
                     (dissoc :dashboard_id :document_id :collection_position))]
    (queries/check-allowed-to-create-card! new-card (:type card))
    (queries/create-card! new-card @api/*current-user*)))

(defn- fetch-dashboard
  [id-or-eid]
  (->> (v2.resolve/resolve-and-read :model/Dashboard id-or-eid)
       (check-not-archived! :model/Dashboard)))

(defn- copy-dashboard!
  [dashboard collection-id new-name deep-copy?]
  (when (and (not deep-copy?) (dashboards.write/contains-dashboard-questions? (:id dashboard)))
    (common/throw-teaching-error
     "This dashboard has questions saved inside it, so it can't be copied without them — pass is_deep_copy: true to copy the questions too."))
  (dashboards.write/copy-dashboard! (:id dashboard)
                                    {:name          new-name
                                     :collection_id collection-id
                                     :is_deep_copy  deep-copy?}))

(defn- fetch-document
  [id-or-eid]
  ;; Selected without an `:archived false` filter so a trashed-but-readable document earns the
  ;; teaching error below rather than the not-found collapse, which would wrongly imply the caller
  ;; can't see it.
  (->> (v2.resolve/resolve-and-read :model/Document id-or-eid)
       (check-not-archived! :model/Document)))

(defn- copy-document!
  [document collection-id new-name]
  (documents/copy-document! (:id document) {:name new-name :collection_id collection-id}))

(def ^:private type->spec
  "Per-type fetch and copy. GHY-4225 collapsed the per-type create scopes into the single
   `agent:content:write` this tool already gates on, so there is no longer a second scope to check."
  {"question"  {:fetch fetch-question
                :copy! (fn [source collection-id new-name _deep-copy?]
                         (copy-question! source collection-id new-name))}
   "dashboard" {:fetch fetch-dashboard
                :copy! copy-dashboard!}
   "document"  {:fetch fetch-document
                :copy! (fn [source collection-id new-name _deep-copy?]
                         (copy-document! source collection-id new-name))}})

;;; ---------------------------------------------------- handler ---------------------------------------------------

(defn- destination-collection-id
  "The copy's collection: the caller's `collection_id` when they passed one (`\"root\"` included),
   otherwise the caller's personal collection."
  [args]
  (v2.resolve/resolve-collection-id-or-personal (:collection_id args)))

(def ^:private duplicate-content-args-schema
  [:map {:closed true}
   [:type [:enum {:description "The kind of content to copy. Card flavors other than question (model, metric) aren't supported yet."}
           "question" "dashboard" "document"]]
   [:id [:or
         [:int {:description "Numeric id of the item to copy."}]
         [:string {:min 1 :description "A 21-character entity_id of the item to copy."}]]]
   [:collection_id {:optional true}
    [:maybe [:or
             [:int {:description "Collection to copy into. Omit to copy into your personal collection; pass \"root\" for the root collection."}]
             [:string {:min 1 :description "A 21-character collection entity_id, or \"root\"."}]]]]
   [:new_name {:optional true}
    [:maybe [:string {:min 1 :description "Name for the copy. Defaults to \"Copy of <source name>\"."}]]]
   [:is_deep_copy {:optional true}
    [:maybe [:boolean {:description "Dashboards only: also copy the dashboard's questions into the destination collection, instead of pointing the copy at the originals."}]]]])

(registry/deftool duplicate-content
  "Copy a question, dashboard, or document into a collection — cheaper and safer than reading the original and re-creating it, and it preserves everything the read projections leave out. Pass type, id (numeric or 21-char entity_id), and optionally collection_id (omit to copy into your personal collection; \"root\" for the root collection) and new_name (defaults to \"Copy of <source name>\"). is_deep_copy is dashboards-only: false (the default) makes the copy point at the original's questions, true duplicates those questions into the destination collection as well — a dashboard that holds questions saved inside it can only be copied with is_deep_copy: true. A deep copy reports any cards it had to leave behind as `uncopied` — cards you can't read (reported as an id alone) or that are in the trash; the copy simply omits them. Duplicating is creating: besides this tool's own scope, each type requires its own create scope, and you need curate permission on the destination collection. The copy's name and collection come back only when your token also holds agent:content:read; without it the response is a minimal acknowledgement."
  {:name            "duplicate_content"
   :scope           metabot.scope/agent-content-write
   :annotations     {:readOnlyHint false :destructiveHint false}
   :args            duplicate-content-args-schema}
  [{:keys [type id new_name is_deep_copy] :as args} {:keys [token-scopes]}]
  (let [{:keys [fetch copy!]} (type->spec type)]
    (when (and (some? is_deep_copy) (not= type "dashboard"))
      (common/throw-teaching-error
       (format "`is_deep_copy` applies to dashboards only — omit it when duplicating a %s." type)))
    (let [source        (fetch id)
          collection-id (destination-collection-id args)
          copy          (copy! source collection-id (or new_name (tru "Copy of {0}" (:name source)))
                               (boolean is_deep_copy))]
      (common/success-content
       ;; `new_name` defaults to "Copy of <source name>", so echoing the copy's name hands back the
       ;; source's — the same read the read tools would refuse this token.
       (v2.write/readback token-scopes [metabot.scope/agent-content-read]
                          (cond-> {:type          type
                                   :id            (:id copy)
                                   :name          (:name copy)
                                   :collection_id (:collection_id copy)}
                            (seq (:uncopied copy))
                            (assoc :uncopied (mapv #(select-keys % [:id :name]) (:uncopied copy)))))))))
