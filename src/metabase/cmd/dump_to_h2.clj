(ns metabase.cmd.dump-to-h2
  "Commands for dumping data to an H2 file from app database.

  Run this as follows (h2 filename is optional):

    clojure -M:run dump-to-h2 '/path/to/metabase.db/'

  or

    java -jar metabase.jar dump-to-h2

  Validate with:

    clojure -M:run load-from-h2 '\"/path/to/metabase.db\"'"
  (:require
   [clojure.java.jdbc :as jdbc]
   [metabase.cmd.copy :as copy]
   [metabase.cmd.copy.h2 :as copy.h2]
   [metabase.cmd.rotate-encryption-key :as rotate-encryption]
   [metabase.db :as mdb]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(defn dump-to-h2!
  "Transfer data from existing database specified by connection string to the H2 DB specified by env vars. Intended as a
  tool for migrating from one instance to another using H2 as serialization target.

  Defaults to using [[metabase.db.env/db-file]] as the connection string.

  Target H2 DB will be deleted if it exists, unless `keep-existing?` is truthy."
  ([h2-filename]
   (dump-to-h2! h2-filename nil))

  ([h2-filename {:keys [keep-existing? dump-plaintext?]
                 :or   {keep-existing? false dump-plaintext? false}}]
   (let [h2-filename    (or h2-filename "metabase_dump.h2")
         h2-data-source (copy.h2/h2-data-source h2-filename)]
     (log/infof "Dumping from configured Metabase db to H2 file %s" h2-filename)
     (when-not keep-existing?
       (copy.h2/delete-existing-h2-database-files! h2-filename))
     (copy/copy! (mdb/db-type) (mdb/data-source) :h2 h2-data-source)
     (when dump-plaintext?
       (mdb/with-application-db (mdb/application-db :h2 h2-data-source)
         (rotate-encryption/rotate-encryption-key! nil)))
     ;; Flush h2 to disk
     (jdbc/execute! {:datasource h2-data-source} "CHECKPOINT SYNC"))))
