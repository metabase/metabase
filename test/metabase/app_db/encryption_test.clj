(ns metabase.app-db.encryption-test
  (:require
   [clojure.test :refer :all]
   [metabase.app-db.core :as mdb]
   [metabase.app-db.setting :as mdb.setting]
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
            (is (= snapshot (recipient-details))))))))
  (testing "without an encryption key nothing happens"
    (mt/with-temp-empty-app-db [_conn :h2]
      (mdb/setup-db! :create-sample-content? false)
      (encryption-test/with-secret-key nil
        (notification/seed-notification!)
        (let [before (recipient-details)]
          (mdb/encrypt-plaintext-columns!)
          (is (= before (recipient-details))))))))

(deftest encrypt-plaintext-columns!-value-sysadmin-test
  (mt/with-temp-empty-app-db [_conn :h2]
    (mdb/setup-db! :create-sample-content? false)
    (encryption-test/with-secret-key "ABCDEFGH12345678"
      (let [aad       (mdb.setting/sysadmin-setting-aad "store-api-url")
            raw-value #(t2/select-one-fn :value_sysadmin :setting :key "store-api-url")]
        (t2/insert! :model/Setting {:key "store-api-url" :value "https://legacy" :value_sysadmin "https://sysadmin"})
        (testing "a plaintext value_sysadmin (e.g. written before the key was set) is encrypted under its AAD"
          (t2/query {:update :setting :set {:value_sysadmin "https://plain"} :where [:= :key "store-api-url"]})
          (mdb/encrypt-plaintext-columns!)
          (is (encryption/decryptable-string? (raw-value) {:aad aad}))
          (is (= "https://plain" (encryption/decrypt (raw-value) {:aad aad}))))
        (testing "idempotent: a value already encrypted under its AAD is left byte-identical"
          (let [before (raw-value)]
            (mdb/encrypt-plaintext-columns!)
            (is (= before (raw-value)))))
        (testing "a ciphertext that does not decrypt under the AAD -- e.g. copied from value -- is cleared, never trusted"
          (t2/query {:update :setting
                     :set    {:value_sysadmin (t2/select-one-fn :value :setting :key "store-api-url")}
                     :where  [:= :key "store-api-url"]})
          (mt/with-log-messages-for-level [messages :error]
            (mdb/encrypt-plaintext-columns!)
            (is (=? [{:message #".*store-api-url does not decrypt.*"}] (messages))))
          (is (nil? (raw-value))))))))
