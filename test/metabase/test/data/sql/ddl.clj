(ns metabase.test.data.sql.ddl
  (:require [metabase.driver :as driver]
            [metabase.test.data
             [interface :as tx]
             [sql :as sql.tx]]
            [metabase.util :as u]))

(defmulti drop-db-ddl-statements
  "Return a sequence of DDL statements for dropping a DB using the multimethods in the SQL test extensons namespace, if
  applicable."
  {:arglists '([driver dbdef & {:keys [skip-drop-db?]}])}
  tx/dispatch-on-driver-with-test-extensions
  :hierarchy #'driver/hierarchy)

(defmethod drop-db-ddl-statements :sql/test-extensions
  [driver dbdef & {:keys [skip-drop-db?]}]
  (when-not skip-drop-db?
    ;; Exec SQL for creating the DB
    [(sql.tx/drop-db-if-exists-sql driver dbdef)
     (sql.tx/create-db-sql driver dbdef)]))


(defmulti create-db-ddl-statements
  "Return a default sequence of DDL statements for creating a DB (not including dropping it)."
  {:arglists '([driver dbdef & {:as options}])}
  tx/dispatch-on-driver-with-test-extensions
  :hierarchy #'driver/hierarchy)

(defmethod create-db-ddl-statements :sql/test-extensions
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
