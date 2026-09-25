(ns dev.sqlite-baseline
  "Generate the v65 SQLite baseline from a newly created H2 database, never from a user's application database.

  (export! \"/tmp/sqlite-reference.json\")
  Then: python3 bin/sqlite/generate_baseline.py /tmp/sqlite-reference.json

  Freeze the SQL and changeset manifest together before shipping SQLite support. Do not regenerate a shipped baseline."
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.string :as str]
   [metabase.app-db.connection :as connection]
   [metabase.app-db.custom-migrations.util :as custom-migrations.util]
   [metabase.app-db.liquibase :as liquibase]
   [metabase.app-db.liquibase.sqlite :as sqlite]
   [metabase.util.json :as json])
  (:import
   (java.sql Connection)
   (java.util UUID)
   (org.h2.jdbcx JdbcDataSource)))

(set! *warn-on-reflection* true)

(defn- reference-schema
  [^Connection conn]
  (let [query #(jdbc/query {:connection conn} %)
        metadata (.getMetaData conn)
        tables (query (str "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES "
                           "WHERE TABLE_SCHEMA='PUBLIC' AND TABLE_TYPE='BASE TABLE' ORDER BY TABLE_NAME"))]
    ;; Realize JDBC results while the isolated reference connection remains open.
    {:tables
     (mapv (fn [{table :table_name}]
             {:name table
              :columns (query (str "SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA='PUBLIC' "
                                   "AND TABLE_NAME='" table "' ORDER BY ORDINAL_POSITION"))
              :pk (jdbc/metadata-query (.getPrimaryKeys metadata nil "PUBLIC" table))
              :fk (jdbc/metadata-query (.getImportedKeys metadata nil "PUBLIC" table))
              :indexes (jdbc/metadata-query (.getIndexInfo metadata nil "PUBLIC" table false false))
              :rows (query (str "SELECT * FROM " table))})
           (remove #(str/starts-with? (:table_name %) "DATABASECHANGELOG") tables))
     :checks (query (str "SELECT TC.TABLE_NAME, CC.CHECK_CLAUSE FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS TC "
                         "JOIN INFORMATION_SCHEMA.CHECK_CONSTRAINTS CC USING(CONSTRAINT_CATALOG, CONSTRAINT_SCHEMA, CONSTRAINT_NAME) "
                         "WHERE TC.CONSTRAINT_TYPE='CHECK' AND TC.TABLE_SCHEMA='PUBLIC'"))
     :views (query (str "SELECT TABLE_NAME, VIEW_DEFINITION FROM INFORMATION_SCHEMA.VIEWS "
                        "WHERE TABLE_SCHEMA='PUBLIC' ORDER BY TABLE_NAME"))}))

(defn export!
  "Migrate an isolated empty H2 reference and export public seed rows/schema plus the exact baseline boundary.
  The live app DB and scheduler are never used. The output is input to bin/sqlite/generate_baseline.py."
  [output-path]
  (let [source (doto (JdbcDataSource.)
                 (.setURL (str "jdbc:h2:mem:sqlite-baseline-" (UUID/randomUUID))))]
    ;; Keep one connection alive for the complete migration/export; closing it destroys the reference DB.
    (with-open [conn (.getConnection source)]
      (binding [connection/*application-db* (connection/application-db :h2 source)
                custom-migrations.util/*allow-temp-scheduling* false]
        (liquibase/with-liquibase [lb conn]
          (.update lb "")
          (let [reference (reference-schema conn)
                users (:rows (first (filter #(= (:name %) "CORE_USER") (:tables reference))))]
            (assert (every? #(and (= "internal" (:type %)) (nil? (:password %)) (nil? (:reset_token %))) users)
                    "Only the inactive internal seed user may be included in the baseline")
            (spit output-path (json/encode reference))
            (spit "resources/sqlite/baseline-changesets.edn"
                  (str ";; Exact historical [logical-path author id] identities represented by baseline.sql.\n#{\n"
                       (str/join "\n" (sort (map (comp pr-str sqlite/changeset-identity)
                                                 (.getChangeSets (.getDatabaseChangeLog lb)))))
                       "\n}\n")))))))
  output-path)
