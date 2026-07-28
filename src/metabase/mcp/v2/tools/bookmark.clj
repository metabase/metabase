(ns metabase.mcp.v2.tools.bookmark
  "The v2 MCP `bookmark_content` tool: per-user favorites. Bookmarks are their own REST resource
   (`/api/bookmark/:model/:id`) keyed by a (model, id) tuple rather than a row id, so they can't
   ride a `_write` tool — hence a tool of their own, with `bookmarked: true|false` in place of
   `method`.

   Unlike REST, both directions are idempotent: bookmarking something already bookmarked, and
   un-bookmarking something that isn't, both succeed. An agent that can't observe its own prior
   calls would otherwise have to guess, and the REST 400 teaches it nothing it can act on.

   The three card flavors (question/model/metric) share the REST model `card`; the tool still
   takes them apart so a type/flavor mismatch is caught here rather than silently bookmarking the
   wrong kind of thing.

   Both directions read-check the item, where REST only read-checks the create. Un-bookmarking
   something the caller can no longer read is thus a not-found here — the tool resolves entity_ids
   and echoes the item's name, and neither can happen across the permission boundary without
   turning the response into an existence oracle."
  (:require
   [metabase.api.common :as api]
   [metabase.bookmarks.api :as bookmarks.api]
   [metabase.mcp.v2.common :as common]
   [metabase.mcp.v2.registry :as registry]
   [metabase.metabot.scope :as metabot.scope]))

(set! *warn-on-reflection* true)

(def ^:private type->spec
  "Per-type dispatch: the Toucan model the id resolves against, the REST bookmark model string
   (the three card flavors share `card`), and the card `:type` a card-backed entry must have."
  {"question"   {:model :model/Card       :bookmark-model "card"       :card-type :question}
   "model"      {:model :model/Card       :bookmark-model "card"       :card-type :model}
   "metric"     {:model :model/Card       :bookmark-model "card"       :card-type :metric}
   "dashboard"  {:model :model/Dashboard  :bookmark-model "dashboard"}
   "collection" {:model :model/Collection :bookmark-model "collection"}
   "document"   {:model :model/Document   :bookmark-model "document"}})

(def ^:private content-types
  (vec (sort (keys type->spec))))

(def ^:private card-type->tool-type
  {:question "question" :model "model" :metric "metric"})

(defn- fetch-item
  "Resolve `id-or-eid` for `type` behind the same read check `POST /api/bookmark/:model/:id` runs,
   and return the row. A card whose flavor doesn't match `type` is a teaching error naming the
   right type."
  [type id-or-eid]
  (let [{:keys [model card-type]} (type->spec type)
        row (common/resolve-and-read model id-or-eid #(api/read-check model %))]
    (when card-type
      (let [actual (card-type->tool-type (:type row))]
        (when (not= actual type)
          (common/throw-teaching-error
           (format "Card %s is a %s — bookmark it with type: \"%s\"." (:id row) actual actual)))))
    row))

(def ^:private bookmark-content-args-schema
  [:map {:closed true}
   [:type (into [:enum {:description "The content type, as returned by search/browse_collection."}]
                content-types)]
   [:id [:or
         [:int {:description "Numeric id."}]
         [:string {:min 1 :description "A 21-character entity_id."}]]]
   [:bookmarked [:boolean {:description "true bookmarks the item, false removes the bookmark."}]]])

(registry/deftool bookmark-content
  "Add or remove a bookmark on content for the calling user — the same starred/favorites list the Metabase sidebar shows. Pass type (question, model, metric, dashboard, collection, or document), id (numeric or 21-char entity_id), and bookmarked: true to bookmark or false to un-bookmark. Both directions are idempotent: bookmarking something already bookmarked, or un-bookmarking something that isn't, succeeds and reports the resulting state. Bookmarks are per-user and grant no access — the item must already be readable by the caller."
  {:name        "bookmark_content"
   :scope       metabot.scope/agent-bookmark-write
   :annotations {:readOnlyHint false :destructiveHint false :idempotentHint true}
   :args        bookmark-content-args-schema}
  [{:keys [type id bookmarked]} _context]
  (let [row            (fetch-item type id)
        bookmark-model (get-in type->spec [type :bookmark-model])
        user-id        api/*current-user-id*]
    (if bookmarked
      (bookmarks.api/bookmark! bookmark-model (:id row) user-id)
      (bookmarks.api/un-bookmark! bookmark-model (:id row) user-id))
    (common/success-content {:type type :id (:id row) :name (:name row) :bookmarked bookmarked})))
