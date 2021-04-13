(ns metabase.test.data.sql.ddl
  "Methods for creating DDL statements for things like creating/dropping databases and loading data."
  (:require [honeysql.core :as hsql]
            [honeysql.format :as hformat]
            [honeysql.helpers :as h]
            [metabase.driver :as driver]
            [metabase.driver.sql.query-processor :as sql.qp]
            [metabase.test.data.interface :as tx]
            [metabase.test.data.sql :as sql.tx]
            [metabase.util :as u]
            [metabase.util.honeysql-extensions :as hx]))

(defmulti drop-db-ddl-statements
  "Return a sequence of DDL statements for dropping a DB using the multimethods in the SQL test extensons namespace, if
  applicable."
  {:arglists '([driver dbdef & {:keys [skip-drop-db?]}])}
  tx/dispatch-on-driver-with-test-extensions
  :hierarchy #'driver/hierarchy)

(defmethod drop-db-ddl-statements :sql/test-extensions
  [driver dbdef & {:keys [skip-drop-db?]}]
  (when-not skip-drop-db?
    (try
      [(sql.tx/drop-db-if-exists-sql driver dbdef)]
      (catch Throwable e
        (throw (ex-info "Error generating DDL statements for dropping database"
                        {:driver driver}
                        e))))))

(defn create-db-ddl-statements
  "DDL statements to create the DB itself (does not include statements to drop the DB if it already exists)."
  [driver dbdef]
  [(sql.tx/create-db-sql driver dbdef)])

(defmulti create-db-tables-ddl-statements
  "Return a default sequence of DDL statements for creating the tables/columns/etc. inside a Database. DOES NOT INCLUDE
  STATEMENTS FOR CREATING (OR DROPPING) THE DATABASE ITSELF."
  {:arglists '([driver dbdef & {:as options}])}
  tx/dispatch-on-driver-with-test-extensions
  :hierarchy #'driver/hierarchy)

(defmethod create-db-tables-ddl-statements :sql/test-extensions
  [driver {:keys [table-definitions], :as dbdef} & _]
  ;; Build combined statement for creating tables + FKs + comments
  (let [statements (atom [])
        add!       (fn [& stmnts]
                     (swap! statements concat (filter some? stmnts)))]
    ;; Add the SQL for creating each Table
    (doseq [tabledef table-definitions]
      (add! (sql.tx/drop-table-if-exists-sql driver dbdef tabledef)
            (sql.tx/create-table-sql driver dbdef tabledef)))

    ;; Add the SQL for adding FK constraints
    (doseq [{:keys [field-definitions], :as tabledef} table-definitions]
      (doseq [{:keys [fk], :as fielddef} field-definitions]
        (when fk
          (add! (sql.tx/add-fk-sql driver dbdef tabledef fielddef)))))
    ;; Add the SQL for adding table comments
    (doseq [{:keys [table-comment], :as tabledef} table-definitions]
      (when table-comment
        (add! (sql.tx/standalone-table-comment-sql driver dbdef tabledef))))
    ;; Add the SQL for adding column comments
    (doseq [{:keys [field-definitions], :as tabledef} table-definitions]
      (doseq [{:keys [field-comment], :as fielddef} field-definitions]
        (when field-comment
          (add! (sql.tx/standalone-column-comment-sql driver dbdef tabledef fielddef)))))
    @statements))

;; The methods below are currently only used by `:sql-jdbc` drivers, but you can use them to help implement your
;; `:sql` driver test extensions as well because there's nothing JDBC specific about them

(defmulti insert-rows-honeysql-form
  "Return an appropriate HoneySQL for inserting `row-or-rows` into a Table named by `table-identifier`."
  {:arglists '([driver, ^metabase.util.honeysql_extensions.Identifier table-identifier, row-or-rows])}
  tx/dispatch-on-driver-with-test-extensions
  :hierarchy #'driver/hierarchy)

(defmethod insert-rows-honeysql-form :sql/test-extensions
  [driver table-identifier row-or-rows]
  (let [rows    (u/one-or-many row-or-rows)
        columns (keys (first rows))
        values  (for [row rows]
                  (for [value (map row columns)]
                    (sql.qp/->honeysql driver value)))
        h-cols  (for [column columns]
                  (sql.qp/->honeysql driver
                    (hx/identifier :field (tx/format-name driver (u/qualified-name column)))))]
    ;; explanation for the hack that follows
    ;; h/columns has a varargs check to make sure you call it in a varargs manner, which means it checks whether the
    ;; first non-accumulator (i.e. not the map it's building) argument is a collection, and throws if so
    ;; unfortunately, (coll? (hx/identifier ...)) is true, so the varargs check fails if we have ONE column here
    ;; also, we can't simply call (h/columns (first h-cols)) here, because that returns only the (hx/identifier ...)
    ;; itself, and NOT a map like {:columns [(hx/identifier ...)]} like the rest of the builder fns are expecting
    ;; the change in behavior was introduced in honeysql 0.9.7 here:
    ;; https://github.com/seancorfield/honeysql/commit/4ca74f2b0d0f87827ce34d9baf8dcc8d086ce18e
    ;; so we seem to have no choice but to reimplement the n=1 case in a hacky manner ourselves :(
    (-> (case (count h-cols)
          ;; only 1 column, which is an Identifier; h/columns can't help us (see above)
          1 {:columns [(first h-cols)]}
          ;; at least two columns, so we can use h/columns, but the first param we pass to it must be a map, since
          ;; we're using the threading macro backwards
          (apply h/columns (conj h-cols {})))
        (h/insert-into table-identifier)
        (h/values values))))

(defmulti insert-rows-ddl-statements
  "Return appropriate SQL DDL statemtents for inserting `row-or-rows` (each row should be a map) into a Table named by
  `table-identifier`. Default implementation simply converts SQL generated by `insert-rows-honeysql-form` into SQL
  with `hsql/format`; in most cases you should only need to override that method. Override this instead if you do not
  want to use HoneySQL to generate the `INSERT` statement."
  {:arglists '([driver ^metabase.util.honeysql_extensions.Identifier table-identifier row-or-rows])}
  tx/dispatch-on-driver-with-test-extensions
  :hierarchy #'driver/hierarchy)

(defmethod insert-rows-ddl-statements :sql/test-extensions
  [driver table-identifier row-or-rows]
  [(binding [hformat/*subquery?* false]
     (hsql/format (insert-rows-honeysql-form driver table-identifier row-or-rows)
       :quoting             (sql.qp/quote-style driver)
       :allow-dashed-names? true))])
