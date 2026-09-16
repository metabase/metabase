(ns metabase.app-db.sql-errors
  "Classification of SQL errors raised by the supported application databases.

  The registry maps name every code we recognize, so call sites and greps read intent rather than bare
  strings. [[error-kind]] is the entry point: it walks an exception's cause chain and names the first
  recognized error class as a keyword for callers to dispatch on."
  (:import
   (java.sql SQLException)))

(set! *warn-on-reflection* true)

(def sql-states
  "SQLSTATE codes returned by supported application databases."
  ;; `undefined_table` is PostgreSQL-specific; the rest are X/Open. H2 uses three missing-table states,
  ;; corresponding to `TABLE_OR_VIEW_NOT_FOUND_1`, `..._WITH_CANDIDATES_2`, and `..._DATABASE_EMPTY_1` in
  ;; `org.h2.api.ErrorCode`.
  {:undefined-table                         "42P01"
   :table-or-view-not-found                 "42S02"
   :table-or-view-not-found-with-candidates "42S03"
   :table-or-view-not-found-database-empty  "42S04"
   :unique-violation                        "23505"
   :integrity-constraint-violation          "23000"})

(def error-codes
  "Vendor-specific error codes returned by supported application databases."
  ;; MySQL and MariaDB use one SQLSTATE for every integrity-constraint failure, so `ER_DUP_ENTRY` identifies
  ;; duplicate keys.
  {:mysql/duplicate-entry 1062})

(def ^:private table-not-found-states
  (into #{} (map sql-states) [:undefined-table
                              :table-or-view-not-found
                              :table-or-view-not-found-with-candidates
                              :table-or-view-not-found-database-empty]))

(defn- sql-error-kind [^SQLException e]
  (let [state (.getSQLState e)]
    (cond
      (contains? table-not-found-states state)
      :table-not-found

      (= (sql-states :unique-violation) state)
      :duplicate-key

      ;; The vendor code disambiguates MySQL's catch-all integrity-constraint state, so no db-type is needed.
      (and (= (sql-states :integrity-constraint-violation) state)
           (= (error-codes :mysql/duplicate-entry) (.getErrorCode e)))
      :duplicate-key)))

(defn error-kind
  "The class of database error `e` represents: `:table-not-found`, `:duplicate-key`, or nil when unrecognized.
  Walks the full exception cause chain; the first recognized class wins."
  [e]
  (some #(when (instance? SQLException %)
           (sql-error-kind %))
        (take-while some? (iterate ex-cause e))))
