(ns metabase.app-db.encryption-test
  (:require
   [clojure.test :refer :all]
   [metabase.app-db.connection :as mdb.connection]
   [metabase.app-db.core :as mdb]
   [metabase.app-db.encryption :as mdb.encryption]
   [metabase.notification.core :as notification]
   [metabase.test :as mt]
   [metabase.util.encryption :as encryption]
   [metabase.util.encryption-test :as encryption-test]
   [metabase.util.json :as json]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private secret-key "app-db-encryption-rewrite-test-key")

(defn- stored-values [id]
  (:values (t2/query-one {:select [:*] :from [:metabase_fieldvalues] :where [:= :id id]})))

(defn- values-json [i]
  (json/encode [(str "category-" i) (str "other-" i)]))

(defn- plaintext-field-values!
  "Insert `n` FieldValues rows whose `values` are stored as plaintext, returning their ids in order. Written raw so the
  model's transform can't encrypt them on the way in — these stand in for rows that predate the upgrade."
  [n]
  (let [db-id    (t2/insert-returning-pk! :metabase_database
                                          {:name "db" :engine "h2" :details "{}"
                                           :created_at :%now :updated_at :%now})
        table-id (t2/insert-returning-pk! :metabase_table
                                          {:name "t" :db_id db-id :active true
                                           :created_at :%now :updated_at :%now})]
    (mapv (fn [i]
            (let [field-id (t2/insert-returning-pk! :metabase_field
                                                    {:name          (str "sightings_" i)
                                                     :table_id      table-id
                                                     :base_type     "type/Text"
                                                     :database_type "VARCHAR"
                                                     :active        true
                                                     :created_at    :%now
                                                     :updated_at    :%now})]
              (t2/insert-returning-pk! :metabase_fieldvalues
                                       {:field_id   field-id
                                        :type       "full"
                                        :values     (values-json i)
                                        :created_at :%now
                                        :updated_at :%now})))
          (range n))))

(deftest rewrite-converts-every-row-test
  (testing "the sweep encrypts plaintext rows, and each row keeps its own value through the batched update"
    (mt/with-empty-h2-app-db!
      (encryption-test/with-secret-key secret-key
        (let [ids (plaintext-field-values! 5)]
          (is (mdb.encryption/sweep-complete?
               (:progress (mdb.encryption/rewrite-dwh-derived-columns!
                           mdb.encryption/encrypt-value nil nil 2)))
              "every column reports done")
          (doseq [[i id] (map-indexed vector ids)]
            (let [stored (stored-values id)]
              (is (not= (values-json i) stored))
              (is (= (values-json i) (encryption/maybe-decrypt stored)))))
          (testing "a second sweep does not double-encrypt"
            (let [before (mapv stored-values ids)]
              (mdb.encryption/rewrite-dwh-derived-columns!
               mdb.encryption/encrypt-value nil nil 2)
              (is (= before (mapv stored-values ids))))))))))

(deftest rewrite-resumes-from-progress-test
  (testing "hitting the deadline returns progress the next run picks up from"
    (mt/with-empty-h2-app-db!
      (encryption-test/with-secret-key secret-key
        (let [ids (plaintext-field-values! 6)]
          ;; a deadline already in the past stops after a single page
          (let [{:keys [progress]} (mdb.encryption/rewrite-dwh-derived-columns!
                                    mdb.encryption/encrypt-value nil (System/currentTimeMillis) 2)]
            (is (not (mdb.encryption/sweep-complete? progress))
                "stopped early, so there is somewhere to resume from")
            (loop [progress progress]
              (when-not (mdb.encryption/sweep-complete? progress)
                (recur (:progress (mdb.encryption/rewrite-dwh-derived-columns!
                                   mdb.encryption/encrypt-value progress
                                   (System/currentTimeMillis) 2))))))
          (testing "resuming eventually converts every row"
            (doseq [[i id] (map-indexed vector ids)]
              (is (= (values-json i)
                     (encryption/maybe-decrypt (stored-values id)))))))))))

(deftest rewrite-is-a-no-op-without-a-key-test
  (testing "with no key set there is nothing to encrypt, so rows are left exactly as they were"
    (mt/with-empty-h2-app-db!
      (encryption-test/with-secret-key nil
        (let [ids (plaintext-field-values! 3)]
          (mdb.encryption/rewrite-dwh-derived-columns!
           mdb.encryption/encrypt-value nil nil 2)
          (doseq [[i id] (map-indexed vector ids)]
            (is (= (values-json i) (stored-values id)))))))))

(deftest progress-survives-a-storage-round-trip-test
  (testing "progress read back out of the setting row is unchanged, so a resumed run continues rather than restarting"
    (mt/with-empty-h2-app-db!
      (encryption-test/with-secret-key secret-key
        (let [ids (plaintext-field-values! 4)
              ;; stop mid-sweep so there is real progress to persist
              {:keys [progress]} (mdb.encryption/rewrite-dwh-derived-columns!
                                  mdb.encryption/encrypt-value nil (System/currentTimeMillis) 1)
              round-tripped      (do (mdb.encryption/save-backfill-progress! progress)
                                     (mdb.encryption/read-backfill-progress))]
          (is (= progress round-tripped)
              "stored progress comes back identical")
          (is (not (mdb.encryption/sweep-complete? round-tripped)))
          (loop [progress round-tripped]
            (when-not (mdb.encryption/sweep-complete? progress)
              (recur (:progress (mdb.encryption/rewrite-dwh-derived-columns!
                                 mdb.encryption/encrypt-value progress
                                 (System/currentTimeMillis) 1)))))
          (testing "and resuming from it converts the remaining rows"
            (doseq [[i id] (map-indexed vector ids)]
              (is (= (values-json i)
                     (encryption/maybe-decrypt (stored-values id)))))))))))

(deftest progress-does-not-depend-on-list-order-test
  (testing "progress is recorded per column, so reordering dwh-derived-columns cannot strand one"
    (mt/with-empty-h2-app-db!
      (encryption-test/with-secret-key secret-key
        (let [ids (plaintext-field-values! 4)
              {:keys [progress]} (mdb.encryption/rewrite-dwh-derived-columns!
                                  mdb.encryption/encrypt-value nil (System/currentTimeMillis) 1)]
          (with-redefs [mdb.encryption/dwh-derived-columns (vec (reverse mdb.encryption/dwh-derived-columns))]
            (loop [progress progress]
              (when-not (mdb.encryption/sweep-complete? progress)
                (recur (:progress (mdb.encryption/rewrite-dwh-derived-columns!
                                   mdb.encryption/encrypt-value progress nil 2))))))
          (doseq [[i id] (map-indexed vector ids)]
            (is (= (values-json i)
                   (encryption/maybe-decrypt (stored-values id)))
                "every row is converted even though the list was reordered mid-sweep")))))))

;;; ------------------------------------------- sweep cursor -------------------------------------------

(defn- data-source [] (:data-source mdb.connection/*application-db*))

(deftest encrypt-db-inline-encrypts-dwh-derived-columns-test
  (testing "encrypt-db rewrites them inline, and leaves the cursor alone because they are not in the clear"
    (mt/with-empty-h2-app-db!
      (encryption-test/with-secret-key secret-key
        (let [ids    (plaintext-field-values! 3)
              cursor {"metabase_fieldvalues/values" 1}]
          (mdb.encryption/save-backfill-progress! cursor)
          (mdb.encryption/encrypt-db :h2 (data-source) nil)
          (doseq [[i id] (map-indexed vector ids)]
            (is (= (values-json i) (encryption/maybe-decrypt (stored-values id)))))
          (is (= cursor (mdb.encryption/read-backfill-progress))))))))

(deftest rotation-leaves-the-cursor-readable-under-the-new-key-test
  (testing "the cursor is re-encrypted with the key we rotate to, like every other setting row"
    (mt/with-empty-h2-app-db!
      (let [cursor {"metabase_fieldvalues/values" 1}]
        (encryption-test/with-secret-key secret-key
          (plaintext-field-values! 2)
          (mdb.encryption/encrypt-db :h2 (data-source) nil)
          (mdb.encryption/save-backfill-progress! cursor)
          (mdb.encryption/encrypt-db :h2 (data-source) "rotated-to-this-other-key"))
        (encryption-test/with-secret-key "rotated-to-this-other-key"
          (is (= cursor (mdb.encryption/read-backfill-progress))))))))

(deftest decrypt-db-clears-the-sweep-cursor-test
  (testing "removing the key resets progress, so setting one again re-encrypts instead of skipping"
    (mt/with-empty-h2-app-db!
      (let [ids (encryption-test/with-secret-key secret-key
                  (let [ids (plaintext-field-values! 3)]
                    (mdb.encryption/encrypt-db :h2 (data-source) nil)
                    (mdb.encryption/save-backfill-progress! {"metabase_fieldvalues/values" "done"})
                    (mdb.encryption/decrypt-db :h2 (data-source))
                    ids))]
        (doseq [[i id] (map-indexed vector ids)]
          (is (= (values-json i) (stored-values id))
              "back to plaintext"))
        (is (nil? (mdb.encryption/read-backfill-progress)))))))

(defn- recipient-details []
  (t2/select-fn-vec :details :notification_recipient :details [:!= nil]))

(deftest encrypt-plaintext-columns!-leaves-dwh-derived-columns-test
  (testing "the boot heal skips the columns the backfill task owns: scanning metabase_fieldvalues would stall startup"
    (mt/with-empty-h2-app-db!
      (encryption-test/with-secret-key secret-key
        (let [ids (plaintext-field-values! 3)]
          (mdb/encrypt-plaintext-columns!)
          (doseq [[i id] (map-indexed vector ids)]
            (is (= (values-json i) (stored-values id))
                "still plaintext, left for the backfill")))))))

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
