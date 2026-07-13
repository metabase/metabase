(ns metabase.agent-api.tools
  "Shared authoring harness for v2 MCP tool endpoints.

   A v2 tool is a thin `defendpoint` with `:tool` metadata plus a delegation to a domain
   function. Everything a tool needs to honor the v2 conventions — the `_write` method-enum
   recipe, `response_format` projections, bounded list envelopes with steering truncation, the
   complete-units-then-named-remainder budgeter, teaching errors, and ref ergonomics — lives here
   so the tool endpoints stay uniform instead of each reinventing them.

   Layering: this is the handler-facing half of the harness, required by the agent-api endpoints
   that run under the caller's real user. The transport-facing half (the two-channel MCP result and
   `input_examples` publication) lives in [[metabase.mcp.tools]] and
   [[metabase.api.macros.defendpoint.tools-manifest]]. Handlers produce projected, enveloped bodies;
   the MCP layer serializes them."
  (:require
   [metabase.api.common :as api]
   [metabase.eid-translation.core :as eid-translation]
   [metabase.events.core :as events]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.json :as json]
   [metabase.util.malli.schema :as ms]))

(set! *warn-on-reflection* true)

;;; ──────────────────────────────────────────────────────────────────
;;; Teaching errors
;;; ──────────────────────────────────────────────────────────────────
;;
;; Every failure names the fix — the missing field, the permission to request, the tool to call
;; instead — so the model self-corrects from the message alone. Thrown as an `ex-info` carrying a
;; `:status-code`; the agent-api boundary turns it into a plain error body, and the MCP layer
;; surfaces the message as in-band tool-call error content.

(defn teaching-error
  "Throw an in-band tool error whose `message` names the fix. `status` defaults to 400; pass 403 for
   permission denials. Extra `data` is merged into the ex-data for logging."
  ([message] (teaching-error message 400 nil))
  ([message status] (teaching-error message status nil))
  ([message status data]
   (throw (ex-info (str message) (merge {:status-code status} data)))))

(defn permission-error
  "Throw a 403 teaching error naming the permission the caller lacks and how to get unblocked."
  [message]
  (teaching-error message 403))

(defn check-exactly-one!
  "Enforce that exactly one of the mutually-exclusive keys `ks` is present (non-nil) in `params`,
   returning `params` on success. Strict clients reject a top-level `oneOf`, so an \"exactly one of
   X | Y\" contract (e.g. `query` vs `query_handle`) is a runtime rule, not a schema combinator. The
   teaching error names the keys either way — nothing given or too much given."
  [params ks]
  (let [present (filterv #(some? (get params %)) ks)
        names   (->> ks (map #(str "`" (name %) "`")) (interpose ", ") (apply str))]
    (cond
      (empty? present)
      (teaching-error (tru "Provide exactly one of {0}." names))

      (< 1 (count present))
      (teaching-error (tru "Provide only one of {0}, not several together." names))

      :else params)))

;;; ──────────────────────────────────────────────────────────────────
;;; Composed writes
;;; ──────────────────────────────────────────────────────────────────
;;
;; A workflow tool (`dashboard_write`'s ops, say) is a sequence of domain calls, each carrying the
;; same permission check the public endpoint carries. Ops apply in order and the first failure aborts
;; the whole call — a half-applied layout is worse than none — naming the failing op's index, so the
;; model fixes that one op instead of re-sending the batch blind.

(defn run-ops!
  "Apply `op-fn` to each op in `ops`, in order, returning the vector of results. The first op that
   throws aborts with a teaching error naming its index and the underlying message, preserving the
   original `:status-code`. Run this inside a transaction so an abort leaves nothing half-applied."
  [ops op-fn]
  (into []
        (map-indexed
         (fn [i op]
           (try
             (op-fn op)
             (catch Exception e
               (teaching-error (tru "Op {0} failed: {1}" i (ex-message e))
                               (:status-code (ex-data e) 400)
                               {:op-index i})))))
        ops))

;;; ──────────────────────────────────────────────────────────────────
;;; Read events
;;; ──────────────────────────────────────────────────────────────────
;;
;; A tool read leaves the same trail a browser read leaves: view_log rows, view counts, and
;; recent-items entries all hang off the `:event/*-read` topics, and `search`'s recent mode reads
;; them back. A read tool therefore publishes the event its entity's REST read endpoint publishes,
;; with the same payload — the handlers are shared, and a divergent payload fails the topic's closed
;; schema.

(def ^:private read-event-topics
  "Model → the `:event/*-read` topic that model's REST read endpoint publishes.

   Cards are absent by design: a card's REST read publishes nothing. `:event/card-read` comes from
   the query processor when a card is *run*, so `run_saved_question` records the view on its own and
   a card metadata read is as invisible to view_log here as it is in the app."
  {:model/Collection :event/collection-read
   :model/Dashboard  :event/dashboard-read
   :model/Document   :event/document-read
   :model/Table      :event/table-read})

(def ^:private object-payload-topics
  "Topics whose closed schema carries the whole instance rather than its id, because their handlers
   read more than the id off it — the table handler needs `:db_id` for its access check."
  #{:event/collection-read :event/table-read})

(defn publish-read-event!
  "Publish the read event for `object`, an instance of `model` that a read tool just fetched, and
   return `object` so it threads. Models whose REST read endpoint publishes nothing have no entry in
   [[read-event-topics]] and no event."
  [model object]
  (when-let [topic (read-event-topics model)]
    (events/publish-event! topic
                           (if (object-payload-topics topic)
                             {:object    object          :user-id api/*current-user-id*}
                             {:object-id (u/the-id object) :user-id api/*current-user-id*})))
  object)

;;; ──────────────────────────────────────────────────────────────────
;;; Ref ergonomics
;;; ──────────────────────────────────────────────────────────────────
;;
;; Refs widen the accepted *values* of an id argument; they never rename the property. Any `*_id`
;; takes a numeric id or a 21-char entity_id; `collection_id`/`parent_id` also take `null`/`"root"`;
;; `"trash"` is a locator-only value (never a write target — archival is `archived: true`).

(def IdRef
  "Malli schema for any `*_id` argument: a numeric id or a 21-char entity_id. The `[:or …]` sits in a
   property value, where the manifest keeps it as `anyOf` (strict clients accept nested composites)."
  [:or ms/PositiveInt ms/NanoIdString])

(def CollectionRef
  "Malli schema for a collection write target: numeric id, entity_id, or the `\"root\"` token. Pair
   with `[:maybe …]` on the endpoint to also accept `null` (the root collection). `\"trash\"` is not a
   write target — archival is `archived: true`."
  [:or ms/PositiveInt ms/NanoIdString [:= "root"]])

(def CollectionLocator
  "Malli schema for a collection *locator* argument (e.g. `browse_collection`'s `id`): numeric id,
   entity_id, or the `\"root\"`/`\"trash\"` tokens. Locators read; they do not write, so `\"trash\"` is
   allowed here and nowhere else."
  [:or ms/PositiveInt ms/NanoIdString [:= "root"] [:= "trash"]])

(defn- entity-id-string?
  [v]
  (boolean (and (string? v) (re-matches #"[A-Za-z0-9_\-]{21}" v))))

(defn classify-ref
  "Classify a ref value into a tagged map so a handler can dispatch resolution without re-parsing:
   `{:kind :id :id n}`, `{:kind :entity-id :entity-id s}`, `{:kind :root}`, `{:kind :trash}`, or
   `{:kind :null}` for `nil`. Resolving an entity_id to a numeric id is per-entity (it needs the
   model), so that stays with the caller — this only names what was passed."
  [v]
  (cond
    (nil? v)                {:kind :null}
    (integer? v)            {:kind :id :id v}
    (= v "root")            {:kind :root}
    (= v "trash")           {:kind :trash}
    (entity-id-string? v)   {:kind :entity-id :entity-id v}
    :else                   (teaching-error
                             (tru "Invalid reference {0}: expected a numeric id or a 21-character entity_id."
                                  (pr-str v)))))

(defn resolve-id
  "The numeric id a ref names: an integer passes through, a 21-character entity_id is translated against
   `model`, and one that names nothing is a 404. `nil` stays `nil`, so an absent optional id argument
   threads through untouched. This is what lets a tool accept whichever identifier `search` handed the
   agent without the agent having to translate it first."
  [model ref]
  (case (:kind (classify-ref ref))
    :null      nil
    :id        ref
    :entity-id (eid-translation/->id-or-404 model ref)
    (teaching-error (tru "{0} is not a valid id here: pass a numeric id or a 21-character entity_id."
                         (pr-str ref)))))

;;; ──────────────────────────────────────────────────────────────────
;;; The `_write` method-enum recipe
;;; ──────────────────────────────────────────────────────────────────
;;
;; GitHub's shipped `issue_write` shape: one flat schema with `method: "create" | "update"`. Only
;; `method` (plus any universally-required field) is schema-required; per-method requirements live in
;; the parameter descriptions and are enforced here at runtime with teaching errors. The schema stays
;; flat so strict clients accept it, and there is no top-level `oneOf`/`anyOf` for the model to
;; mangle.

(def write-methods
  "The two `method` values every `<entity>_write` tool accepts."
  #{"create" "update"})

(def MethodField
  "Malli entry for the shared, schema-required `method` field of an `<entity>_write` endpoint. The
   only truly-required field on a write tool; per-method requirements are runtime-enforced by
   [[validate-write!]]. Put this (and any universal field) in the endpoint's required set; mark every
   other field `{:optional true} [:maybe …]`."
  [:enum "create" "update"])

(defn- missing?
  [params k]
  (nil? (get params k)))

(defn validate-write!
  "Enforce an `<entity>_write` call's per-method requirements at runtime, returning `params` on
   success so it threads. `requirements` maps each method to the fields required for it, e.g.
   `{\"create\" [:name :query] \"update\" []}`. `update` always also requires `id`. A missing field
   raises a teaching error naming the field and method (\"name is required for the create method\")."
  [{:keys [method] :as params} requirements]
  (when-not (write-methods method)
    (teaching-error
     (tru "method must be one of {0}." "\"create\", \"update\"")))
  (when (and (= method "update") (missing? params :id))
    (teaching-error (tru "id is required for the update method.")))
  (doseq [field (get requirements method)
          :when (missing? params field)]
    (teaching-error
     (tru "{0} is required for the {1} method." (name field) method)))
  params)

;;; ──────────────────────────────────────────────────────────────────
;;; response_format projections
;;; ──────────────────────────────────────────────────────────────────
;;
;; Every read tool takes `response_format: "concise" | "detailed"` (default concise). A projection is
;; a *subset of the REST response with identical property names* — no renames, no invented vocabulary
;; — so a read round-trips into a write.

(def response-formats
  "The two `response_format` values every read tool accepts."
  #{"concise" "detailed"})

(def ResponseFormatField
  "Malli entry for the shared, optional `response_format` param. Defaults to concise when absent."
  [:maybe [:enum "concise" "detailed"]])

(defn detailed?
  "Whether `response-format` selects the detailed projection. Absent/`nil` and `\"concise\"` are
   concise; only `\"detailed\"` is detailed."
  [response-format]
  (= "detailed" response-format))

(defn project
  "Project one REST `record` to its concise or detailed field set, selecting REST property names
   verbatim. `spec` is `{:concise [ks…] :detailed [ks…]}`; the detailed set defaults to the whole
   record when `:detailed` is absent. Nil `response-format` is concise."
  [response-format spec record]
  (if (detailed? response-format)
    (if-let [ks (:detailed spec)]
      (select-keys record ks)
      record)
    (select-keys record (:concise spec))))

(defn project-all
  "Project a sequence of `records` — see [[project]]."
  [response-format spec records]
  (mapv #(project response-format spec %) records))

;;; ──────────────────────────────────────────────────────────────────
;;; Bounded list envelope + steering truncation
;;; ──────────────────────────────────────────────────────────────────
;;
;; List reads return the literal envelope `{data, returned, total?, truncated?}`, sized well under
;; Claude Code's 25K-token cap. Pagination is `limit`/`offset`, REST-verbatim. When a page is cut, the
;; truncation message names the narrowing parameter and the next offset so the model knows exactly how
;; to continue.

(def token-cap
  "Hard token ceiling for a single tool response (Claude Code's cap). A response budgeter aims well
   under this."
  25000)

(def token-warn
  "Soft token budget: aim under this so a response leaves headroom under [[token-cap]]."
  10000)

(defn estimate-tokens
  "Rough token estimate for an already-data value: its JSON encoding at ~4 characters per token. Good
   enough to steer truncation; never a billing figure."
  [v]
  (quot (count (json/encode v)) 4))

(defn truncation-message
  "Build a steering message naming the narrowing parameter(s) and the next offset. `total` and
   `returned` size the set; `noun` names the items (\"tables\"); `scope` is an optional qualifier
   (\"in schema `public`\"); `narrow-with` is a seq of parameter names that shrink the set; `offset`
   and `limit`, when given, add the next-page hint. `total` may be absent — a fused ranking is a union
   of several ranked windows and counts nothing — and then the message sizes only what was returned."
  [{:keys [total returned noun scope narrow-with offset limit]}]
  (let [head    (if total
                  (str total " " noun (when scope (str " " scope)) " — showing " returned)
                  (str "Showing " returned " " noun (when scope (str " " scope))))
        narrow  (when (seq narrow-with)
                  (str "narrow with "
                       (->> narrow-with (map #(str "`" (name %) "`")) (interpose ", ") (apply str))))
        paging  (when (and offset limit)
                  (str "page with `offset: " (+ offset limit) "`"))
        actions (->> [narrow paging] (remove nil?) (interpose " or ") (apply str))]
    (if (seq actions)
      (str head ". " actions ".")
      head)))

(defn list-envelope
  "Build the bounded list envelope. `data` is the (already-projected) page. Options:
   `:total` — the full count when known; `:truncation-message` — a steering string that marks the page
   truncated and tells the model how to continue. Keys the model doesn't need are omitted, not nulled."
  ([data] (list-envelope data nil))
  ([data {:keys [total truncation-message]}]
   (cond-> {:data     (vec data)
            :returned (count data)}
     (some? total)       (assoc :total total)
     truncation-message  (assoc :truncated true :truncation_message truncation-message))))

;;; ──────────────────────────────────────────────────────────────────
;;; Complete-units-then-named-remainder budgeter
;;; ──────────────────────────────────────────────────────────────────
;;
;; For reads that take explicit ids rather than a page (`get_fields`, `get_content`), a silent
;; mid-unit cut is a correctness bug: a truncated column list reads as "that's all the columns" and
;; corrupts the query the agent writes next. So the rule is complete units until the budget runs out,
;; then name the omitted ones — never half a unit. `get_fields`' one-table-over-budget slice is a
;; separate, explicit path the caller handles.

(defn budget-units
  "Emit complete `units` in order until `:token-budget` (default [[token-warn]]) is exhausted, then
   stop and name the rest. Returns `{:included [unit…] :omitted [unit…] :truncated? bool}`. `:size-fn`
   estimates a unit's token cost (default [[estimate-tokens]]). At least one unit is always included,
   so a single over-budget unit surfaces (the caller decides whether to slice it explicitly)."
  [units {:keys [token-budget size-fn]
          :or   {token-budget token-warn size-fn estimate-tokens}}]
  (loop [remaining units
         spent     0
         included  []]
    (if (empty? remaining)
      {:included included :omitted [] :truncated? false}
      (let [unit       (first remaining)
            cost       (long (size-fn unit))
            next-spent (+ spent cost)]
        (if (or (empty? included) (<= next-spent token-budget))
          (recur (rest remaining) next-spent (conj included unit))
          {:included included :omitted (vec remaining) :truncated? true})))))
