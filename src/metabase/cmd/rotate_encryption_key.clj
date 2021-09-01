(ns metabase.cmd.rotate-encryption-key
  (:require [cheshire.core :as json]
            [clojure.java.jdbc :as jdbc]
            [metabase.db :as mdb]
            [metabase.db.connection :as mdb.conn]
            [metabase.models :refer [Database Setting]]
            [metabase.models.setting.cache :as cache]
            [metabase.util.encryption :as encrypt]
            [metabase.util.i18n :refer [trs]]
            [toucan.db :as db]))

(defn rotate-encryption-key!
  "Rotate the current configured db using the current MB_ENCRYPTION_SECRET_KEY env var and `to-key` argument."
  [to-key]
  (mdb/setup-db!)
  (let [encrypt-fn (if to-key
                     (partial encrypt/maybe-encrypt
                              (encrypt/validate-and-hash-secret-key to-key))
                     identity)]
    (jdbc/with-db-transaction [t-conn (mdb.conn/jdbc-spec)]
      (doseq [[id details] (db/select-id->field :details Database)]
        (when (encrypt/possibly-encrypted-string? details)
          (throw (ex-info (trs "Can't decrypt app db with MB_ENCRYPTION_SECRET_KEY") {:database-id id})))
        (jdbc/update! t-conn
                      :metabase_database
                      {:details (encrypt-fn (json/encode details))}
                      ["metabase_database.id = ?" id]))
      (doseq [[key value] (db/select-field->field :key :value Setting)]
        (if (= key "settings-last-updated")
          (cache/update-settings-last-updated!)
          (jdbc/update! t-conn
                        :setting
                        {:value (encrypt-fn value)}
                        ["setting.key = ?" key]))))))
