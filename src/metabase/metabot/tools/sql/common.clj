(ns metabase.metabot.tools.sql.common
  "Namespace that aggregates functionality common to tools sql namespaces.

  Those are:
  - `metabot.tools.create-sql-query`,
  - `metabot.tools.edit-sql-query`,
  - `metabot.tools.replace-sql-query`.

  Each of those namespaces define an _operation_:
  - `create-sql-query`,
  - `edit-sql-query`,
  - `replace-sql-query`."
  (:require
   [clojure.string :as str]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.metabot.query-analyzer :as query-analyzer]
   [metabase.metabot.tools.sql.validation :as metabot.tools.sql.validation]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli.registry :as mr]))

(def ^:private card-tag-re
  ;; Mirrors metabase.lib.parameters.parse/card-tag-regex but anchored as a
  ;; standalone token inside surrounding text. Captures the numeric card id;
  ;; tolerates the optional `-some-slug` suffix and inner whitespace
  ;; (`{{ #123 }}`, `{{#123-slug}}`). Retained for `neutralize-card-refs`;
  ;; `card-refs-in-sql` itself defers to the canonical recognizer.
  #"\{\{\s*#(\d+)(?:-[a-z0-9-]*)?\s*\}\}")

(defn card-refs-in-sql
  "Extract `{{#N}}`/`{{#N-slug}}` card references from a SQL string via the
  canonical, comment-aware recognizer ([[lib/recognize-template-tags]]). Returns
  a vector of `{:type \"card\" :id N}` entries, deduped. The `:type` is the
  catch-all `card`; consumers that need the resolved subtype
  (`question`/`model`/`metric`) can join to `report_card.type`. Returns `[]`
  when `sql` is not a string or has no card references.

  Unlike a raw regex scan, this ignores card refs written inside SQL comments
  (`-- {{#1}}`, `/* {{#1}} */`), matching how Metabase actually resolves card
  references — a ref in a comment is not a real reference. Output order follows
  the recognizer's tag map and is irrelevant: the consumer keys by `[type id]`."
  [sql]
  (if (string? sql)
    (->> (lib/recognize-template-tags sql)
         vals
         (keep (fn [{:keys [type card-id]}]
                 (when (= type :card) {:type "card" :id card-id})))
         distinct
         vec)
    []))

(defn- neutralize-card-refs
  "Replace `{{#N}}` card-ref template tags with a neutral identifier so the SQL
  stays parseable by sqlglot but the referenced card's *underlying* tables are
  not inlined and surfaced. The placeholder is space-padded so it remains a
  standalone token even when the original tag had no surrounding whitespace
  (`FROM{{#5}}`). Card refs only appear in table-source position, so an
  identifier is always a structurally valid substitution."
  [sql]
  (str/replace sql card-tag-re " mb__card_ref "))

(defn native-physical-table-refs
  "Best-effort resolution of the physical tables a native `sql` query names
  *directly*, as a vector of `{:type \"table\" :id N}` entity-usage entries for
  `database-id`.

  Card references (`{{#N}}`) are neutralized before parsing (see
  [[neutralize-card-refs]]) so a referenced card's underlying source tables are
  not surfaced — the agent named the card, not its tables, and the card identity
  is already captured via [[card-refs-in-sql]]. This mirrors the MBQL authoring
  path, which records only directly-named tables (see
  `metabase.metabot.tools.construct/query->entity-usage`).

  Never throws: an unsupported driver, a compile/parse failure, blank SQL, or a
  nil `database-id` all degrade to `[]`, matching entity-usage's best-effort
  contract. Variable/field-filter tags are substituted by the underlying
  analyzer; snippet-derived tables are a known, accepted limitation (snippets
  are not part of the entity-usage vocabulary)."
  [database-id sql]
  (or (try
        (when (and (some? database-id) (string? sql) (not (str/blank? sql)))
          (let [mp     (lib-be/application-database-metadata-provider database-id)
                query  (lib/native-query mp (neutralize-card-refs sql))
                result (query-analyzer/tables-for-native query)]
            ;; `tables-for-native` returns `{:tables #{...}}` on success, but a
            ;; bare `:query-analysis.error/...` keyword (non-SQL drivers) or
            ;; `{:error ...}` (untrusted SQL drivers) otherwise — guard on map?.
            (when (map? result)
              (->> (:tables result)
                   (keep :table-id)
                   distinct
                   (mapv (fn [id] {:type "table" :id id}))))))
        (catch Throwable _ nil))
      []))

(mr/def ::action-result
  "Each of the _operations_ performs an _action_ manipulating a query.
  Key of the action result represent
  - query-id :: id of a query stored in the context or memory,
  - query-content :: sql that is a result of an action,
  - query :: query map that wraps the `query-content`,
  - database :: id of the database that query belongs to."
  [:map
   [:query-id :any]
   [:query-content :string]
   [:query :map]
   [:database :int]])

(mr/def ::operation-result
  "Result of an operation as described this ns' docstring. Stores validation result and action result iff validation
  was successful."
  [:map
   [:validation-result ::metabot.tools.sql.validation/validation-result]
   [:action-result {:optional true} ::action-result]])

(defn- maybe-normalize-query
  [query]
  (try
    (lib-be/normalize-query query)
    (catch Exception _
      nil)))

(defn update-query-sql
  "Update a dataset_query map with new SQL content.
  Handles both legacy MBQL (`{:type :native, :native {:query ...}}`) and
  MBQL 5 (`{:stages [{:lib/type :mbql.stage/native, :native ...}]}`) formats,
  including the JSON-serialized MBQL 5 variant where enum values are strings."
  [query new-sql]
  (let [normalized (maybe-normalize-query query)]
    (cond
      (and normalized
           (lib/native-only-query? normalized)
           (string? (not-empty new-sql)))
      (lib/with-native-query normalized new-sql)

      (:native query)
      (assoc-in query [:native :query] new-sql)

      :else
      (throw (ex-info (tru "Unsupported query format")
                      {:agent-error? true})))))
