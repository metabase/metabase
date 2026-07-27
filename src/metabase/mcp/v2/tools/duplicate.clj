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
   [metabase.mcp.scope :as mcp.scope]
   [metabase.mcp.v2.common :as common]
   [metabase.mcp.v2.registry :as registry]
   [metabase.metabot.scope :as metabot.scope]
   [metabase.queries.core :as queries]
   [metabase.util.i18n :refer [tru]]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------- per-type copies ----------------------------------------------

(def ^:private card-type->tool-type
  {:question "question" :model "model" :metric "metric"})

(defn- fetch-question
  [id-or-eid]
  (let [card   (common/resolve-and-read :model/Card id-or-eid
                                        (fn [id] (api/read-check (t2/select-one :model/Card :id id))))
        actual (card-type->tool-type (:type card))]
    (when (not= actual "question")
      (common/throw-teaching-error
       (format "Card %s is a %s — duplicate_content supports type \"question\" only." (:id card) actual)))
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
  (common/resolve-and-read :model/Dashboard id-or-eid
                           (fn [id] (api/read-check (t2/select-one :model/Dashboard :id id)))))

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
  (common/resolve-and-read :model/Document id-or-eid
                           (fn [id] (api/read-check (t2/select-one :model/Document :id id :archived false)))))

(defn- copy-document!
  [document collection-id new-name]
  (documents/copy-document! (:id document) {:name new-name :collection_id collection-id}))

(def ^:private type->spec
  "Per-type fetch, copy, and the create scope duplicating that type requires — duplicating is
   creating, so the tool's own scope is not enough on its own."
  {"question"  {:fetch fetch-question
                :scope metabot.scope/agent-question-create
                :copy! (fn [source collection-id new-name _deep-copy?]
                         (copy-question! source collection-id new-name))}
   "dashboard" {:fetch fetch-dashboard
                :scope metabot.scope/agent-dashboard-create
                :copy! copy-dashboard!}
   "document"  {:fetch fetch-document
                :scope metabot.scope/agent-document-create
                :copy! (fn [source collection-id new-name _deep-copy?]
                         (copy-document! source collection-id new-name))}})

;;; ---------------------------------------------------- handler ---------------------------------------------------

(defn- check-type-scope!
  [token-scopes type scope]
  (when-not (mcp.scope/matches? token-scopes scope)
    (throw (ex-info (format "Duplicating %s content requires the %s scope, which this token was not granted."
                            type scope)
                    {:status-code 403}))))

(defn- destination-collection-id
  "The copy's collection: the caller's `collection_id` when they passed one (`\"root\"` included),
   otherwise the source's own collection — \"duplicate\" without a destination means \"right here\",
   not \"in the root collection\"."
  [args source]
  (if (contains? args :collection_id)
    (common/resolve-collection-id (:collection_id args))
    (:collection_id source)))

(def ^:private duplicate-content-args-schema
  [:map {:closed true}
   [:type [:enum {:description "The kind of content to copy. Card flavors other than question (model, metric) aren't supported yet."}
           "question" "dashboard" "document"]]
   [:id [:or
         [:int {:description "Numeric id of the item to copy."}]
         [:string {:min 1 :description "A 21-character entity_id of the item to copy."}]]]
   [:collection_id {:optional true}
    [:maybe [:or
             [:int {:description "Collection to copy into. Omit to copy into the source's own collection; pass \"root\" for the root collection."}]
             [:string {:min 1 :description "A 21-character collection entity_id, or \"root\"."}]]]]
   [:new_name {:optional true}
    [:maybe [:string {:min 1 :description "Name for the copy. Defaults to \"Copy of <source name>\"."}]]]
   [:is_deep_copy {:optional true}
    [:maybe [:boolean {:description "Dashboards only: also copy the dashboard's questions into the destination collection, instead of pointing the copy at the originals."}]]]])

(registry/deftool duplicate-content
  "Copy a question, dashboard, or document into a collection — cheaper and safer than reading the original and re-creating it, and it preserves everything the read projections leave out. Pass type, id (numeric or 21-char entity_id), and optionally collection_id (omit to copy into the source's own collection; \"root\" for the root collection) and new_name (defaults to \"Copy of <source name>\"). is_deep_copy is dashboards-only: false (the default) makes the copy point at the original's questions, true duplicates those questions into the destination collection as well — a dashboard that holds questions saved inside it can only be copied with is_deep_copy: true. A deep copy reports any cards it had to leave behind as `uncopied` (you can read the original but not copy it into the destination). Duplicating is creating: besides this tool's own scope, each type requires its own create scope, and you need curate permission on the destination collection."
  {:name        "duplicate_content"
   :scope       metabot.scope/agent-content-duplicate
   :extra-scopes [metabot.scope/agent-question-create metabot.scope/agent-dashboard-create
                  metabot.scope/agent-document-create]
   :annotations {:readOnlyHint false :destructiveHint false}
   :args        duplicate-content-args-schema}
  [{:keys [type id new_name is_deep_copy] :as args} {:keys [token-scopes]}]
  (let [{:keys [fetch scope copy!]} (type->spec type)]
    (check-type-scope! token-scopes type scope)
    (when (and (some? is_deep_copy) (not= type "dashboard"))
      (common/throw-teaching-error
       (format "`is_deep_copy` applies to dashboards only — omit it when duplicating a %s." type)))
    (let [source        (fetch id)
          collection-id (destination-collection-id args source)
          copy          (copy! source collection-id (or new_name (tru "Copy of {0}" (:name source)))
                               (boolean is_deep_copy))]
      (common/success-content
       (cond-> {:type          type
                :id            (:id copy)
                :name          (:name copy)
                :collection_id (:collection_id copy)}
         (seq (:uncopied copy))
         (assoc :uncopied (mapv #(select-keys % [:id :name]) (:uncopied copy))))))))
