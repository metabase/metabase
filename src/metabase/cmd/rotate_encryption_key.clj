(ns metabase.cmd.rotate-encryption-key
  (:require [cheshire.core :as json]
            [clojure.java.jdbc :as jdbc]
            [metabase.db :as mdb]
            [metabase.db.connection :as mdb.conn]
            [metabase.models :refer [Database Setting]]
            [metabase.util.encryption :as encrypt]
            [toucan.db :as db]))

(defn rotate-keys!
  "Rotate the current configured db using the current MB_ENCRYPTION_SECRET_KEY env var and `to-key` argument."
  [to-key]
  (mdb/setup-db!)
  (try
    (let [encrypt-fn (if to-key
                       (partial encrypt/maybe-encrypt
                                (encrypt/validate-and-hash-secret-key to-key))
                       identity)]
      (jdbc/with-db-transaction [t-conn (mdb.conn/jdbc-spec)]
        (doseq [[key value] (db/select-field->field :key :value Setting)]
          (when (encrypt/possibly-encrypted-string? value)
            (println key value)
            (throw  (Exception. "MB_ENCRYPTION_SECRET_KEY does not correcty decrypt files")))
          (jdbc/update! t-conn
                        :setting
                        {:value (encrypt-fn value)}
                        ["setting.key = ?" key]))
        (doseq [[id details] (db/select-id->field :details Database)]
          (jdbc/update! t-conn
                        :metabase_database
                        {:details (encrypt-fn (json/encode details))}
                        ["metabase_database.id = ?" id])
          (when (encrypt/possibly-encrypted-string? details)
            (throw  (Exception. "MB_ENCRYPTION_SECRET_KEY does not correcty decrypt files")))))
      true)
    ;; (catch  e (do (println e "MB_ENCRYPTION_SECRET_KEY does not correcty decrypt the existing data")))
    (catch Throwable e (do (println e "MB_ENCRYPTION_SECRET_KEY does not correcty decrypt the existing data")))))
