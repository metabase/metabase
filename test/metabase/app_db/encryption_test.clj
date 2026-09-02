(ns metabase.app-db.encryption-test
  (:require
   [clojure.test :refer :all]
   [metabase.app-db.core :as mdb]
   [metabase.test :as mt]
   [metabase.util.encryption :as encryption]
   [metabase.util.encryption-test :as encryption-test]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- database-row!
  "Insert a `metabase_database` row with `settings` stored verbatim, returning its id."
  [settings]
  (t2/insert-returning-pk! :metabase_database {:name       (mt/random-name)
                                               :engine     "h2"
                                               :details    "{}"
                                               :settings   settings
                                               :created_at :%now
                                               :updated_at :%now}))

(defn- raw-settings [id]
  (t2/select-one-fn :settings :metabase_database :id id))

(deftest encrypt-plaintext-columns!-test
  ;; Re-enacts how plaintext reappears in an encrypted-at-rest column after the one-shot encryption migrations have
  ;; run: a boot of an older version writes the column through its plaintext-era transforms, and `load-from-h2`
  ;; copies a decrypted dump's values verbatim. Isolated app DB: runs with an encryption key active, so nothing here
  ;; may touch the shared test DB.
  (mt/with-temp-empty-app-db [_conn :h2]
    (mdb/setup-db! :create-sample-content? false)
    (encryption-test/with-secret-key "ABCDEFGH12345678"
      (let [plain-id   (database-row! "{\"a\":1}")
            enc-id     (database-row! (encryption/encrypt "{\"b\":2}"))
            enc-before (raw-settings enc-id)]
        (is (not (encryption/decryptable-string? (raw-settings plain-id)))
            "plaintext at rest, as an old build leaves it")
        (mdb/encrypt-plaintext-columns!)
        (testing "a plaintext value is encrypted at rest and decrypts back"
          (is (encryption/decryptable-string? (raw-settings plain-id)))
          (is (= "{\"a\":1}" (encryption/decrypt (raw-settings plain-id)))))
        (testing "the plaintext details column of the same row is healed too"
          (is (= "{}" (encryption/decrypt (t2/select-one-fn :details :metabase_database :id plain-id)))))
        (testing "an already-encrypted value is left byte-identical"
          (is (= enc-before (raw-settings enc-id))))
        (testing "idempotent: a second run changes nothing"
          (let [snapshot (t2/select-fn->fn :id :settings :metabase_database)]
            (mdb/encrypt-plaintext-columns!)
            (is (= snapshot (t2/select-fn->fn :id :settings :metabase_database))))))))
  (testing "without an encryption key nothing happens"
    (mt/with-temp-empty-app-db [_conn :h2]
      (mdb/setup-db! :create-sample-content? false)
      (encryption-test/with-secret-key nil
        (let [id (database-row! "{\"c\":3}")]
          (mdb/encrypt-plaintext-columns!)
          (is (= "{\"c\":3}" (raw-settings id))))))))
