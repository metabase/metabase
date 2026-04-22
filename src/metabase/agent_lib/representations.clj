(ns metabase.agent-lib.representations
  "Parsing and validation of queries in the canonical MBQL 5 YAML representations format.

  The representations format is the serialized, portable shape of a pMBQL query. It uses:

    * string keys with `lib/`-prefixed markers like `\"lib/type\": \"mbql/query\"`;
    * portable foreign-key paths for tables and fields (vectors of strings), e.g.
      `[\"field\", {}, [\"DB\", \"SCHEMA\", \"TABLE\", \"COLUMN\"]]`;
    * entity IDs (21-char NanoIDs) for cards, segments, measures, etc.;
    * an always-present options map at position 2 of every clause, even when empty (`{}`).

  This namespace owns the LLM-facing entry point: take a YAML string, parse it, run a small set
  of representations-specific structural checks with informative error messages, and return the
  parsed Clojure data (still in portable / string-keyed form) ready to be handed to the resolver
  (`metabase.agent-lib.representations.resolve`, future commit) for conversion to numeric-ID
  pMBQL.

  Phase 1 MVP subset (see `repr-plan.md`):

    * `source-table` only (no `source-card` yet);
    * single-stage queries (no multi-stage);
    * top-level stage operations: `filters`, `aggregation`, `breakout`, `order-by`, `limit`,
      `fields`;
    * explicit joins supported; implicit joins will be filled in by the repair pass.

  Validation strategy: we run a lightweight malli schema focused on the repr-specific invariants
  (shape of portable FKs, always-present `{}` options, allowed top-level keys). We intentionally
  do NOT run `lib.schema/Query` validation here — that happens after the resolver has converted
  portable FKs to numeric IDs and `lib/normalize`d the structure. Running lib-schema validation
  on string-keyed portable form would mostly fail on the FK vectors anyway."
  (:require
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli.humanize :as mu.humanize]
   [metabase.util.malli.registry :as mr]
   [metabase.util.yaml :as yaml]))

(set! *warn-on-reflection* true)

;;; ============================================================
;;; Predicates for repr-specific invariants
;;; ============================================================

(defn- non-blank-string?
  [x]
  (and (string? x) (not= "" x)))

(defn- options-map?
  "Repr-specific invariant: options are always a map (possibly empty), never nil / null."
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
  "Portable field FK: [db-name, schema-or-null, table-name, field-name, ...json-path-segments].
  Must have at least 4 elements."
  [x]
  (and (vector? x)
       (>= (count x) 4)
       (non-blank-string? (nth x 0))
       (or (nil? (nth x 1)) (string? (nth x 1)))
       (non-blank-string? (nth x 2))
       (every? non-blank-string? (drop 3 x))))

;;; ============================================================
;;; Malli schema for the repr form (Phase 1 MVP subset)
;;;
;;; Notes:
;;;   * keys are strings (`\"lib/type\"`, `\"source-table\"`, …) because we parse YAML with
;;;     `:keywords false` — this lets us keep the `lib/` namespace markers without fighting the
;;;     YAML parser.
;;;   * We accept any clause shape inside the value positions (filters, aggregation entries,
;;;     breakout entries, order-by entries, fields entries, expression trees) as long as the
;;;     second element is a map. Deeper structural validation of each operator is deferred to
;;;     `lib.schema/Query` after resolution; our job here is to catch the obvious shape errors
;;;     the LLM is most likely to make.
;;; ============================================================

(defn- clause-shape?
  "A clause is a vector whose head is a non-blank operator string and whose second element is an
  options map. We intentionally do NOT enumerate operators here — that's `lib.schema`'s job after
  resolution. Sub-term validation recurses structurally."
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
   ;; Clauses are validated structurally (head + options-map + N terms). We don't descend into
   ;; term positions with malli-refs — that triggers `potentially-recursive-seqex` and, more
   ;; importantly, term shapes are the lib-schema's responsibility after resolution.
   ::clause   [:and vector?
               [:fn {:error/message "clause must be [operator-string, options-map, …args]"}
                clause-shape?]]
   ::join     [:map
               {:closed false}
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
               ["database" :string]
               ["stages"   [:sequential {:min 1} [:ref ::stage]]]]})

(def query-schema
  "Malli schema for a Phase-1 representations query (string-keyed, portable form)."
  [:schema {:registry registry} [:ref ::query]])

(def stage-schema
  "Malli schema for a single MBQL stage in the representations form."
  [:schema {:registry registry} [:ref ::stage]])

;;; ============================================================
;;; Public API
;;; ============================================================

(defn parse-yaml
  "Parse a representations YAML string into a Clojure data structure, preserving string keys.

  Throws with `:error :invalid-representations-yaml` if the YAML is malformed.

  We use `:keywords false` so markers like `\"lib/type\"` come through intact. clj-yaml would
  otherwise try to keywordize them and we'd lose the `lib/` namespace segment (or end up with
  `:lib/type` which is inconsistent with the portable form we're validating against)."
  [^String yaml-string]
  (when-not (string? yaml-string)
    (throw (ex-info (tru "Representations input must be a YAML string.")
                    {:status-code 400
                     :error       :invalid-representations-yaml
                     :type        (some-> yaml-string class .getName)})))
  (try
    (yaml/parse-string yaml-string :keywords false)
    (catch Exception e
      (throw (ex-info (tru "Failed to parse representations YAML: {0}" (ex-message e))
                      {:status-code 400
                       :error       :invalid-representations-yaml
                       :cause-msg   (ex-message e)}
                      e)))))

(defn validate-query
  "Validate a parsed representations query against [[query-schema]] and return it unchanged.

  Throws with `:error :invalid-representations-query` and a humanized explanation on failure."
  [parsed]
  (when-let [error (mr/explain query-schema parsed)]
    (throw (ex-info (tru "Representations query has an invalid structure.")
                    {:status-code 400
                     :error       :invalid-representations-query
                     :humanized   (mu.humanize/humanize error)
                     :details     (pr-str (mu.humanize/humanize error))
                     :schema      ::query})))
  parsed)

(defn parse-and-validate
  "Convenience: parse a YAML string and validate it against [[query-schema]].

  Returns the parsed, validated, still-portable Clojure data structure. Throws on either parse or
  validation failure."
  [^String yaml-string]
  (-> yaml-string parse-yaml validate-query))
