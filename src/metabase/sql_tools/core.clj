(ns metabase.sql-tools.core
  "Public API for sql-tools SQL parsing functionality.

   This namespace provides parser-agnostic functions that delegate to the
   configured backend (Macaw or SQLGlot) via multimethods.

   Note: Implementation namespaces (macaw.core, sqlglot.core) are loaded via
   metabase.sql-tools.init to avoid circular dependencies."
  (:require
   [metabase.sql-tools.interface :as interface]
   [metabase.sql-tools.settings :as sql-tools.settings]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [potemkin :as p]))

;;; -------------------------------------------------- Schemas --------------------------------------------------

(mr/def ::table-spec
  "Schema for table identifier used in replacements."
  [:map
   [:table :string]
   [:schema {:optional true} [:maybe :string]]])

(mr/def ::column-spec
  "Schema for column identifier used in replacements."
  [:map
   [:column :string]
   [:table {:optional true} [:maybe :string]]
   [:schema {:optional true} [:maybe :string]]])

(mr/def ::replacements
  "Schema for replace-names replacements map."
  [:map
   [:schemas {:optional true} [:map-of :string :string]]
   [:tables {:optional true} [:map-of ::table-spec :string]]
   [:columns {:optional true} [:map-of ::column-spec :string]]])

(mr/def ::replace-names-opts
  "Schema for replace-names options."
  [:map
   [:allow-unused? {:optional true} :boolean]])

(mr/def ::simple-query-result
  "Schema for simple-query? return value."
  [:map
   [:is_simple :boolean]
   [:reason {:optional true} :string]])

;; Re-export multimethod vars so implementations can use sql-tools/foo-impl
(p/import-vars
 [interface
  returned-columns-impl
  referenced-tables-impl
  referenced-fields-impl
  field-references-impl
  validate-query-impl
  replace-names-impl
  referenced-tables-raw-impl
  simple-query?-impl
  add-into-clause-impl])

(mu/defn returned-columns :- [:sequential :map]
  "Return appdb columns for the `native-query`."
  [driver :- :keyword
   native-query]
  (interface/returned-columns-impl (sql-tools.settings/sql-tools-parser-backend) driver native-query))

(mu/defn referenced-tables :- [:set :map]
  "Return tables referenced by the `native-query`"
  [driver :- :keyword
   native-query]
  (interface/referenced-tables-impl (sql-tools.settings/sql-tools-parser-backend) driver native-query))

(mu/defn referenced-fields :- [:set :map]
  "Return appdb fields referenced (used) by the `native-query`.

  This includes fields in SELECT, WHERE, JOIN ON, GROUP BY, ORDER BY, etc.
  Returns a set of :metadata/column maps."
  [driver :- :keyword
   native-query]
  (interface/referenced-fields-impl (sql-tools.settings/sql-tools-parser-backend) driver native-query))

(mu/defn field-references :- :metabase.sql-tools.macaw.references/field-references
  "Return field references for SQL string.

  Returns a map with:
  - :used-fields - set of field specs
  - :returned-fields - vector of field specs
  - :errors - set of validation errors"
  [driver :- :keyword
   sql-string :- :string]
  (interface/field-references-impl (sql-tools.settings/sql-tools-parser-backend) driver sql-string))

(mu/defn validate-query :- [:set :map]
  "Validate native query. Returns a set of validation errors (empty set if valid)."
  [driver :- :keyword
   native-query]
  (interface/validate-query-impl (sql-tools.settings/sql-tools-parser-backend) driver native-query))

(mu/defn replace-names :- :string
  "Replace schema, table, and column names in a SQL query.

   `replacements` is a map with optional keys:
   - :schemas  - map of old schema name -> new schema name
   - :tables   - map of old table name -> new table name
   - :columns  - map of {:table t :column c} -> new column name

   `opts` is an optional map with:
   - :allow-unused? - if true, don't error when a replacement isn't used

   Returns the modified SQL string."
  ([driver sql-string replacements]
   (replace-names driver sql-string replacements {}))
  ([driver :- :keyword
    sql-string :- :string
    replacements :- ::replacements
    opts :- ::replace-names-opts]
   (interface/replace-names-impl (sql-tools.settings/sql-tools-parser-backend) driver sql-string replacements opts)))

(mu/defn referenced-tables-raw :- [:set ::table-spec]
  "Given a driver and sql string, returns a set of form #{{:schema <name> :table <name>}...}."
  [driver :- :keyword
   sql-str :- :string]
  (interface/referenced-tables-raw-impl (sql-tools.settings/sql-tools-parser-backend) driver sql-str))

(mu/defn simple-query? :- ::simple-query-result
  "Check if SQL string is a simple SELECT (no LIMIT, OFFSET, or CTEs).
  Used by Workspaces to determine if automatic checkpoints can be inserted.

  Returns a map with:
  - `:is_simple` - boolean indicating if query is simple
  - `:reason` - string explaining why query is not simple (when false)"
  [sql-string :- :string]
  (interface/simple-query?-impl (sql-tools.settings/sql-tools-parser-backend) sql-string))

(mu/defn add-into-clause :- :string
  "Add an INTO clause to a SELECT statement.

  Transforms: 'SELECT * FROM products'
  Into:       'SELECT * INTO \"TABLE\" FROM products'

  Used by SQL Server compile-transform which requires SELECT INTO syntax
  instead of CREATE TABLE AS SELECT."
  [driver :- :keyword
   sql :- :string
   table-name :- :string]
  (interface/add-into-clause-impl (sql-tools.settings/sql-tools-parser-backend) driver sql table-name))
