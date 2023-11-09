(ns change.strict
  (:require
   [clojure.spec.alpha :as s]
   [clojure.string :as str]
   [column.strict]))

(comment column.strict/keep-me)

(s/def ::tableName
  string?)

(s/def ::column
  (s/keys :req-un [:column.strict/column]))

(s/def :change.strict.add-column/columns
  (s/alt :column ::column))

(s/def ::addColumn
  (s/keys :req-un [:change.strict.add-column/columns ::tableName]))

(s/def ::remarks
  string?)

(s/def :change.strict.create-table/columns
  (s/+ (s/alt :column ::column)))

(s/def ::createTable
  ;; remarks are required for new tables in strict mode
  (s/keys :req-un [:change.strict.create-table/columns ::remarks ::tableName]))

;; createIndex *must* include an explicit index name.
(s/def ::indexName
  #(str/starts-with? % "idx_"))

(s/def ::createIndex
  (s/keys :req-un [::indexName]))

(s/def :custom-change/class (every-pred string? (complement str/blank?)))

(s/def ::customChange
  (s/keys :req-un [:custom-change/class]))

(s/def ::change
  (s/keys :opt-un [::addColumn ::createTable ::createIndex ::customChange]))

(s/def :change.strict.dbms-qualified-sql-change.sqlfile/dbms
  string?)

(s/def :change.strict.dbms-qualified-sql-change.sqlFile/path
  string?)

(s/def :change.strict.dbms-qualified-sqlFile-change.sqlFile/relativeToChangelogFile
  boolean?)

(s/def :change.strict.dbms-qualified-sqlFile-change/sqlFile
  (s/keys :req-un [:change.strict.dbms-qualified-sqlFile-change.sqlFile/dbms
                   :change.strict.dbms-qualified-sqlFile-change.sqlFile/path
                   :change.strict.dbms-qualified-sqlFile-change.sqlFile/relativeToChangelogFile]))

(s/def ::dbms-qualified-sqlFile-change
  (s/merge
   ::change
   (s/keys :req-un [:change.strict.dbms-qualified-sqlFile-change/sqlFile])))

(s/def :change.strict.dbms-qualified-sql-change.sql/dbms
  string?)

(s/def :change.strict.dbms-qualified-sql-change.sql/sql
  string?)

(s/def :change.strict.dbms-qualified-sql-change/sql
  (s/keys :req-un [:change.strict.dbms-qualified-sql-change.sql/dbms
                   :change.strict.dbms-qualified-sql-change.sql/sql]))

(s/def ::dbms-qualified-sql-change
  (s/merge
   ::change
   (s/keys :req-un [:change.strict.dbms-qualified-sql-change/sql])))
