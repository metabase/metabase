(ns metabase.cmd.load-from-h2
  "Commands for loading data from an H2 file into another database. Run this with

    clojure -M:run load-from-h2

  or

    java --add-opens java.base/java.nio=ALL-UNNAMED -jar metabase.jar load-from-h2

  Test this as follows:

    # Postgres
    psql -c 'DROP DATABASE IF EXISTS metabase;'
    psql -c 'CREATE DATABASE metabase;'
    MB_DB_TYPE=postgres MB_DB_HOST=localhost MB_DB_PORT=5432 MB_DB_USER=camsaul MB_DB_DBNAME=metabase clojure -M:run load-from-h2

    # MySQL
    mysql -u root -e 'DROP DATABASE IF EXISTS metabase; CREATE DATABASE metabase;'
    MB_DB_TYPE=mysql MB_DB_HOST=localhost MB_DB_PORT=3305 MB_DB_USER=root MB_DB_DBNAME=metabase clojure -M:run load-from-h2"
  (:require
   [metabase.app-db.core :as mdb]
   [metabase.cmd.copy :as copy]
   [metabase.cmd.copy.h2 :as copy.h2]
   [metabase.search.core :as search]
   [metabase.util.encryption :as encryption]
   [metabase.util.log :as log]))

(defn load-from-h2!
  "Transfer data from existing H2 database to a newly created (presumably MySQL or Postgres) DB. Intended as a tool for
  upgrading from H2 to a 'real' database.

  Defaults to using [[metabase.app-db.env/db-file]] as the source H2 database if `h2-filename` is `nil`."
  ([]
   (load-from-h2! (mdb/db-file)))
  ([h2-filename]
   (let [h2-filename    (str h2-filename ";IFEXISTS=TRUE")
         h2-data-source (copy.h2/h2-data-source h2-filename)]
     (copy/copy! :h2 h2-data-source (mdb/db-type) (mdb/data-source))
     ;; The rows were copied verbatim, sentinel included, so the target is in whatever state the H2 file was in.
     (let [status (mdb/encryption-check-status)]
       (cond
         (= status :invalid)
         (throw (ex-info (str "The H2 database is encrypted with a different key than the MB_ENCRYPTION_SECRET_KEY "
                              "environment contains (or the key is not set)")
                         {}))

         (and (= status :absent) (encryption/default-encryption-enabled?))
         (do
           (log/info "MB_ENCRYPTION_SECRET_KEY is set and the loaded data is not encrypted. Encrypting...")
           (mdb/encrypt-db (mdb/db-type) (mdb/data-source) nil))))
     (search/reset-tracking!))))
