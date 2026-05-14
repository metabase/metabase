(ns metabase.warehouse-index-manager.builder
  "Render a structured index definition into a CREATE INDEX statement
  via HoneySQL.

  The structured form covers the common case: regular btree (or
  gin/gist/…) indexes on one or more columns of a single table, optional
  INCLUDE columns, UNIQUE / CONCURRENTLY / IF NOT EXISTS toggles, and
  ASC/DESC per key column. Anything more — partial WHERE clauses,
  expression indexes, operator classes, storage parameters, NULLS
  FIRST/LAST ordering — is out of scope; the user falls back to the
  raw-SQL editor.

  Pipeline:

    `structured` → HoneySQL map → `sql/format` → SQL string

  HoneySQL handles identifier quoting (via the `:ansi` dialect with
  `:quoted true`) and assembles the basic shape. Postgres' INCLUDE
  clause isn't native to HoneySQL's `:create-index`, so we register a
  custom `::include` clause that appears after `:create-index` in the
  formatter order.

  Postgres-only today."
  (:require
   [clojure.string :as str]
   [honey.sql :as sql]))

(set! *warn-on-reflection* true)

(def valid-methods
  "Index access methods we accept in `:method` — map onto pg_am names."
  #{:btree :hash :gin :gist :brin :spgist})

(def valid-directions #{:asc :desc})

;;; ---------------------------------------------------------------------------
;;; ::include — HoneySQL extension for Postgres INCLUDE columns

(defn- format-include [_clause cols]
  [(str "INCLUDE ("
        (str/join ", " (map (comp sql/format-entity keyword) cols))
        ")")])

(sql/register-clause! ::include #'format-include nil)

;;; ---------------------------------------------------------------------------
;;; Validation

(defn- check-known-column! [known-columns col-name kind]
  (when-not (contains? known-columns (str/lower-case col-name))
    (throw (ex-info (format "Unknown %s column %s" (name kind) col-name)
                    {:reason :unknown-column
                     :column col-name
                     :kind   kind}))))

(defn- validate! [{:keys [index_name columns include method]} known-columns]
  (when (str/blank? (str index_name))
    (throw (ex-info "index_name is required" {:reason :missing-index-name})))
  (when (empty? columns)
    (throw (ex-info "columns must be non-empty" {:reason :empty-columns})))
  (when (and method (not (contains? valid-methods (keyword method))))
    (throw (ex-info (str "Unknown index method: " method)
                    {:reason :unknown-method :method method})))
  (doseq [{col-name :name dir :direction} columns]
    (when (str/blank? (str col-name))
      (throw (ex-info "column :name is required for every key column"
                      {:reason :missing-column-name})))
    (when (and dir (not (contains? valid-directions (keyword dir))))
      (throw (ex-info (str "Bad direction: " dir)
                      {:reason :bad-direction :direction dir})))
    (check-known-column! known-columns col-name :key))
  (doseq [col-name include]
    (when (str/blank? (str col-name))
      (throw (ex-info "INCLUDE column names cannot be blank"
                      {:reason :missing-include-name})))
    (check-known-column! known-columns col-name :include)))

;;; ---------------------------------------------------------------------------
;;; structured → HoneySQL

(defn- column->order-spec
  "HoneySQL's `:create-index` uses ORDER BY-style syntax for the column
  list. `:colname` → `\"colname\"`, `[:colname :asc]` → `\"colname\" ASC`."
  [{col-name :name dir :direction}]
  (let [col-kw (keyword col-name)]
    (if dir
      [col-kw (keyword (str/upper-case (name dir)))]
      col-kw)))

(defn- structured->honey
  [{:keys [schema table]}
   {:keys [index_name columns include unique concurrent if_not_exists method]
    :or   {unique false, concurrent true, if_not_exists true, method :btree}}]
  (let [index-spec (vec (concat
                         (when unique     [:unique])
                         (when concurrent [:concurrently])
                         [(keyword index_name)]
                         (when if_not_exists [:if-not-exists])))
        method-kw  (when (not= (keyword method) :btree)
                     ;; HoneySQL's create-index recognises `:using-<method>`
                     ;; as a single ident slot between the table and the
                     ;; column list.
                     (keyword (str "using-" (name method))))
        table-kw   (keyword (str schema "." table))
        on-clause  (vec (concat [table-kw]
                                (when method-kw [method-kw])
                                (map column->order-spec columns)))]
    (cond-> {:create-index [index-spec on-clause]}
      (seq include) (assoc ::include include))))

;;; ---------------------------------------------------------------------------
;;; Public API

(defn build-statement
  "Render `structured` into a CREATE INDEX statement against `schema.table`.

  `known-columns` is a set of lowercase column names of the target table —
  used to validate that every column referenced exists. Throws ex-info
  with `:reason` on validation failure.

  Returns `{:statement <sql>, :warnings [<str>…]}`. Warnings cover
  non-blocking concerns (e.g. CONCURRENTLY recommended but the user
  turned it off)."
  [target {:keys [concurrent] :or {concurrent true} :as structured} known-columns]
  (validate! structured known-columns)
  (let [honey       (structured->honey target structured)
        [statement] (sql/format honey {:dialect :ansi :quoted true})
        warnings    (cond-> []
                      (not concurrent)
                      (conj "CONCURRENTLY is recommended to avoid taking an ACCESS EXCLUSIVE lock on the table"))]
    {:statement statement
     :warnings  warnings}))
