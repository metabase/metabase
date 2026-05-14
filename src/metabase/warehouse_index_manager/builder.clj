(ns metabase.warehouse-index-manager.builder
  "Render a structured index definition into a CREATE INDEX statement.

  The structured form covers the common case: regular btree (or
  gin/gist/…) indexes on one or more columns of a single table, optional
  INCLUDE columns, UNIQUE / CONCURRENTLY / IF NOT EXISTS toggles, and
  ASC/DESC per key column. Anything more — partial WHERE clauses,
  expression indexes, operator classes, storage parameters, NULLS
  FIRST/LAST ordering — is out of scope; the user falls back to the
  raw-SQL editor.

  Pipeline:

    `structured` → tagged hiccup tree → SQL string

  We render ourselves instead of leaning on HoneySQL's `:create-index`
  because HoneySQL's clause emits all pre-options (UNIQUE *and*
  CONCURRENTLY) before the `INDEX` keyword, which is wrong: Postgres
  wants `CREATE [UNIQUE] INDEX [CONCURRENTLY] [IF NOT EXISTS] …`.
  HoneySQL has no extension point that lets us inject between `INDEX`
  and the index name.

  Identifiers are quoted Postgres-style (double quotes, with embedded
  `\"` doubled). Postgres-only today."
  (:require
   [clojure.string :as str]))

(set! *warn-on-reflection* true)

(def valid-methods
  "Index access methods we accept in `:method` — map onto pg_am names."
  #{:btree :hash :gin :gist :brin :spgist})

(def valid-directions #{:asc :desc})

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
;;; structured → hiccup

(defn- structured->hiccup
  "Lift a validated `structured` request + target into a tag-prefixed
  data tree. Defaults are baked in here so the renderer never sees nil
  for a toggle."
  [{:keys [schema table]}
   {:keys [index_name columns include unique concurrent if_not_exists method]
    :or   {unique false, concurrent true, if_not_exists true, method :btree}}]
  [:create-index
   {:unique?        (boolean unique)
    :concurrent?    (boolean concurrent)
    :if-not-exists? (boolean if_not_exists)
    :method         (keyword method)}
   [:ident index_name]
   [:qualified-ident schema table]
   (into [:key-columns] (for [{col-name :name dir :direction} columns]
                          [:column col-name (some-> dir keyword)]))
   (when (seq include)
     (into [:include] (for [c include] [:ident c])))])

;;; ---------------------------------------------------------------------------
;;; hiccup → string

(defn- quote-ident [ident]
  (str \" (str/replace (str ident) "\"" "\"\"") \"))

(defmulti ^:private render-node first)

(defmethod render-node :ident [[_ ident]]
  (quote-ident ident))

(defmethod render-node :qualified-ident [[_ schema table]]
  (str (quote-ident schema) "." (quote-ident table)))

(defmethod render-node :column [[_ col-name dir]]
  (str/join " "
            (keep identity
                  [(quote-ident col-name)
                   (some-> dir name str/upper-case)])))

(defmethod render-node :key-columns [[_ & cols]]
  (str "(" (str/join ", " (map render-node cols)) ")"))

(defmethod render-node :include [[_ & cols]]
  (str "INCLUDE (" (str/join ", " (map render-node cols)) ")"))

(defmethod render-node :create-index
  [[_ {:keys [unique? concurrent? if-not-exists? method]}
    name-node target-node cols-node include-node]]
  (str/join " "
            (keep identity
                  ["CREATE"
                   (when unique?         "UNIQUE")
                   "INDEX"
                   (when concurrent?     "CONCURRENTLY")
                   (when if-not-exists?  "IF NOT EXISTS")
                   (render-node name-node)
                   "ON"
                   (render-node target-node)
                   (when (not= method :btree)
                     (str "USING " (name method)))
                   (render-node cols-node)
                   (when include-node (render-node include-node))])))

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
  (let [hiccup    (structured->hiccup target structured)
        statement (render-node hiccup)
        warnings  (cond-> []
                    (not concurrent)
                    (conj "CONCURRENTLY is recommended to avoid taking an ACCESS EXCLUSIVE lock on the table"))]
    {:statement statement
     :warnings  warnings}))
