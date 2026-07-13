(ns metabase.sql-parsing.rewrite
  "SQL-to-SQL transformations: renaming identifiers, adding INTO clauses, and dialect
  transpilation. All of them parse to the polyglot AST, transform it, and generate SQL back."
  (:require
   [clojure.string :as str]
   [clojure.walk :as walk]
   [metabase.sql-parsing.ast :as ast]
   [metabase.sql-parsing.ffi :as ffi]))

(set! *warn-on-reflection* true)

;;; ------------------------------------------- identifier quoting -------------------------------------------

(defn- unquote-identifier
  "If `s` is already a quoted identifier in `dialect` (e.g. `\"foo\"` in Postgres), return
  `[unquoted-name true]`, otherwise `[s false]`."
  [dialect s]
  (or (try
        (let [parsed (ffi/parse-one dialect (str "SELECT 1 AS " s))
              ident  (get-in parsed [:select :expressions 0 :alias :alias])]
          (when (:quoted ident)
            [(:name ident) true]))
        (catch Exception _ nil))
      [s false]))

(defn- needs-quoting?
  "Whether an identifier must be quoted to survive generation (special characters or a leading
  digit)."
  [^String s]
  (boolean
   (and (seq s)
        (or (str/includes? s "-")
            (str/includes? s " ")
            (Character/isDigit (.charAt s 0))))))

(defn- renamed-ident
  "Identifier map for a replacement name, unwrapping quotes the caller may have included and
  keeping the original reference's quoting when it had any."
  [dialect raw-name original-quoted?]
  (let [[unquoted was-quoted?] (unquote-identifier dialect raw-name)]
    {:name              unquoted
     :quoted            (boolean (or original-quoted? was-quoted? (needs-quoting? unquoted)))
     :trailing_comments []}))

;;; ------------------------------------------- replace-names -------------------------------------------

(defn- apply-table-target
  "Apply a `{:db? :schema? :table?}` replacement target to table content `c`. A key that is
  present with a nil value clears that qualifier."
  [dialect c target quoted-flags]
  (reduce (fn [c [target-key ast-key quoted?]]
            (cond
              (get target target-key)      (assoc c ast-key (renamed-ident dialect (get target target-key) quoted?))
              (and (contains? target target-key)
                   (nil? (get target target-key))) (assoc c ast-key nil)
              :else                        c))
          c
          [[:db :catalog (:db quoted-flags)]
           [:schema :schema (:schema quoted-flags)]
           [:table :name (:table quoted-flags)]]))

(defn- rename-table
  [dialect c {:keys [schemas table-map]}]
  (let [orig-db      (get-in c [:catalog :name])
        orig-schema  (get-in c [:schema :name])
        orig-table   (get-in c [:name :name])
        quoted-flags {:db     (boolean (get-in c [:catalog :quoted]))
                      :schema (boolean (get-in c [:schema :quoted]))
                      :table  (boolean (get-in c [:name :quoted]))}
        c            (if-let [new-schema (and orig-schema (get schemas orig-schema))]
                       (assoc c :schema (renamed-ident dialect new-schema (:schema quoted-flags)))
                       c)
        ;; most-specific key first, so a mapping that includes the catalog only applies to
        ;; references with that catalog, while catalog-less mappings match any reference
        new-table    (or (get table-map [orig-db orig-schema orig-table])
                         (get table-map [nil orig-schema orig-table])
                         (get table-map [nil nil orig-table]))]
    (cond
      (nil? new-table) c
      (map? new-table) (apply-table-target dialect c new-table quoted-flags)
      :else            (assoc c :name (renamed-ident dialect new-table (:table quoted-flags))))))

(defn- rename-column
  [c {:keys [columns]}]
  (let [col-name  (get-in c [:name :name])
        col-table (not-empty (get-in c [:table :name]))
        quoted?   (boolean (get-in c [:name :quoted]))
        new-name  (some (fn [[k new-name]]
                          (when (= (:column k) col-name)
                            (if col-table
                              (when (= (:table k) col-table) new-name)
                              ;; unqualified references accept a match against any table
                              new-name)))
                        columns)]
    (cond-> c
      new-name (assoc :name {:name new-name :quoted quoted? :trailing_comments []}))))

(defn replace-names
  "Replace schema, table, and column names in `sql`, preserving aliases and quoting.

  `replacements` may contain:
  - `:schemas` — map of old schema name -> new schema name
  - `:tables`  — pairs of `[{:db? .. :schema? .. :table ..} target]` where target is a new table
    name string or a `{:db? :schema? :table?}` map (a nil value for a present key clears that
    qualifier)
  - `:columns` — pairs of `[{:schema? .. :table? .. :column ..} new-name]`

  Replacement values are injected into the AST as identifier names without sanitization, so they
  must be system-generated, never user input."
  [dialect sql {:keys [schemas tables columns]}]
  (let [ctx   {:schemas   schemas
               :table-map (into {}
                                (map (fn [[k target]]
                                       [[(:db k) (:schema k) (:table k)] target]))
                                tables)
               :columns   (vec columns)}
        stmts (ffi/parse dialect sql)
        renamed (walk/postwalk
                 (fn [node]
                   (cond
                     (ast/table-content? node)  (rename-table dialect node ctx)
                     (ast/column-content? node) (rename-column node ctx)
                     :else                      node))
                 stmts)]
    (str/join "; " (ffi/generate dialect renamed))))

;;; ------------------------------------------- add-into-clause -------------------------------------------

(defn add-into-clause
  "Add an INTO clause to a SELECT statement (SQL Server `SELECT ... INTO ... FROM ...` syntax).
  `table-name` is used as already formatted/quoted. Throws if `sql` is not a SELECT."
  [dialect sql table-name]
  (let [parsed (ffi/parse-one dialect sql)]
    (when-not (= (ast/tag parsed) :select)
      (throw (ex-info "SQL must be a SELECT statement" {:sql sql})))
    ;; parse a template with the pre-formatted table name so its quoting is preserved exactly
    (let [into-node (-> (ffi/parse-one dialect (str "SELECT * INTO " table-name " FROM t"))
                        (get-in [:select :into]))]
      (ffi/generate-one dialect (assoc-in parsed [:select :into] into-node)))))

;;; ------------------------------------------- transpile -------------------------------------------

(def ^:private metabase-template-pattern
  "Metabase template syntax: `{{variable}}`, `{{#model}}`, `{{snippet: ..}}`, `[[optional]]`.
  Templated queries are not valid SQL, so transpilation is skipped for them."
  #"\{\{|\[\[")

(def ^:private case-sensitive-dialects
  "Dialects that fold unquoted identifiers (to uppercase or lowercase). Transpiling from or to one
  of these quotes every identifier so mixed-case identifiers survive the round trip."
  #{"snowflake" "oracle" "redshift" "postgres"})

(defn- quote-all-identifiers
  [node]
  (walk/postwalk
   (fn [x]
     (if (and (map? x) (string? (:name x)) (contains? x :quoted))
       (assoc x :quoted true)
       x))
   node))

(def ^:private multiple-statements-error
  "Multiple SQL statements are not supported. Please provide a single query.")

(defn transpile-sql
  "Transpile `sql` between dialects. Returns `{:status :success :transpiled-sql ..}`,
  `{:status :skipped :reason .. :transpiled-sql ..}` for templated queries or missing dialects, or
  `{:status :error :error-message ..}`."
  [sql from-dialect to-dialect]
  (cond
    (re-find metabase-template-pattern sql)
    {:transpiled-sql sql :status :skipped :reason :contains-templates}

    (or (nil? from-dialect) (nil? to-dialect))
    {:transpiled-sql sql :status :skipped :reason :missing-dialect}

    :else
    (try
      (let [identify?  (boolean (or (case-sensitive-dialects from-dialect)
                                    (case-sensitive-dialects to-dialect)))
            transpiled (if identify?
                         (->> (ffi/parse from-dialect sql)
                              quote-all-identifiers
                              (ffi/generate to-dialect)
                              (mapv #(first (ffi/format-sql to-dialect %))))
                         (ffi/transpile from-dialect to-dialect sql {:pretty true}))]
        (if (> (count transpiled) 1)
          {:status :error :error-message multiple-statements-error}
          {:transpiled-sql (first transpiled) :status :success}))
      (catch Exception e
        {:status :error :error-message (ex-message e)}))))
