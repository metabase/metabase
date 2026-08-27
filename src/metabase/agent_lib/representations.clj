(ns metabase.agent-lib.representations
  "Boundary helpers for the canonical MBQL 5 portable representations form.

  Two layers live here:

    * **External form** — the wire / LLM-facing shape: a keyword-keyed Clojure map matching
      [[metabase.lib.schema/external-query]]. Identical to internal `::lib.schema/query` except
      the ID types are portable: `::id/database`, `::id/card`, `::id/segment`, `::id/measure`,
      `::id/snippet` are strings; `::id/table` is `[db schema table]` and `::id/field` is
      `[db schema table field …]`.
    * **Portable form** — the same shape with all keys and enum values stringified. This is the
      lingua franca of the repair pipeline ([[metabase.agent-lib.representations.repair]]) and the
      output of [[metabase.agent-lib.representations.resolve/export-query]]. Repair operates on
      string-keyed data because every clause head, options key, and `lib/`-prefixed marker is
      authored as a string by the LLM and only keywordized after FK resolution.

  This namespace owns the conversion between those two layers and the up-front structural check
  that guards the entry to the repair pipeline.

  Phase 1 MVP scope (see `repr-plan.md`):

    * `source-table` and `source-card` (the latter as a portable entity_id string);
    * single-stage queries (no multi-stage);
    * top-level stage operations: `filters`, `aggregation`, `breakout`, `order-by`, `limit`,
      `fields`;
    * explicit joins supported; implicit joins are filled in by the repair pass."
  (:require
   [malli.core :as mc]
   [malli.transform :as mtx]
   [metabase.lib.schema :as lib.schema]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli.humanize :as mu.humanize]
   [metabase.util.malli.registry :as mr]))

(set! *warn-on-reflection* true)

;;; ============================================================
;;; External (keyword-keyed) ↔ portable (string-keyed) conversion
;;; ============================================================

(defn- keyword->repr-string
  "Stringify a keyword preserving its namespace, e.g. `:lib/type` → `\"lib/type\"`.
  `clojure.core/name` would drop the namespace; `clojure.walk/stringify-keys` likewise."
  [k]
  (if-let [ns (namespace k)]
    (str ns "/" (name k))
    (name k)))

(defn external-query->portable
  "Convert a keyword-keyed external-query map (as produced by the JSON middleware's keywordizing
  decoder, or by [[validate-external-query]]'s string-transformer decode) into the string-keyed
  portable form expected by the repair pipeline.

  Walks the structure once. Map keys are stringified preserving their namespace. Keyword values
  (notably the `:lib/type` enum stamps `:mbql/query` / `:mbql.stage/mbql`) are also stringified
  so the post-decode shape matches the all-strings invariant the repair pipeline relies on. FK
  path segments and option values that already arrive as strings pass through unchanged."
  [x]
  (cond
    (map? x)
    (reduce-kv
     (fn [m k v]
       (assoc m
              (cond-> k (keyword? k) keyword->repr-string)
              (external-query->portable v)))
     {}
     x)

    (vector? x)     (mapv external-query->portable x)
    (sequential? x) (mapv external-query->portable x)
    (keyword? x)    (keyword->repr-string x)
    :else           x))

;;; ============================================================
;;; Up-front validation against ::lib.schema/external-query
;;; ============================================================

(defn validate-external-query
  "Decode and validate `external-query` (keyword-keyed, JSON-decoded) against
  [[metabase.lib.schema/external-query]], returning the decoded query.

  The string-transformer keywordizes enum values (`\"mbql/query\"` → `:mbql/query`,
  `\"mbql.stage/mbql\"` → `:mbql.stage/mbql`, etc.) so the schema's keyword-typed enum slots
  accept the JSON shape directly. Throws with `:error :invalid-external-query` and a humanized
  explanation when the input shape is structurally invalid even after decoding.

  NOTE: kept as a building block; the agent boundary uses [[assert-known-stage-keys!]] instead
  because the lib schema's stage shape is not a closed map (typo'd stage keys would silently
  pass) and the humanized output here references function predicates in a form that isn't
  LLM-actionable."
  [external-query]
  (let [schema  (mr/schema ::lib.schema/external-query)
        decoded (mc/decode schema external-query mtx/string-transformer)]
    (when-let [error (mr/explain ::lib.schema/external-query decoded)]
      (throw (ex-info (tru "External query has an invalid structure.")
                      {:status-code 400
                       :error       :invalid-external-query
                       :humanized   (mu.humanize/humanize error)
                       :details     (pr-str (mu.humanize/humanize error))
                       :schema      ::lib.schema/external-query})))
    decoded))

(def ^:private known-stage-keys
  "The complete set of top-level keys a `mbql.stage/mbql` stage may carry on the
  LLM-facing surface. Sourced from `metabase.lib.schema.mbql-stage` and pruned to the
  keys the `construct_query` / `query` contract advertises (see
  `resources/metabot/prompts/tools/construct_notebook_query.md`)."
  #{"lib/type"
    "source-table" "source-card"
    "filters" "aggregation" "breakout" "expressions" "fields" "joins"
    "order-by" "limit"})

(defn assert-known-stage-keys!
  "Boundary check: every stage in the portable query must carry only known top-level keys.
  `lib.schema.mbql-stage/mbql` is not a closed map, so a typo'd key (e.g. `aggreagation` vs
  `aggregation`) would otherwise be silently dropped at resolve / lib.normalize time and the
  LLM would never learn that its intent was discarded. This check catches the common typo
  class with a clean `:agent-error?` diagnostic that names the offending key.

  Operates on the string-keyed portable form produced by [[external-query->portable]]."
  [portable-query]
  (when (and (map? portable-query) (vector? (get portable-query "stages")))
    (doseq [[stage-idx stage] (map-indexed vector (get portable-query "stages"))
            :when (map? stage)
            :let [unknown (remove known-stage-keys (keys stage))]
            :when (seq unknown)]
      (throw (ex-info (tru "Stage {0} has unknown key(s): {1}. Valid stage keys are: {2}."
                           stage-idx
                           (pr-str (vec unknown))
                           (pr-str (vec (sort known-stage-keys))))
                      {:status-code  400
                       :error        :unknown-stage-key
                       :agent-error? true
                       :stage-index  stage-idx
                       :unknown-keys (vec unknown)})))))

;;; ============================================================
;;; Repair-pipeline schema (string-keyed portable form)
;;;
;;; The schema below is intentionally narrower than `::lib.schema/external-query`: it asserts the
;;; portable-form invariants the repair pass relies on (FK shape, always-present `{}` options
;;; map, allowed top-level keys) and ignores per-operator term shapes — those are the lib-schema's
;;; responsibility after FK resolution. This is what `validate-query` checks between repair and
;;; resolve.
;;; ============================================================

(defn- non-blank-string?
  [x]
  (and (string? x) (not= "" x)))

(defn- options-map?
  [x]
  (map? x))

(defn- table-fk?
  "Portable table FK: [db-name, schema-or-null, table-name]."
  [x]
  (and (vector? x)
       (= 3 (count x))
       (non-blank-string? (nth x 0))
       (or (nil? (nth x 1)) (string? (nth x 1)))
       (non-blank-string? (nth x 2))))

(defn- field-fk?
  "Portable field FK: [db-name, schema-or-null, table-name, field-name, ...json-path-segments]."
  [x]
  (and (vector? x)
       (>= (count x) 4)
       (non-blank-string? (nth x 0))
       (or (nil? (nth x 1)) (string? (nth x 1)))
       (non-blank-string? (nth x 2))
       (every? non-blank-string? (drop 3 x))))

(defn- clause-shape?
  [x]
  (and (vector? x)
       (>= (count x) 2)
       (string? (nth x 0))
       (non-blank-string? (nth x 0))
       (options-map? (nth x 1))))

(def ^:private registry
  {::table-fk [:and vector?
               [:fn {:error/message "table FK must be [db-name, schema-or-null, table-name]"}
                table-fk?]]
   ::field-fk [:and vector?
               [:fn {:error/message "field FK must be [db-name, schema-or-null, table-name, field-name, …]"}
                field-fk?]]
   ::options  [:and map?
               [:fn {:error/message "options must always be a map (use `{}` if empty)"}
                options-map?]]
   ::clause   [:and vector?
               [:fn {:error/message "clause must be [operator-string, options-map, …args]"}
                clause-shape?]]
   ::join     [:map
               {:closed false}
               ["lib/type"   [:= "mbql/join"]]
               ["stages"     [:sequential {:min 1} [:ref ::stage]]]
               ["conditions" [:sequential {:min 1} [:ref ::clause]]]
               ["alias"      :string]
               ["strategy"   {:optional true}
                [:enum "left-join" "right-join" "inner-join" "full-join"]]
               ["fields"     {:optional true}
                [:or
                 [:enum "all" "none"]
                 [:sequential [:ref ::clause]]]]]
   ::stage    [:map
               {:closed false}
               ["lib/type"     [:= "mbql.stage/mbql"]]
               ["source-table" {:optional true} [:ref ::table-fk]]
               ["source-card"  {:optional true} :string]
               ["joins"        {:optional true} [:sequential [:ref ::join]]]
               ["filters"      {:optional true} [:sequential [:ref ::clause]]]
               ["aggregation"  {:optional true} [:sequential [:ref ::clause]]]
               ["breakout"     {:optional true} [:sequential [:ref ::clause]]]
               ["order-by"     {:optional true} [:sequential [:ref ::clause]]]
               ["limit"        {:optional true} [:maybe :int]]
               ["fields"       {:optional true} [:sequential [:ref ::clause]]]
               ["expressions"  {:optional true} [:sequential [:ref ::clause]]]]
   ::query    [:map
               {:closed false}
               ["lib/type" [:= "mbql/query"]]
               ["database" {:optional true} :string]
               ["stages"   [:sequential {:min 1} [:ref ::stage]]]]})

(def query-schema
  "Malli schema for a Phase-1 portable representations query (string-keyed)."
  [:schema {:registry registry} [:ref ::query]])

(def stage-schema
  "Malli schema for a single MBQL stage in the portable representations form."
  [:schema {:registry registry} [:ref ::stage]])

(defn validate-query
  "Validate a string-keyed portable representations query against [[query-schema]] and return it
  unchanged.

  Used as a sanity check between the repair and resolve passes."
  [parsed]
  (when-let [error (mr/explain query-schema parsed)]
    (throw (ex-info (tru "Representations query has an invalid structure.")
                    {:status-code 400
                     :error       :invalid-representations-query
                     :humanized   (mu.humanize/humanize error)
                     :details     (pr-str (mu.humanize/humanize error))
                     :schema      ::query})))
  parsed)
