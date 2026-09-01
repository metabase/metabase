(ns metabase.app-db.encryption-test
  (:require
   [buddy.core.codecs :as codecs]
   [clojure.test :refer :all]
   [metabase.app-db.core :as mdb]
   [metabase.notification.core :as notification]
   [metabase.test :as mt]
   [metabase.util.encryption :as encryption]
   [metabase.util.encryption-test :as encryption-test]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- recipient-details []
  (t2/select-fn-vec :details :notification_recipient :details [:!= nil]))

(defn- raw-secret-value
  "Read `secret.value` straight from the DB, bypassing the model's decrypting transform. Reduces rather than
  realizing a row, since H2 hands back a `Blob` that is only readable while its connection is open."
  ^bytes [id]
  (reduce (fn [_ {:keys [value]}]
            (if (instance? java.sql.Blob value)
              (.getBytes ^java.sql.Blob value 1 (int (.length ^java.sql.Blob value)))
              value))
          nil
          (t2/reducible-query {:select [:value] :from [:secret] :where [:= :id id]})))

(deftest migrate-encrypted-columns!-test
  ;; Re-enacts how a boot of a pre-encryption build undoes the one-shot encryption backfills: its seeding reads the
  ;; encrypted `notification_recipient.details` through plain `transform-json`, gets a ciphertext string instead of a
  ;; map, decides the row changed, and re-creates it through its plaintext-era transforms. Isolated app DB: runs with
  ;; an encryption key active, so nothing here may touch the shared test DB.
  (mt/with-temp-empty-app-db [_conn :h2]
    (mdb/setup-db! :create-sample-content? false)
    (encryption-test/with-secret-key "ABCDEFGH12345678"
      (notification/seed-notification!)
      (let [source            :encryption/notification_recipient.details
            decryptable-here? #(encryption/decryptable-string? % source)
            seeded            (recipient-details)]
        (is (seq seeded) "seeding created recipients with details")
        (is (every? decryptable-here? seeded) "seeded through the current build: encrypted and bound to its column")
        (testing "an old build's seed re-writes the rows plaintext; the heal re-encrypts them"
          (t2/query {:update :notification_recipient
                     :set    {:details "{\"pattern\":\"plain\"}"}
                     :where  [:!= :details nil]})
          (is (not-any? decryptable-here? (recipient-details)) "now plaintext, as an old build leaves them")
          (mdb/migrate-encrypted-columns!)
          (let [healed (recipient-details)]
            (is (every? decryptable-here? healed))
            (is (= "{\"pattern\":\"plain\"}" (encryption/decrypt (first healed) source)))))
        (testing "a value encrypted before it was bound to its column is rewritten bound"
          (t2/query {:update :notification_recipient
                     :set    {:details (encryption/encrypt "{\"pattern\":\"unbound\"}" nil)}
                     :where  [:!= :details nil]})
          (is (not-any? decryptable-here? (recipient-details)) "unbound: the strict reader rejects it")
          (mdb/migrate-encrypted-columns!)
          (let [healed (recipient-details)]
            (is (every? decryptable-here? healed))
            (is (= "{\"pattern\":\"unbound\"}" (encryption/decrypt (first healed) source)))))
        (testing "the strict reader that crashed startup now works: seeding runs cleanly again"
          (notification/seed-notification!))
        (testing "idempotent: a second run leaves every value byte-identical"
          (let [snapshot (recipient-details)]
            (mdb/migrate-encrypted-columns!)
            (is (= snapshot (recipient-details))))))))
  (testing "a `^bytes` column is healed the same way as a string one"
    (mt/with-temp-empty-app-db [_conn :h2]
      (mdb/setup-db! :create-sample-content? false)
      (encryption-test/with-secret-key "ABCDEFGH12345678"
        (let [source            :encryption/secret.value
              decryptable-here? #(encryption/decryptable-bytes? (raw-secret-value %) source)
              plaintext         (codecs/to-bytes "sooper-sekret")
              id                (t2/insert-returning-pk! :secret {:name       "test-secret"
                                                                  :kind       "password"
                                                                  :source     nil
                                                                  :value      plaintext
                                                                  :creator_id (mt/user->id :crowberto)
                                                                  :created_at :%now
                                                                  :updated_at :%now})]
          (testing "written raw, the value is plaintext at rest"
            (is (not (decryptable-here? id))))
          (mdb/migrate-encrypted-columns!)
          (is (decryptable-here? id) "encrypted and bound to its column")
          (is (= "sooper-sekret" (codecs/bytes->str (encryption/decrypt-bytes (raw-secret-value id) source))))
          (testing "a value encrypted before it was bound to its column is rewritten bound"
            (t2/query {:update :secret
                       :set    {:value (encryption/encrypt-bytes (codecs/to-bytes "unbound-sekret") nil)}
                       :where  [:= :id id]})
            (is (not (decryptable-here? id)) "unbound: the strict reader rejects it")
            (mdb/migrate-encrypted-columns!)
            (is (decryptable-here? id))
            (is (= "unbound-sekret" (codecs/bytes->str (encryption/decrypt-bytes (raw-secret-value id) source)))))))))
  (testing "without an encryption key nothing happens"
    (mt/with-temp-empty-app-db [_conn :h2]
      (mdb/setup-db! :create-sample-content? false)
      (encryption-test/with-secret-key nil
        (notification/seed-notification!)
        (let [before (recipient-details)]
          (mdb/migrate-encrypted-columns!)
          (is (= before (recipient-details))))))))
