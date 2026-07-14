(ns metabase.agent-api.tools
  "Shared authoring harness for v2 MCP tool endpoints.

   A v2 tool is a thin `defendpoint` with `:tool` metadata plus a delegation to a domain function.
   Everything a tool needs to honor the v2 conventions — `response_format` projections, `fields`
   dot-path picks, the bounded list envelope with its response budget and steering truncation, the
   complete-units-then-named-remainder budgeter, teaching errors, and ref ergonomics — lives here so
   the tool endpoints stay uniform instead of each reinventing them.

   Layering: this is the handler-facing half of the harness, required by the agent-api endpoints that
   run under the caller's real user. The transport-facing half (the two-channel MCP result and
   `input_examples` publication) lives in [[metabase.mcp.tools]] and
   [[metabase.api.macros.defendpoint.tools-manifest]]. Handlers produce projected, enveloped bodies; the
   MCP layer serializes them.

   Model-facing strings here are instructions to a model, not human-visible copy, so they are English and
   untranslated. `tru`/`deferred-tru` belongs on the surfaces a person reads — toolset labels, setting
   descriptions."
  (:require
   [clojure.string :as str]
   [metabase.api.common :as api]
   [metabase.eid-translation.core :as eid-translation]
   [metabase.events.core :as events]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(set! *warn-on-reflection* true)

;;; ──────────────────────────────────────────────────────────────────
;;; Teaching errors
;;; ──────────────────────────────────────────────────────────────────
;;
;; Every failure names the fix — the missing field, the permission to request, the tool to call instead —
;; so the model self-corrects from the message alone. Thrown as an `ex-info` carrying a `:status-code`;
;; the agent-api boundary turns it into a plain error body, and the MCP layer surfaces the message as
;; in-band tool-call error content.

(defn teaching-error!
  "Throw an in-band tool error whose `message` names the fix. `status` defaults to 400; pass 403 for
   permission denials, 404 for an id that names nothing. Extra `data` is merged into the ex-data for
   logging."
  ([message] (teaching-error! message 400 nil))
  ([message status] (teaching-error! message status nil))
  ([message status data]
   (throw (ex-info (str message) (merge {:status-code status} data)))))

(defn check-exactly-one!
  "Enforce that exactly one of the mutually-exclusive keys `ks` is present (non-nil) in `params`,
   returning `params` on success. Strict clients reject a top-level `oneOf`, so an \"exactly one of
   X | Y\" contract (e.g. `query` vs `query_handle`) is a runtime rule, not a schema combinator. The
   teaching error names the keys either way — nothing given or too much given."
  [params ks]
  (let [present (filterv #(some? (get params %)) ks)
        names   (->> ks (map #(str "`" (name %) "`")) (str/join ", "))]
    (cond
      (empty? present)
      (teaching-error! (str "Provide exactly one of " names "."))

      (< 1 (count present))
      (teaching-error! (str "Provide only one of " names ", not several together."))

      :else params)))

;;; ──────────────────────────────────────────────────────────────────
;;; Read events
;;; ──────────────────────────────────────────────────────────────────
;;
;; A tool read leaves the same trail a browser read leaves: view_log rows, view counts, and recent-items
;; entries all hang off the `:event/*-read` topics, and `search`'s recent mode reads them back. A read
;; tool therefore publishes the event its entity's REST read endpoint publishes, with the same payload —
;; the handlers are shared, and a divergent payload fails the topic's closed schema.

(def ^:private read-event-topics
  "Model → the `:event/*-read` topic that model's REST read endpoint publishes.

   Cards are absent by design: a card's REST read publishes nothing. `:event/card-read` comes from the
   query processor when a card is *run*, so `run_saved_question` records the view on its own and a card
   metadata read is as invisible to view_log here as it is in the app."
  {:model/Collection :event/collection-read
   :model/Dashboard  :event/dashboard-read
   :model/Document   :event/document-read
   :model/Table      :event/table-read})

(def ^:private object-payload-topics
  "Topics whose closed schema carries the whole instance rather than its id, because their handlers read
   more than the id off it — the table handler needs `:db_id` for its access check."
  #{:event/collection-read :event/table-read})

(defn publish-read-event!
  "Publish the read event for `object`, an instance of `model` that a read tool just fetched, and return
   `object` so it threads. Models whose REST read endpoint publishes nothing have no entry in
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
;; Refs widen the accepted *values* of an id argument; they never rename the property. Any `*_id` takes a
;; numeric id or a 21-char entity_id; a collection locator also takes `"root"` and `"trash"`.

(def IdRef
  "Malli schema for any `*_id` argument: a numeric id or a 21-char entity_id. The `[:or …]` sits in a
   property value, where the manifest keeps it as `anyOf` (strict clients accept nested composites)."
  [:or ms/PositiveInt ms/NanoIdString])

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
   `{:kind :null}` for `nil`. Resolving an entity_id to a numeric id is per-entity (it needs the model),
   so that stays with the caller — this only names what was passed."
  [v]
  (cond
    (nil? v)              {:kind :null}
    (integer? v)          {:kind :id :id v}
    (= v "root")          {:kind :root}
    (= v "trash")         {:kind :trash}
    (entity-id-string? v) {:kind :entity-id :entity-id v}
    :else                 (teaching-error!
                           (str "Invalid reference " (pr-str v)
                                ": expected a numeric id or a 21-character entity_id."))))

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
    (teaching-error! (str (pr-str ref)
                          " is not a valid id here: pass a numeric id or a 21-character entity_id."))))

;;; ──────────────────────────────────────────────────────────────────
;;; response_format projections
;;; ──────────────────────────────────────────────────────────────────
;;
;; Every read tool takes `response_format: "concise" | "detailed"` (default concise). A projection is a
;; *subset of the REST response with identical property names* — no renames, no invented vocabulary — so a
;; read round-trips into a write.

(def ResponseFormatField
  "Malli entry for the shared, optional `response_format` param. Defaults to concise when absent."
  [:maybe [:enum "concise" "detailed"]])

(defn detailed?
  "Whether `response-format` selects the detailed projection. Absent/`nil` and `\"concise\"` are concise;
   only `\"detailed\"` is detailed."
  [response-format]
  (= "detailed" response-format))

(defn project
  "Project one REST `record` to its concise or detailed field set, selecting REST property names verbatim.
   `spec` is `{:concise [ks…] :detailed [ks…]}`; the detailed set defaults to the whole record when
   `:detailed` is absent. Nil `response-format` is concise."
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
;;; `fields` — dot-path picks
;;; ──────────────────────────────────────────────────────────────────
;;
;; The escape hatch between the two fixed projections: "just `id` and `collection_id` for these ten items"
;; costs those fields, not the whole bundle. Paths are REST property names, dot-separated for nesting, and
;; item-relative on a list — one `fields` list applies to every row.
;;
;; A path is checked against what the entity *declares* — its projection — as well as what the records
;; happen to carry, so a typo is refused even when the page came back empty. Checking only the records
;; would let `fields: ["naem"]` on an empty collection return `[]`, which reads as "nothing there".

(def FieldsField
  "Malli entry for the shared, optional `fields` param of a record read."
  [:maybe [:sequential ms/NonBlankString]])

(defn- path->keys
  [path]
  (mapv keyword (str/split path #"\.")))

(defn- record-paths
  "Every dot-path `record` offers: each key, and the paths inside each nested map."
  [record]
  (into #{}
        (mapcat (fn [[k v]]
                  (let [path (name k)]
                    (cons path (when (map? v)
                                 (map #(str path "." %) (record-paths v)))))))
        record))

(defn spec-paths
  "The dot-paths a projection `spec` declares — its concise field names. The declared set a `fields` pick
   is checked against, and the only one available when a page comes back empty."
  [spec]
  (into #{} (map name) (:concise spec)))

(defn- edit-distance
  "Levenshtein distance between `a` and `b`, used only to suggest a near miss."
  [^String a ^String b]
  (let [m (count a)
        n (count b)]
    (loop [i 0
           row (vec (range (inc n)))]
      (if (= i m)
        (peek row)
        (recur (inc i)
               (reduce (fn [next-row j]
                         (conj next-row
                               (min (inc (peek next-row))
                                    (inc (nth row (inc j)))
                                    (cond-> (nth row j)
                                      (not= (.charAt a i) (.charAt b j)) inc))))
                       [(inc i)]
                       (range n)))))))

(defn- near-match
  "The path in `valid` closest to `path` by edit distance, when one is close enough to be worth naming."
  [path valid]
  (let [[candidate distance] (->> valid
                                  (map (fn [v] [v (edit-distance path v)]))
                                  (sort-by second)
                                  first)]
    ;; Two edits covers the typo a model actually makes — a transposition ("naem"), a doubled or dropped
    ;; letter — and the allowance grows with the path so a long name is not held to the same absolute budget.
    (when (and candidate (<= distance (max 2 (quot (count path) 3))))
      candidate)))

(defn- unknown-field-message
  [path valid]
  (str "Unknown field " (pr-str path) "."
       (when-let [suggestion (near-match path valid)]
         (str " Did you mean " (pr-str suggestion) "?"))
       " `fields` takes these paths: " (str/join ", " valid) "."))

(defn- pick
  "`record` narrowed to `fields`, keeping the nesting a dot-path names. A path this record does not carry is
   absent from the result rather than nulled — a heterogeneous batch shares one `fields` list, and a type
   that has no such property has no such property."
  [fields record]
  (reduce (fn [picked path]
            (let [ks (path->keys path)
                  v  (get-in record ks ::missing)]
              (cond-> picked
                (not= ::missing v) (assoc-in ks v))))
          {}
          fields))

(defn pick-fields
  "Narrow each of `records` to the dot-paths in `fields`, overriding the concise/detailed projection.

   `declared` is the path set the entity's projection declares (see [[spec-paths]]); a path is valid when
   it is declared or when some record carries it, so a detailed-only property is pickable and a typo is
   refused whether or not any rows came back. An unknown path raises a teaching error listing the valid
   paths and naming the nearest one."
  [fields records declared]
  (let [valid (into (sorted-set) (concat declared (mapcat record-paths records)))]
    (doseq [path fields
            :when (not (contains? valid path))]
      (teaching-error! (unknown-field-message path valid)))
    (mapv #(pick fields %) records)))

(defn project-rows
  "Shape the `records` a read returns: `fields` picks dot-paths and overrides `response-format`; without it
   the entity's concise or detailed projection applies. `spec` is the entity's projection, and it declares
   the paths `fields` is checked against."
  [{:keys [response-format fields spec]} records]
  (if (seq fields)
    (pick-fields fields records (spec-paths spec))
    (project-all response-format spec records)))

;;; ──────────────────────────────────────────────────────────────────
;;; Response budget
;;; ──────────────────────────────────────────────────────────────────
;;
;; A tool response has to fit the client's context. Past the cap the client hard-truncates the JSON
;; mid-value, and the model gets neither the data nor a way to ask for less — so every read bounds itself
;; well under the cap and says how to continue.

(def token-budget
  "The token budget one tool response aims to stay within. Well under the 25K-token cap a tool result is
   hard-truncated at, so an estimate that runs low still lands inside it."
  10000)

(defn estimate-tokens
  "Rough token estimate for an already-data value: its JSON encoding at ~4 characters per token. Good
   enough to steer truncation; never a billing figure."
  [v]
  (quot (count (json/encode v)) 4))

(defn budget-units
  "Emit complete `units` in order until `:token-budget` (default [[token-budget]]) is exhausted, then stop
   and name the rest. Returns `{:included [unit…] :omitted [unit…] :truncated? bool}`. `:size-fn` estimates
   a unit's token cost (default [[estimate-tokens]]). At least one unit is always included, so a single
   over-budget unit surfaces (the caller decides whether to slice it explicitly).

   A silent mid-unit cut is a correctness bug: a truncated column list reads as \"that's all the columns\"
   and corrupts the query the agent writes next. So the rule is complete units until the budget runs out,
   then name the omitted ones — never half a unit."
  [units {:keys [size-fn] budget :token-budget
          :or   {budget token-budget size-fn estimate-tokens}}]
  (loop [remaining units
         spent     0
         included  []]
    (if (empty? remaining)
      {:included included :omitted [] :truncated? false}
      (let [unit       (first remaining)
            cost       (long (size-fn unit))
            next-spent (+ spent cost)]
        (if (or (empty? included) (<= next-spent budget))
          (recur (rest remaining) next-spent (conj included unit))
          {:included included :omitted (vec remaining) :truncated? true})))))

;;; ──────────────────────────────────────────────────────────────────
;;; Bounded list envelope + steering truncation
;;; ──────────────────────────────────────────────────────────────────
;;
;; List reads return the literal envelope `{data, returned, total?, truncated?, truncation_message?,
;; omitted?}`. Pagination is `limit`/`offset`, REST-verbatim. When a page is cut — by the caller's limit,
;; by the row cap, or by the response budget — the truncation message names the narrowing parameter and the
;; next offset, so the model knows exactly how to continue.

(defn clamp-limit
  "The page size a call actually gets: the caller's `limit`, or `default` when they named none, never above
   `maximum`."
  [limit default maximum]
  (min (or limit default) maximum))

(defn page-of
  "The `limit` rows at `offset` of `rows`."
  [rows limit offset]
  (into [] (comp (drop (or offset 0)) (take limit)) rows))

(defn truncation-message
  "Build a steering message naming the narrowing parameter(s) and the next offset. `total` and `returned`
   size the set; `noun` names the items (\"tables\"); `scope` is an optional qualifier (\"in schema
   `public`\"); `narrow-with` is a seq of parameter names that shrink the set; `next-offset`, when given,
   adds the next-page hint. `total` may be absent — a fused ranking is a union of several ranked windows and
   counts nothing — and then the message sizes only what was returned."
  [{:keys [total returned noun scope narrow-with next-offset]}]
  (let [head    (if total
                  (str total " " noun (when scope (str " " scope)) " — showing " returned)
                  (str "Showing " returned " " noun (when scope (str " " scope))))
        narrow  (when (seq narrow-with)
                  (str "narrow with " (->> narrow-with (map #(str "`" (name %) "`")) (str/join ", "))))
        paging  (when next-offset
                  (str "page with `offset: " next-offset "`"))
        actions (->> [narrow paging] (remove nil?) (str/join " or "))]
    (if (seq actions)
      (str head ". " actions ".")
      head)))

(mr/def ::omitted-entry
  "One entity a read left out, and why: the response budget cut it, or the caller may not see it. Named
   rather than silently absent, because a missing row reads as a row that does not exist."
  [:map {:closed true}
   [:id     {:optional true} [:maybe :any]]
   [:type   {:optional true} :string]
   [:name   {:optional true} [:maybe :string]]
   [:reason {:optional true} :string]])

(mr/def ::list-response
  "The bounded envelope every v2 read returns — one schema, because they are one contract.

   `data` is the page, already projected to the requested `response_format` or `fields`, so its element
   shape is the tool's and not this schema's to pin. `returned` counts it. `total` sizes the whole set when
   the set is countable — a fused ranking is a union of several ranked windows and counts nothing.
   `truncated` marks a response with more behind it and `truncation_message` says how to reach the rest.
   `omitted` names the entities a budget cut, for the reads that take explicit ids rather than a page."
  [:map {:closed true}
   ;; A record, or — `browse_data`'s `list_schemas` alone — a bare schema name, which is what the REST
   ;; endpoint behind it returns and so what a projection of it would have to invent a wrapper for.
   [:data               [:sequential [:or :map :string]]]
   [:returned           :int]
   [:total              {:optional true} :int]
   [:truncated          {:optional true} :boolean]
   [:truncation_message {:optional true} :string]
   [:omitted            {:optional true} [:sequential ::omitted-entry]]])

(defn list-envelope
  "Build the bounded list envelope. `data` is the (already-projected) page. Options: `:total` — the full
   count when known; `:truncation-message` — a steering string that marks the page truncated and tells the
   model how to continue; `:omitted` — the entities this response left out, each naming itself and why.
   Keys the model doesn't need are omitted, not nulled."
  ([data] (list-envelope data nil))
  ([data {:keys [total truncation-message omitted]}]
   (cond-> {:data     (vec data)
            :returned (count data)}
     (some? total)      (assoc :total total)
     truncation-message (assoc :truncated true :truncation_message truncation-message)
     (seq omitted)      (assoc :omitted (vec omitted)))))

(defn paged-envelope
  "The bounded list envelope over one `page` of rows: project it, cut it back to the response budget, and
   steer when rows remain behind it.

   `page` is the rows for this page, already sliced — the three list reads get theirs differently (a search
   window, a full set, a query with `LIMIT`), and only the slicing differs. Options: `:response-format`,
   `:fields`, and `:spec` shape a row; `:offset` and `:limit` are the caller's, clamped; `:total` is the
   size of the whole set when it is countable; `:noun`, `:scope`, and `:narrow-with` write the steer.

   The row cap bounds how many rows a page may carry; the token budget bounds how big they may be. Both are
   real: `response_format: \"detailed\"` returns whole REST records, and two hundred of those overrun the
   response long before two hundred rows do."
  [page {:keys [limit offset total response-format fields spec noun scope narrow-with]}]
  (let [offset    (or offset 0)
        ;; No spec means the rows are not records — `list_schemas` returns bare schema names — so there is
        ;; nothing to project and nothing for `fields` to pick.
        projected (if spec
                    (project-rows {:response-format response-format :fields fields :spec spec} page)
                    (vec page))
        {:keys [included truncated?]} (budget-units projected {})
        returned  (count included)
        more?     (or truncated?
                      (if total
                        (< (+ offset returned) total)
                        (= returned limit)))]
    (list-envelope
     included
     (cond-> {:total total}
       more? (assoc :truncation-message
                    (truncation-message {:total       total
                                         :returned    returned
                                         :noun        noun
                                         :scope       scope
                                         :narrow-with narrow-with
                                         :next-offset (+ offset returned)}))))))
