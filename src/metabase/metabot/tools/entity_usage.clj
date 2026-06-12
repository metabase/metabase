(ns metabase.metabot.tools.entity-usage
  "Schemas and validation for the `:entity-usage` channel on tool results.

  A tool's `:entity-usage` (under `:structured-output`) records the entities
  the tool received as input and the entities it surfaced to the LLM in its
  output. The shape is enforced by `entity-usage-schema`; whether the field
  must be present on a tool's result is governed by the tool's declared
  `:tool-type`."
  (:require
   [metabase.util.malli.registry :as mr]))

(set! *warn-on-reflection* true)

(def entity-types
  "Closed enum for the `:type` key on each entity-usage entry. Vocabulary
  matches the `metabase://` URI scheme the frontend uses. `card` is the
  catch-all for unknown-subtype references — used when a tool extracts a
  card-id from raw text (e.g. `{{#N}}` template tags in SQL) without
  resolving the row to question/model/metric."
  #{"table" "model" "question" "metric" "card"
    "dashboard" "database" "transform" "field"
    "collection" "document"})

(def card-family-types
  "The `:type` values that all resolve to a single `report_card` row — a
  card and its subtypes. They share `report_card`'s primary-key space, so
  the same id under any of these types is the same row."
  #{"card" "question" "model" "metric"})

(defn canonical-type
  "Fold a card-family `:type` to `\"card\"` so a row surfaced under one
  subtype (e.g. a search hit typed `model`) and referenced under another
  (e.g. a query whose source is typed `card`) dedup to one entity. Any
  other type passes through unchanged."
  [type]
  (if (contains? card-family-types type) "card" type))

(def entity-usage-entry-schema
  "Shape of a single entry in `:input` or `:output`. Open map — `:metadata`
  carries per-tool annotations (rank, arg-slot, uri, …) without further
  constraint."
  [:map
   [:type     (into [:enum] (sort entity-types))]
   [:id       [:or :int :string]]
   [:metadata {:optional true} [:map-of :keyword :any]]])

(def entity-usage-schema
  "The `:entity-usage` field inside a tool result's `:structured-output`.
  Tool's POV:
  - `:input`  — entities the tool *received* (via tool-input arguments or,
                for hybrid tools like `read_resource`, via the URI it was
                asked to dereference).
  - `:output` — entities the tool *exposed* to the LLM via its result.

  Both lists may be empty; the field must be present in full for any tool
  with `:tool-type` other than `:utility`."
  [:map {:closed true}
   [:input  [:sequential entity-usage-entry-schema]]
   [:output [:sequential entity-usage-entry-schema]]])

(defn entity-usage-on-result
  "Attach an `:entity-usage` map under `:structured-output` on a tool result,
  preserving any structured-output already present."
  [result entity-usage]
  (update result :structured-output (fnil assoc {}) :entity-usage entity-usage))

(defn stamp-artifact-valid
  "Stamp the authoring-outcome flag onto an authoring tool result's
  `:structured-output`. `valid?` is `true` when the tool produced a valid
  artifact (a resolvable/executable query, transform, or chart) and `false`
  on any non-success branch — validation failure, agent-input rejection, a
  genuine exception, or a degraded result with no artifact. Read back by the
  quality pipeline's `artifact-validity-share` metric. Survives the
  persistence trim via `persisted-structured-output-keys`."
  [result valid?]
  (assoc-in result [:structured-output :artifact-valid] valid?))

(def tool-types
  "Closed enum for the `:tool-type` metadata key required on every
  registered tool.

  - `:discovery`  — surfaces previously-unknown entities (search family).
                    Typically `:input []`; `:output` has refs with rank/score.
  - `:authoring`  — produces artifacts from entity refs (sql, construct,
                    transforms, document chart tools, navigate_user with
                    entity destination, static_viz, alerts).
                    Typically `:input` has refs; `:output []`.
  - `:inspection` — fetches details about a known entity
                    (get_field_values, list_available_fields,
                    get_transform_details).
                    Typically `:input` has refs; `:output []` or describes
                    sub-entities surfaced.
  - `:hybrid`     — both meaningful in the same call (read_resource:
                    per-URI dispatch — listing URIs are discovery,
                    single-entity URIs are inspection).
  - `:utility`    — no entity activity (todo_*, ask_for_sql_clarification,
                    analyze_chart). MUST NOT emit `:entity-usage`."
  #{:discovery :authoring :inspection :hybrid :utility})

(defn entity-usage-required?
  "True for tool-types that must populate `:entity-usage` on every result."
  [tool-type]
  (and (contains? tool-types tool-type)
       (not= tool-type :utility)))

(defn validate-result
  "Validate the `:entity-usage` shape on a tool's return value against the
  tool's declared `:tool-type`. Returns `nil` on a valid result, or a map
  describing the violation (either a `{:violation ...}` summary or a malli
  explain map) when the shape or presence/absence rule is broken."
  [tool-type result]
  (let [eu (get-in result [:structured-output :entity-usage])]
    (cond
      (= tool-type :utility)
      (when (some? eu)
        {:violation :entity-usage-forbidden-for-utility})

      (entity-usage-required? tool-type)
      (cond
        (nil? eu)
        {:violation :entity-usage-required-but-missing :tool-type tool-type}

        (not (mr/validate entity-usage-schema eu))
        (mr/explain entity-usage-schema eu))

      :else
      {:violation :unknown-tool-type :tool-type tool-type})))
