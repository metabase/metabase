(ns metabase-enterprise.transform-optimizer.prompt
  "Render the optimizer context map into the markdown block the LLM consumes,
  per PLAN.md → Phase 2."
  (:require
   [clojure.string :as str]
   [metabase.util.json :as json]))

(set! *warn-on-reflection* true)

;; ---------------------------------------------------------------------------
;; Helpers

(defn- format-fk [{:keys [target_schema target_table target_column]}]
  (when (and target_schema target_table target_column)
    (format "FK → %s.%s.%s" target_schema target_table target_column)))

(defn- format-field [{:keys [name base_type semantic_type indexed? foreign_key]}]
  (let [parts (cond-> [(format "  - %s : %s" name (or base_type "?"))]
                semantic_type    (conj (format "/ %s" (clojure.core/name semantic_type)))
                indexed?         (conj "[indexed]")
                foreign_key      (conj (str "[" (format-fk foreign_key) "]")))]
    (str/join " " (remove nil? parts))))

(defn- format-index [{:keys [name access_method is_unique is_primary
                             key_columns include_columns partial_predicate
                             definition]}]
  (let [tag (cond
              is_primary "PK"
              is_unique  "UNIQUE"
              :else      "INDEX")
        cols (str/join ", " key_columns)
        inc  (when (seq include_columns)
               (str " INCLUDE (" (str/join ", " include_columns) ")"))
        pred (when (seq partial_predicate)
               (str " WHERE " partial_predicate))]
    (format "  - %s %s [%s] (%s)%s%s\n      %s"
            tag name access_method cols
            (or inc "") (or pred "")
            (or definition ""))))

(defn- format-source [{:keys [schema table_name column_count fields indexes]}]
  (let [fields-block  (when (seq fields)
                        (str/join "\n" (map format-field fields)))
        indexes-block (when (seq indexes)
                        (str "\n  indexes:\n" (str/join "\n" (map format-index indexes))))
        no-index-note (when (empty? indexes)
                        "\n  indexes: (none beyond PK)")]
    (str (format "### %s.%s (%d columns)\n" schema table_name (or column_count 0))
         (or fields-block "")
         (or indexes-block no-index-note))))

(defn- format-run [{:keys [start_time status run_method duration_ms]}]
  (format "- %s : %s [%s] in %sms"
          start_time
          (clojure.core/name (or status :unknown))
          (clojure.core/name (or run_method :manual))
          (or duration_ms "?")))

;; ---------------------------------------------------------------------------
;; Public API

(defn render-context
  "Render the context map from `context/build-context` into the markdown
  payload that goes into the user-side of the LLM prompt. The system-side
  comes from `prelude/prelude`."
  [{:keys [transform sql sources target explain run_history indexes_partial?]}]
  (let [target-name (when target
                      (format "%s.%s" (:schema target) (:table_name target)))
        runs-block  (if (seq run_history)
                      (str/join "\n" (map format-run run_history))
                      "- (no run history)")
        sources-block (if (seq sources)
                        (str/join "\n\n" (map format-source sources))
                        "_no referenced tables resolved_")
        explain-block (if explain
                        (str "```json\n" (json/encode explain) "\n```")
                        "_EXPLAIN unavailable_")
        partial-note  (when indexes_partial?
                        "\n\n> ⚠ Index detail was unavailable for some tables; treat the indexes list as partial.")]
    (str/join "\n\n"
              ["## Transform"
               (format "- id: %s\n- name: %s\n- target: %s"
                       (:id transform) (:name transform) (or target-name "(none / unrun)"))
               "## SQL"
               (str "```sql\n" (or sql "-- (compilation failed)") "\n```")
               "## Referenced tables"
               (str sources-block (or partial-note ""))
               "## EXPLAIN (FORMAT JSON, VERBOSE)"
               explain-block
               "## Run history (most recent first)"
               runs-block])))
