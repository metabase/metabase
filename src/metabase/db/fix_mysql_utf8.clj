(ns metabase.db.fix-mysql-utf8
  "Logic for converting a MySQL/MariaDB database to the `utf8mb4` character set."
  (:require [clojure.java.jdbc :as jdbc]
            [clojure.tools.logging :as log]
            [metabase.util :as u]
            [metabase.util.i18n :refer [trs]])
  (:import java.sql.DatabaseMetaData))

(defn- db-character-set-and-collation [spec database-name]
  (first
   (jdbc/query spec (str "SELECT default_collation_name AS `collation`, default_character_set_name AS `character-set` "
                         "FROM information_schema.SCHEMATA "
                         (format "WHERE schema_name = \"%s\";" database-name)))))

(defn- table-names [^DatabaseMetaData metadata database-name]
  (reduce
   (fn [acc table]
     (conj acc (:table_name table)))
   []
   (jdbc/reducible-result-set (.getTables metadata database-name nil "%" (u/varargs String ["TABLE"])) nil)))

(defn- table-character-set-and-collation [spec database-name table-name]
  (first (jdbc/query spec (str "SELECT ccsa.collation_name AS `collation`, ccsa.character_set_name AS `character-set` "
                               "FROM information_schema.`TABLES` t,"
                               " information_schema.`COLLATION_CHARACTER_SET_APPLICABILITY` ccsa "
                               "WHERE ccsa.collation_name = t.table_collation"
                               (format "  AND t.table_schema = \"%s\"" database-name)
                               (format "  AND t.table_name = \"%s\";" table-name)))))

(defn- convert-to-utf8mb4-statements
  "Return a sequence of SQL statements needed to convert this MySQL database and its tables to the `utf8mb4` character
  set. If the database is already `utf8mb4`, this returns an empty seq."
  [jdbc-spec database-name]
  (log/infof "Checking whether application database '%s' needs to be converted to utf8mb4..." database-name)
  (let [statements
        (jdbc/with-db-connection [conn jdbc-spec]
          (doall
           (concat
            (if (= (db-character-set-and-collation conn database-name)
                   {:character-set "utf8mb4", :collation "utf8mb4_unicode_ci"})
              (log/debug "Default character set for application database is already in utf8mb4")
              [(format "ALTER DATABASE `%s` CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci;" database-name)])
            (jdbc/with-db-metadata [metadata conn]
              (->> (table-names metadata database-name)
                   (map (fn [table-name]
                          (if (= (table-character-set-and-collation conn database-name table-name)
                                 {:character-set "utf8mb4", :collation "utf8mb4_unicode_ci"})
                            (log/debug "Character set for table '%s' is already utf8mb4" table-name)
                            (format "ALTER TABLE `%s` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
                                    table-name))))
                   (filter some?))))))]
    (when (seq statements)
      (concat ["SET foreign_key_checks = 0;"]
              statements
              ["SET foreign_key_checks = 1;"]))))

(defn convert-to-utf8mb4!
  "Convert a MySQL database to the `utf8mb4` encoding if it is not already in that encoding."
  [jdbc-spec database-name]
  (jdbc/with-db-connection [conn jdbc-spec]
    (when-let [statements (seq (convert-to-utf8mb4-statements conn database-name))]
      (log/info (trs "Converting application database to utf8mb4 character set..."))
      (doseq [statement statements]
        (log/info statement)
        (jdbc/execute! conn statement))
      (log/info (trs "Successfully converted application database to utf8mb4 character set.")))))
