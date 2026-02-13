(ns metabase.encryption.rotation
  (:require
   [metabase.encryption.impl :as encryption.impl]
   [metabase.encryption.spec :as encryption.spec]
   [metabase.models.interface :as mi]
   [metabase.util.honey-sql-2 :as h2x]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- do-encryption
  "Encrypt or decrypt the db using the current `MB_ENCRYPTION_SECRET_KEY` to read data.

  Reads raw values from the DB (bypassing toucan2 transforms/hooks via `t2/table-name`) so that
  rotation works at the raw string/bytes level without needing to re-encode through `:in` fns.

  The passed make-encrypt-fn is used to generate the encryption/decryption function to use by passing versions of
  encryption/maybe-encrypt to it."
  [db-type data-source encrypting? make-encrypt-fn]
  (let [encrypt-str-fn   (make-encrypt-fn encryption.impl/maybe-encrypt)
        encrypt-bytes-fn (make-encrypt-fn encryption.impl/maybe-encrypt-bytes)]
    (t2/with-transaction [conn {:datasource data-source}]
      ;; Process one model at a time, one table scan per model. For each row,
      ;; collect all encrypted column changes and issue a single update.
      (doseq [[model columns] encryption.spec/encryption-spec
              :let [pk-keys (t2/primary-keys model)]
              ;; Use table-name to bypass transforms/hooks — we want raw DB values
              row (t2/select (t2/table-name model))]
        (let [changes (into {}
                            (keep (fn [[column {:keys [encrypt-if? type]}]]
                                    (let [raw       (get row column)
                                          ;; For bytes columns, JDBC may return a Blob — normalize to byte[]
                                          value      (if (= type :bytes) (mi/maybe-blob->bytes raw) raw)
                                          encrypt-fn (if (= type :bytes) encrypt-bytes-fn encrypt-str-fn)]
                                      (when (and (some? value)
                                                 (or (nil? encrypt-if?) (encrypt-if? row)))
                                        ;; Decrypt with current key. maybe-decrypt returns the original
                                        ;; value if it can't decrypt (wrong key) or isn't encrypted.
                                        (let [decrypted (encryption.impl/maybe-decrypt value)]
                                          (if (and (string? decrypted) (encryption.impl/possibly-encrypted-string? decrypted))
                                            (throw (ex-info "Can't decrypt app db with MB_ENCRYPTION_SECRET_KEY"
                                                            {:model model :column column}))
                                            [column (encrypt-fn decrypted)]))))))
                            columns)]
          (when (seq changes)
            (t2/update! :conn conn (t2/table-name model)
                        (->> pk-keys (map (fn [k] [k (get row k)])) (into {}))
                        changes))))
      ;; Post-rotation housekeeping
      (let [ts-expr (h2x/cast (if (= db-type :mysql) :char :text) [:raw "current_timestamp"])]
        (t2/update! :conn conn :setting {:key "settings-last-updated"} {:value ts-expr}))
      (t2/update! :conn conn :setting {:key "encryption-check"}
                  {:value (if encrypting? (encrypt-str-fn (str (random-uuid))) "unencrypted")})
      (t2/delete! :conn conn :model/QueryCache))))

(defn encrypt-db
  "Encrypt the db using the current `MB_ENCRYPTION_SECRET_KEY` to read existing data, and the passed `to-key` to re-encrypt.
  If passed to-key is nil, it encrypts with the current MB_ENCRYPTION_SECRET_KEY value."
  [db-type data-source to-key]
  (when (and (not (nil? to-key)) (empty? to-key))
    (throw (ex-info "Cannot encrypt database with an empty key" {})))
  (do-encryption db-type data-source true (fn [maybe-encrypt-fn]
                                            (if
                                             (nil? to-key) maybe-encrypt-fn
                                             (partial maybe-encrypt-fn (encryption.impl/validate-and-hash-secret-key to-key))))))

(defn decrypt-db
  "Decrypts the database using the current `MB_ENCRYPTION_SECRET_KEY` to read existing data"
  [db-type data-source]
  (do-encryption db-type data-source false (constantly identity)))
