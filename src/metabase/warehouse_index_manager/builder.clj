(ns metabase.warehouse-index-manager.builder
  "Render a structured index definition into a CREATE INDEX statement.

  The structured form covers the common case: regular btree (or
  gin/gist/…) indexes on one or more columns of a single table, optional
  INCLUDE columns, UNIQUE / CONCURRENTLY / IF NOT EXISTS toggles. Anything
  more (partial WHERE clauses, expression indexes, operator classes,
  storage parameters) is out of scope — the user falls back to the raw-SQL
  editor.

  Identifiers are always emitted double-quoted, with embedded `\"`
  escaped by doubling, so the rendered statement round-trips through
  `ddl-parse/parse`."
  (:require
   [clojure.string :as str]))

(set! *warn-on-reflection* true)

(def valid-methods
  "Index access methods we accept in `:method` — map onto pg_am names."
  #{:btree :hash :gin :gist :brin :spgist})

(def valid-directions #{:asc :desc})
(def valid-nulls      #{:first :last})

(defn- quote-ident [^String ident]
  (str \" (str/replace ident "\"" "\"\"") \"))

(defn- render-column [{col-name :name dir :direction nulls :nulls}]
  (str (quote-ident col-name)
       (when dir   (str " " (str/upper-case (name dir))))
       (when nulls (str " NULLS " (str/upper-case (name nulls))))))

(defn- check-known-column! [known-columns col-name kind]
  (when-not (contains? known-columns (str/lower-case col-name))
    (throw (ex-info (format "Unknown %s column %s" (name kind) col-name)
                    {:reason :unknown-column
                     :column col-name
                     :kind   kind}))))

(defn- validate! [{:keys [index_name columns include method] :as structured} known-columns]
  (when (str/blank? (str index_name))
    (throw (ex-info "index_name is required" {:reason :missing-index-name})))
  (when (empty? columns)
    (throw (ex-info "columns must be non-empty" {:reason :empty-columns})))
  (when (and method (not (contains? valid-methods (keyword method))))
    (throw (ex-info (str "Unknown index method: " method)
                    {:reason :unknown-method :method method})))
  (doseq [{col-name :name dir :direction nulls :nulls} columns]
    (when (str/blank? (str col-name))
      (throw (ex-info "column :name is required for every key column"
                      {:reason :missing-column-name})))
    (when (and dir (not (contains? valid-directions (keyword dir))))
      (throw (ex-info (str "Bad direction: " dir)
                      {:reason :bad-direction :direction dir})))
    (when (and nulls (not (contains? valid-nulls (keyword nulls))))
      (throw (ex-info (str "Bad nulls position: " nulls)
                      {:reason :bad-nulls :nulls nulls})))
    (check-known-column! known-columns col-name :key))
  (doseq [col-name include]
    (when (str/blank? (str col-name))
      (throw (ex-info "INCLUDE column names cannot be blank"
                      {:reason :missing-include-name})))
    (check-known-column! known-columns col-name :include))
  structured)

(defn build-statement
  "Render `structured` into a CREATE INDEX statement against `schema.table`.

  `known-columns` is a set of lowercase column names of the target table —
  used to validate that every column referenced exists. Throws ex-info
  with `:reason` on validation failure.

  Returns `{:statement <sql>, :warnings [<str>…]}`. Warnings cover
  non-blocking concerns (e.g. CONCURRENTLY recommended but the user
  turned it off)."
  [{:keys [schema table]} structured known-columns]
  (validate! structured known-columns)
  (let [{:keys [index_name columns include unique concurrent
                if_not_exists method]
         :or   {unique false, concurrent true, if_not_exists true, method :btree}}
        structured

        method     (keyword method)
        statement  (str "CREATE"
                        (when unique        " UNIQUE")
                        " INDEX"
                        (when concurrent    " CONCURRENTLY")
                        (when if_not_exists " IF NOT EXISTS")
                        " " (quote-ident index_name)
                        " ON " (quote-ident schema) "." (quote-ident table)
                        (when (not= method :btree)
                          (str " USING " (name method)))
                        " (" (str/join ", " (map render-column columns)) ")"
                        (when (seq include)
                          (str " INCLUDE (" (str/join ", " (map quote-ident include)) ")")))
        warnings   (cond-> []
                     (not concurrent)
                     (conj "CONCURRENTLY is recommended to avoid taking an ACCESS EXCLUSIVE lock on the table"))]
    {:statement statement
     :warnings  warnings}))
