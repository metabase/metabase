(ns metabase.cmd.load-from-h2
  "Commands for loading data from an H2 file into another database. Run this with

    lein run load-from-h2

  or

    java -jar metabase.jar load-from-h2

  Test this as follows:

    # Postgres
    psql -c 'DROP DATABASE IF EXISTS metabase;'
    psql -c 'CREATE DATABASE metabase;'
    MB_DB_TYPE=postgres MB_DB_HOST=localhost MB_DB_PORT=5432 MB_DB_USER=camsaul MB_DB_DBNAME=metabase lein run load-from-h2

    # MySQL
    mysql -u root -e 'DROP DATABASE IF EXISTS metabase; CREATE DATABASE metabase;'
    MB_DB_TYPE=mysql MB_DB_HOST=localhost MB_DB_PORT=3305 MB_DB_USER=root MB_DB_DBNAME=metabase lein run load-from-h2"
  (:require [metabase.cmd.copy :as copy]
            [metabase.cmd.copy.h2 :as copy.h2]
            [metabase.db.connection :as mdb.conn]
            [metabase.db.env :as mdb.env]))

(defn load-from-h2!
  "Transfer data from existing H2 database to a newly created (presumably MySQL or Postgres) DB. Intended as a tool for
  upgrading from H2 to a 'real' database.

  Defaults to using `@metabase.db.env/db-file` as the source H2 database if `h2-filename` is `nil`."
  ([]
   (load-from-h2! @mdb.env/db-file))
  ([h2-filename]
   (let [h2-filename  (str h2-filename ";IFEXISTS=TRUE")
         h2-jdbc-spec (copy.h2/h2-jdbc-spec h2-filename)]
     (copy/copy! :h2 h2-jdbc-spec (mdb.conn/db-type) (mdb.conn/jdbc-spec)))))
