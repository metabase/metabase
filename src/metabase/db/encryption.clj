(ns metabase.db.encryption
  (:require
   [clojure.core :as core]
   [metabase.models.interface :as mi]
   [metabase.util.encryption :as encryption]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.log :as log]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- do-encryption
  "Encrypt or decrypts the db using the current `MB_ENCRYPTION_SECRET_KEY` to read data.

  The passed make-encrypt-fn is used to generate the encryption/decryption function to use by passing versions of encryption/maybe-encrypt to it."
  [db-type data-source encrypting? make-encrypt-fn]
  (let [encrypt-str-fn (make-encrypt-fn encryption/maybe-encrypt)
        encrypt-bytes-fn (make-encrypt-fn encryption/maybe-encrypt-bytes)]
    (t2/with-transaction [conn {:datasource data-source}]
      (t2/delete! :conn conn :model/QueryCache)
      (t2/delete! :conn conn :model/FieldValues :human_readable_values [:= nil])

      (doseq [model (filter #(= (namespace %) "model") (core/descendants :metabase/model))]
        (cond
          (= model :model/Setting)
          (doseq [[key value] (t2/select-fn->fn :key :value :model/Setting)]
            (case key
              "settings-last-updated" (let [current-timestamp-as-string-honeysql (h2x/cast (if (= db-type :mysql) :char :text)
                                                                                           [:raw "current_timestamp"])]
                                        (t2/update! :conn conn :setting {:key key} {:value current-timestamp-as-string-honeysql}))
              "encryption-check" (t2/update! :conn conn :model/Setting {:key key} {:value (if encrypting? (encryption/maybe-encrypt (str (random-uuid))) "unencrypted")})
              (t2/update! :conn conn (t2/table-name :model/Setting)
                          {:key key}
                          {:value (encrypt-str-fn value)})))

          :else
          (when-let [transforms-fn (methodical/effective-method t2/transforms model)]
            (doseq [[field] (keep
                             (fn [[field transform]]
                               (when (or (= transform mi/transform-encrypted-json)
                                         (= transform mi/transform-encrypted-json-no-keywordization)
                                         (= transform mi/transform-secret-value))
                                 [field]))

                             (transforms-fn model))]
              (log/info (str "Encrypting/decrypting " model " " field))
              (doseq [{:keys [id value]} (t2/query conn {:select [:id [field :value]]
                                                         :from   [(t2/table-name model)]
                                                         :where  [:not= field nil]})]
                (let [decrypted-value (encryption/maybe-decrypt value)]
                  (cond
                    (string? decrypted-value)
                    (if (encryption/possibly-encrypted-string? decrypted-value)
                      (throw (ex-info (str "Can't decrypt " (-> model t2/table-name name) "." (name field) " with MB_ENCRYPTION_SECRET_KEY") {:model model :id id}))
                      (t2/update! :conn conn (t2/table-name model)
                                  {:id id}
                                  {field (encrypt-str-fn decrypted-value)}))

                    (instance? java.sql.Blob decrypted-value)
                    (let [decrypted-bytes (encryption/maybe-decrypt (.getBytes decrypted-value 1 (.length decrypted-value)))]
                      (if (encryption/possibly-encrypted-bytes? decrypted-bytes)
                        (throw (ex-info (str "Can't decrypt " (-> model t2/table-name name) "." (name field) " with MB_ENCRYPTION_SECRET_KEY") {:model model :id id}))
                        (t2/update! :conn conn (t2/table-name model)
                          {:id id}
                          {field (encrypt-bytes-fn decrypted-bytes)})))

                    :else
                    (throw (ex-info (str "Unknown value type" decrypted-value) {:model model :field field}))))))))))))

(defn encrypt-db
  "Encrypt the db using the current `MB_ENCRYPTION_SECRET_KEY` to read existing data, and the passed `to-key` to re-encrypt.
  If passed to-key is nil, it encrypts with the current MB_ENCRYPTION_SECRET_KEY value."
  [db-type data-source to-key]
  (when (and (not (nil? to-key)) (empty? to-key))
    (throw (ex-info "Cannot encrypt database with an empty key" {})))
  (do-encryption db-type data-source true (fn [maybe-encrypt-fn]
                                            (if
                                             (nil? to-key) maybe-encrypt-fn
                                             (partial maybe-encrypt-fn (encryption/validate-and-hash-secret-key to-key))))))

(defn decrypt-db
  "Decrypts the database using the current `MB_ENCRYPTION_SECRET_KEY` to read existing data"
  [db-type data-source]
  (do-encryption db-type data-source false (constantly identity)))
