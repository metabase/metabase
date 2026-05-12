(ns metabase-enterprise.transform-optimizer.index-introspection
  "Postgres-catalog introspection for index detail beyond what
  `Field.database_indexed` and `driver/describe-table-indexes` give us.

  For every index on the requested set of tables we return its key columns
  (ordered), INCLUDE columns, partial predicate, index access method
  (btree / gin / brin / hash / …), uniqueness, and the raw
  `pg_get_indexdef` definition string. The latter is the most LLM-friendly
  representation and is the field we expect the prompt template to render
  by default."
  (:require
   [clojure.string :as str]
   [metabase.driver :as driver]
   [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
   [metabase.util.log :as log])
  (:import
   (java.sql Array Connection ResultSet)))

(set! *warn-on-reflection* true)

;; ---------------------------------------------------------------------------
;; Postgres catalog query
;;
;; We resolve one row per index by joining pg_index → pg_class (table) →
;; pg_namespace (schema) → pg_class (the index itself) → pg_am (access
;; method). Key and INCLUDE columns are resolved via two correlated
;; ARRAY-subqueries against pg_attribute so we preserve column order and
;; keep the two groups distinct (indnkeyatts splits them).
;;
;; The table-set filter uses `unnest(?::text[], ?::text[])` so we can match
;; on (schema, name) pairs in a single round trip.

(def ^:private indexes-sql
  "WITH refs(schema_name, table_name) AS (
     SELECT s, t FROM unnest(?::text[], ?::text[]) AS u(s, t)
   )
   SELECT
     n.nspname                                                              AS schema_name,
     c.relname                                                              AS table_name,
     i.relname                                                              AS index_name,
     am.amname                                                              AS access_method,
     ix.indisunique                                                         AS is_unique,
     ix.indisprimary                                                        AS is_primary,
     ix.indisvalid                                                          AS is_valid,
     pg_get_expr(ix.indpred,  ix.indrelid)                                  AS partial_predicate,
     pg_get_expr(ix.indexprs, ix.indrelid)                                  AS index_expressions,
     pg_get_indexdef(ix.indexrelid)                                         AS index_def,
     ix.indnatts                                                            AS n_total_atts,
     ix.indnkeyatts                                                         AS n_key_atts,
     ARRAY(
       SELECT a.attname
       FROM unnest(ix.indkey[0:ix.indnkeyatts - 1]) WITH ORDINALITY AS k(attnum, ord)
       LEFT JOIN pg_attribute a ON a.attrelid = ix.indrelid AND a.attnum = k.attnum
       ORDER BY k.ord
     )                                                                      AS key_columns,
     ARRAY(
       SELECT a.attname
       FROM unnest(ix.indkey[ix.indnkeyatts : ix.indnatts - 1]) WITH ORDINALITY AS k(attnum, ord)
       LEFT JOIN pg_attribute a ON a.attrelid = ix.indrelid AND a.attnum = k.attnum
       ORDER BY k.ord
     )                                                                      AS include_columns
   FROM pg_index ix
   JOIN pg_class      c  ON c.oid  = ix.indrelid
   JOIN pg_class      i  ON i.oid  = ix.indexrelid
   JOIN pg_namespace  n  ON n.oid  = c.relnamespace
   JOIN pg_am        am  ON am.oid = i.relam
   JOIN refs          r  ON r.schema_name = n.nspname AND r.table_name = c.relname
   ORDER BY c.relname, i.relname;")

(defn- array->vec [^Array a]
  (when a (vec (.getArray a))))

(defn- row->index-info [^ResultSet rs]
  {:schema             (.getString rs "schema_name")
   :table              (.getString rs "table_name")
   :name               (.getString rs "index_name")
   :access_method      (.getString rs "access_method")
   :is_unique          (.getBoolean rs "is_unique")
   :is_primary         (.getBoolean rs "is_primary")
   :is_valid           (.getBoolean rs "is_valid")
   :partial_predicate  (.getString rs "partial_predicate")
   :index_expressions  (.getString rs "index_expressions")
   :definition         (.getString rs "index_def")
   :key_columns        (array->vec (.getArray rs "key_columns"))
   :include_columns    (array->vec (.getArray rs "include_columns"))})

(defn- query-indexes [^Connection conn pairs]
  (let [schemas (into-array String (map (comp str first)  pairs))
        tables  (into-array String (map (comp str second) pairs))]
    (with-open [stmt (.prepareStatement conn indexes-sql)]
      (.setArray stmt 1 (.createArrayOf conn "text" schemas))
      (.setArray stmt 2 (.createArrayOf conn "text" tables))
      (with-open [rs (.executeQuery stmt)]
        (loop [out []]
          (if (.next rs)
            (recur (conj out (row->index-info rs)))
            out))))))

;; ---------------------------------------------------------------------------
;; Public API

(defn- normalise-pairs
  "Accept either a single `[schema table]` pair or a sequence of them. Returns
  a sequence of pairs. This lets REPL callers write
  `(fetch-indexes drv db [\"shop\" \"orders\"])` without ceremony while still
  supporting the bulk shape `[[\"shop\" \"orders\"] [\"shop\" \"events\"]]`."
  [table-pairs]
  (cond
    (and (sequential? table-pairs)
         (= 2 (count table-pairs))
         (every? string? table-pairs))
    [table-pairs]

    :else
    table-pairs))

(defn fetch-indexes
  "Look up full index detail for the given `[[schema table] …]` pairs against
  `database`. A single `[schema table]` pair is also accepted as a
  convenience. Returns a vector of index info maps; each carries the
  `:definition` (raw `CREATE INDEX …` text from `pg_get_indexdef`) plus
  parsed-out structured fields (`:key_columns`, `:include_columns`,
  `:access_method`, `:partial_predicate`, …).

  Postgres only. Other drivers return `nil` and emit a warning — callers
  should fall back to `driver/describe-table-indexes` and tag the resulting
  context as partial."
  [driver database table-pairs]
  (let [pairs (normalise-pairs table-pairs)]
    (cond
      (not (isa? driver/hierarchy driver :postgres))
      (do (log/warnf "index-introspection only supports :postgres (got %s); falling back" driver)
          nil)

      (empty? pairs)
      []

      :else
      (sql-jdbc.execute/do-with-connection-with-options
       driver database nil
       (fn [^Connection conn] (query-indexes conn pairs))))))

(defn group-by-table
  "Turn the flat seq returned by `fetch-indexes` into a `{[schema table] [indexes…]}`
  map, normalising schema and table to lowercase (Postgres unquoted-identifier
  semantics) so callers can look up entries with values pulled from
  `pg_namespace.nspname` / `pg_class.relname` regardless of source casing."
  [indexes]
  (->> indexes
       (group-by (fn [{:keys [schema table]}]
                   [(some-> schema str/lower-case) (some-> table str/lower-case)]))))
