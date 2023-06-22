(ns metabase.test.data.sql.ddl
  "Methods for creating DDL statements for things like creating/dropping databases and loading data."
  (:require
   [honey.sql.helpers :as sql.helpers]
   [metabase.driver :as driver]
   [metabase.driver.ddl.interface :as ddl.i]
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
    (doseq [{:keys [field-definitions], :as tabledef} table-definitions
            {:keys [fk], :as fielddef}                field-definitions]
      (when fk
        (add! (sql.tx/add-fk-sql driver dbdef tabledef fielddef))))
    ;; Add the SQL for adding table comments
    (doseq [{:keys [table-comment], :as tabledef} table-definitions]
      (when table-comment
        (add! (sql.tx/standalone-table-comment-sql driver dbdef tabledef))))
    ;; Add the SQL for adding column comments
    (doseq [{:keys [field-definitions], :as tabledef} table-definitions
            {:keys [field-comment], :as fielddef}     field-definitions
            :when                                     field-comment]
      (add! (sql.tx/standalone-column-comment-sql driver dbdef tabledef fielddef)))
    @statements))

;; The methods below are currently only used by `:sql-jdbc` drivers, but you can use them to help implement your
;; `:sql` driver test extensions as well because there's nothing JDBC specific about them

(defmulti insert-rows-honeysql-form
  "Return an appropriate Honey SQL form for inserting `row-or-rows` (as maps) into a Table named by `table-identifier`."
  {:arglists '([driver table-identifier row-or-rows])}
  tx/dispatch-on-driver-with-test-extensions
  :hierarchy #'driver/hierarchy)

(defmethod insert-rows-honeysql-form :sql/test-extensions
  [driver table-identifier row-or-rows]
  (let [rows    (u/one-or-many row-or-rows)
        columns (keys (first rows))
        values  (mapv (fn [row]
                        (try
                          (mapv (fn [column]
                                  (let [value (get row column)]
                                    ;; don't double-compile `:raw` forms
                                    (if (and (vector? value)
                                             (= (first value) :raw))
                                      value
                                      (sql.qp/->honeysql driver value))))
                                columns)
                          (catch Throwable e
                            (throw (ex-info (format "Error compiling test data row: %s" (ex-message e))
                                            {:driver driver, :row row}
                                            e)))))
                      rows)
        h-cols  (mapv (fn [column]
                        (sql.qp/->honeysql
                         driver
                         (hx/identifier :field (ddl.i/format-name driver (u/qualified-name column)))))
                      columns)]
    (-> (apply sql.helpers/columns {} h-cols)
        (assoc :insert-into (sql.qp/maybe-wrap-unaliased-expr table-identifier))
        (sql.helpers/values values))))

(defmulti insert-rows-ddl-statements
  "Return appropriate SQL DDL statemtents for inserting `row-or-rows` (each row should be a map) into a Table named by
  `table-identifier`. Default implementation simply converts SQL generated by `insert-rows-honeysql-form` into SQL
  with `hsql/format`; in most cases you should only need to override that method. Override this instead if you do not
  want to use HoneySQL to generate the `INSERT` statement."
  {:arglists '([driver ^metabase.util.honey_sql_1 table-identifier row-or-rows])}
  tx/dispatch-on-driver-with-test-extensions
  :hierarchy #'driver/hierarchy)

(defmethod insert-rows-ddl-statements :sql/test-extensions
  [driver table-identifier row-or-rows]
  (sql.qp/with-driver-honey-sql-version driver
    [(sql.qp/format-honeysql driver (insert-rows-honeysql-form driver table-identifier row-or-rows))]))
