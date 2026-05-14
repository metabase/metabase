(ns metabase.warehouse-index-manager.builder
  "Render a structured index definition into a CREATE INDEX statement
  via HoneySQL.

  The structured form covers the common case: regular btree (or
  gin/gist/…) indexes on one or more columns of a single table, optional
  INCLUDE columns, UNIQUE / CONCURRENTLY / IF NOT EXISTS toggles. Anything
  more (partial WHERE clauses, expression indexes, operator classes,
  storage parameters) is out of scope — the user falls back to the
  raw-SQL editor.

  Pipeline:

    `structured` → HoneySQL `{:create-index …}` map → `sql/format` → string

  HoneySQL handles all the identifier quoting (Postgres `:ansi` dialect)
  and the basic clauses. The two pieces it doesn't natively support —
  Postgres' `INCLUDE (…)` and `NULLS FIRST/LAST` ordering within a key
  column — are emitted via `[:raw …]` fragments built with
  `sql/format-entity`, so they participate in the same quoting pipeline.

  Postgres-only today."
  (:require
   [clojure.string :as str]
   [honey.sql :as sql]))

(set! *warn-on-reflection* true)

(def valid-methods
  "Index access methods we accept in `:method` — map onto pg_am names."
  #{:btree :hash :gin :gist :brin :spgist})

(def valid-directions #{:asc :desc})
(def valid-nulls      #{:first :last})

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
    (check-known-column! known-columns col-name :include)))

;;; ---------------------------------------------------------------------------
;;; structured → HoneySQL

(defn- key-column->order-spec
  "HoneySQL's `:create-index` uses order-by syntax for the column list.
  We render NULLS FIRST/LAST as a raw fragment because HoneySQL's
  order-by doesn't carry it through into create-index."
  [{col-name :name dir :direction nulls :nulls}]
  (let [col-kw     (keyword col-name)
        nulls-suffix (when nulls (str " NULLS " (str/upper-case (name nulls))))
        col-expr   (if nulls-suffix
                     [:raw (str (sql/format-entity col-kw) nulls-suffix)]
                     col-kw)]
    (if dir
      [col-expr (keyword (str/upper-case (name dir)))]
      [col-expr])))

(defn- include-clause
  "HoneySQL doesn't natively support Postgres' INCLUDE. We emit it as
  a `[:raw …]` fragment, but use `sql/format-entity` for every
  identifier so quoting stays consistent."
  [include]
  (when (seq include)
    [:raw (str "INCLUDE ("
               (str/join ", " (map (comp sql/format-entity keyword) include))
               ")")]))

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
                     (keyword (str "using-" (name method))))
        table-kw   (keyword (str schema "." table))
        col-specs  (mapv key-column->order-spec columns)
        on-clause  (vec (concat [table-kw]
                                (when method-kw [method-kw])
                                col-specs
                                (when-let [inc (include-clause include)]
                                  [inc])))]
    {:create-index [index-spec on-clause]}))

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
  (let [honey      (structured->honey target structured)
        [statement] (sql/format honey {:dialect :ansi :quoted true})
        warnings   (cond-> []
                     (not concurrent)
                     (conj "CONCURRENTLY is recommended to avoid taking an ACCESS EXCLUSIVE lock on the table"))]
    {:statement statement
     :warnings  warnings}))
