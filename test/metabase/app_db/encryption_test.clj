(ns metabase.app-db.encryption-test
  (:require
   [clojure.test :refer :all]
   [metabase.app-db.core :as mdb]
   [metabase.app-db.encryption :as mdb.encryption]
   [metabase.notification.core :as notification]
   [metabase.test :as mt]
   [metabase.util.encryption :as encryption]
   [metabase.util.encryption-test :as encryption-test]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- recipient-details []
  (t2/select-fn-vec :details :notification_recipient :details [:!= nil]))

(deftest encrypt-plaintext-columns!-test
  ;; Re-enacts how a boot of a pre-encryption build undoes the one-shot encryption backfills: its seeding reads the
  ;; encrypted `notification_recipient.details` through plain `transform-json`, gets a ciphertext string instead of a
  ;; map, decides the row changed, and re-creates it through its plaintext-era transforms. Isolated app DB: runs with
  ;; an encryption key active, so nothing here may touch the shared test DB.
  (mt/with-temp-empty-app-db [_conn :h2]
    (mdb/setup-db! :create-sample-content? false)
    (encryption-test/with-secret-key "ABCDEFGH12345678"
      (notification/seed-notification!)
      (let [seeded (recipient-details)]
        (is (seq seeded) "seeding created recipients with details")
        (is (every? encryption/decryptable-string? seeded) "seeded through the current build: encrypted at rest")
        (testing "an old build's seed re-writes the rows plaintext; the heal re-encrypts them"
          (t2/query {:update :notification_recipient
                     :set    {:details "{\"pattern\":\"plain\"}"}
                     :where  [:!= :details nil]})
          (is (not-any? encryption/decryptable-string? (recipient-details)) "now plaintext, as an old build leaves them")
          (mdb/encrypt-plaintext-columns!)
          (let [healed (recipient-details)]
            (is (every? encryption/decryptable-string? healed))
            (is (= "{\"pattern\":\"plain\"}" (encryption/decrypt (first healed))))))
        (testing "the strict reader that crashed startup now works: seeding runs cleanly again"
          (notification/seed-notification!))
        (testing "idempotent: a second run leaves every value byte-identical"
          (let [snapshot (recipient-details)]
            (mdb/encrypt-plaintext-columns!)
            (is (= snapshot (recipient-details))))))))
  (testing "without an encryption key nothing happens"
    (mt/with-temp-empty-app-db [_conn :h2]
      (mdb/setup-db! :create-sample-content? false)
      (encryption-test/with-secret-key nil
        (notification/seed-notification!)
        (let [before (recipient-details)]
          (mdb/encrypt-plaintext-columns!)
          (is (= before (recipient-details))))))))

(deftest encrypt-value-test
  ;; pure: rebind the key directly rather than `with-secret-key`, which needs an app db for the setting cache
  (with-redefs [encryption/default-secret-key (encryption/secret-key->hash "encrypt-value-test-key")]
    (testing "plaintext is encrypted"
      (let [encrypted (mdb.encryption/encrypt-value "{\"a\":1}")]
        (is (= "{\"a\":1}" (encryption/decrypt encrypted)))
        (testing "and a re-run leaves it byte-identical"
          (is (= encrypted (mdb.encryption/encrypt-value encrypted))))))
    (testing "an empty string is left alone: maybe-encrypt returns nil for it, which would null the column"
      (is (= "" (mdb.encryption/encrypt-value ""))))
    (testing "plaintext merely shaped like ciphertext is still encrypted"
      ;; `last_checkpoint_value` is a raw warehouse watermark, so it can look like ciphertext without being any.
      ;; deciding on shape alone would skip it and leave it in the clear for good.
      ;; base64 that decodes to 64 bytes, the size of the shortest real ciphertext
      (let [watermark (str (apply str (repeat 86 "a")) "==")]
        (is (true? (encryption/possibly-encrypted-string? watermark)) "precondition: this shape fools the shape check")
        (is (= watermark (encryption/decrypt (mdb.encryption/encrypt-value watermark))))))))
