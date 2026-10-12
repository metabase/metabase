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
          (mt/with-log-messages-for-level [messages :warn]
            (mdb/encrypt-plaintext-columns!)
            (is (=? [{:level :warn, :message #"Encrypting legacy values in notification_recipient\.details that a previous version of Metabase stored unencrypted\."}]
                    (filter #(re-find #"notification_recipient" (:message %)) (messages)))
                "the heal warns about the column it had to encrypt"))
          (let [healed (recipient-details)]
            (is (every? encryption/decryptable-string? healed))
            (is (= "{\"pattern\":\"plain\"}" (encryption/decrypt (first healed))))))
        (testing "the strict reader that crashed startup now works: seeding runs cleanly again"
          (notification/seed-notification!))
        (testing "idempotent: a second run leaves every value byte-identical"
          (let [snapshot (recipient-details)]
            (mdb/encrypt-plaintext-columns!)
            (is (= snapshot (recipient-details)))))
        (testing "with MB_DISABLE_LEGACY_STARTUP_ENCRYPTION the heal refuses instead, leaving the rows as they are"
          (t2/query {:update :notification_recipient
                     :set    {:details "{\"pattern\":\"plain\"}"}
                     :where  [:!= :details nil]})
          (mt/with-temp-env-var-value! [mb-disable-legacy-startup-encryption "true"]
            (is (mdb.encryption/legacy-startup-encryption-disabled?))
            (is (thrown-with-msg? clojure.lang.ExceptionInfo
                                  #"Found legacy values in notification_recipient\.details .* MB_DISABLE_LEGACY_STARTUP_ENCRYPTION is set"
                                  (mdb/encrypt-plaintext-columns!)))
            (is (not-any? encryption/decryptable-string? (recipient-details)) "nothing was encrypted"))
          (testing "unset again, the heal runs"
            (is (not (mdb.encryption/legacy-startup-encryption-disabled?)))
            (mdb/encrypt-plaintext-columns!)
            (is (every? encryption/decryptable-string? (recipient-details))))))))
  (testing "without an encryption key nothing happens"
    (mt/with-temp-empty-app-db [_conn :h2]
      (mdb/setup-db! :create-sample-content? false)
      (encryption-test/with-secret-key nil
        (notification/seed-notification!)
        (let [before (recipient-details)]
          (mdb/encrypt-plaintext-columns!)
          (is (= before (recipient-details))))))))
