(ns metabase.app-db.encryption-test
  (:require
   [clojure.test :refer :all]
   [metabase.app-db.encryption :as mdb.encryption]
   [metabase.app-db.task.encryption-backfill :as task.encryption-backfill]
   [metabase.test :as mt]
   [metabase.util.encryption :as encryption]
   [metabase.util.encryption-test :as encryption-test]
   [metabase.util.json :as json]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private secret-key "app-db-encryption-rewrite-test-key")

(defn- stored-fingerprint [id]
  (:fingerprint (t2/query-one {:select [:fingerprint] :from [:metabase_field] :where [:= :id id]})))

(defn- fingerprint-json [i]
  (json/encode {:global {:distinct-count i}}))

(defn- plaintext-fields!
  "Insert `n` fields whose fingerprints are stored as plaintext, returning their ids in order. Written raw so the
  model's transform can't encrypt them on the way in — these stand in for rows that predate the upgrade."
  [n]
  (let [db-id    (t2/insert-returning-pk! :metabase_database
                                          {:name "db" :engine "h2" :details "{}"
                                           :created_at :%now :updated_at :%now})
        table-id (t2/insert-returning-pk! :metabase_table
                                          {:name "t" :db_id db-id :active true
                                           :created_at :%now :updated_at :%now})]
    (mapv (fn [i]
            (t2/insert-returning-pk! :metabase_field
                                     {:name          (str "sightings_" i)
                                      :table_id      table-id
                                      :base_type     "type/Integer"
                                      :database_type "INTEGER"
                                      :active        true
                                      :fingerprint   (fingerprint-json i)
                                      :created_at    :%now
                                      :updated_at    :%now}))
          (range n))))

(deftest rewrite-converts-every-row-test
  (testing "the sweep encrypts plaintext rows, and each row keeps its own value through the batched update"
    (mt/with-empty-h2-app-db!
      (encryption-test/with-secret-key secret-key
        (let [ids (plaintext-fields! 5)]
          (is (mdb.encryption/sweep-complete?
               (:progress (mdb.encryption/rewrite-dwh-derived-columns!
                           mdb.encryption/encrypt-value nil nil 2)))
              "every column reports done")
          (doseq [[i id] (map-indexed vector ids)]
            (let [stored (stored-fingerprint id)]
              (is (not= (fingerprint-json i) stored))
              (is (= (fingerprint-json i) (encryption/maybe-decrypt stored)))))
          (testing "a second sweep does not double-encrypt"
            (let [before (mapv stored-fingerprint ids)]
              (mdb.encryption/rewrite-dwh-derived-columns!
               mdb.encryption/encrypt-value nil nil 2)
              (is (= before (mapv stored-fingerprint ids))))))))))

(deftest rewrite-resumes-from-progress-test
  (testing "hitting the deadline returns progress the next run picks up from"
    (mt/with-empty-h2-app-db!
      (encryption-test/with-secret-key secret-key
        (let [ids (plaintext-fields! 6)]
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
              (is (= (fingerprint-json i)
                     (encryption/maybe-decrypt (stored-fingerprint id)))))))))))

(deftest rewrite-is-a-no-op-without-a-key-test
  (testing "with no key set there is nothing to encrypt, so rows are left exactly as they were"
    (mt/with-empty-h2-app-db!
      (encryption-test/with-secret-key nil
        (let [ids (plaintext-fields! 3)]
          (mdb.encryption/rewrite-dwh-derived-columns!
           mdb.encryption/encrypt-value nil nil 2)
          (doseq [[i id] (map-indexed vector ids)]
            (is (= (fingerprint-json i) (stored-fingerprint id)))))))))

(deftest progress-survives-a-storage-round-trip-test
  (testing "progress read back out of the setting row is unchanged, so a resumed run continues rather than restarting"
    (mt/with-empty-h2-app-db!
      (encryption-test/with-secret-key secret-key
        (let [ids (plaintext-fields! 4)
              ;; stop mid-sweep so there is real progress to persist
              {:keys [progress]} (mdb.encryption/rewrite-dwh-derived-columns!
                                  mdb.encryption/encrypt-value nil (System/currentTimeMillis) 1)
              round-tripped      (do (#'task.encryption-backfill/save-progress! progress)
                                     (#'task.encryption-backfill/read-progress))]
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
              (is (= (fingerprint-json i)
                     (encryption/maybe-decrypt (stored-fingerprint id)))))))))))

(deftest progress-does-not-depend-on-list-order-test
  (testing "progress is recorded per column, so reordering dwh-derived-columns cannot strand one"
    (mt/with-empty-h2-app-db!
      (encryption-test/with-secret-key secret-key
        (let [ids (plaintext-fields! 4)
              {:keys [progress]} (mdb.encryption/rewrite-dwh-derived-columns!
                                  mdb.encryption/encrypt-value nil (System/currentTimeMillis) 1)]
          (with-redefs [mdb.encryption/dwh-derived-columns (vec (reverse mdb.encryption/dwh-derived-columns))]
            (loop [progress progress]
              (when-not (mdb.encryption/sweep-complete? progress)
                (recur (:progress (mdb.encryption/rewrite-dwh-derived-columns!
                                   mdb.encryption/encrypt-value progress nil 2))))))
          (doseq [[i id] (map-indexed vector ids)]
            (is (= (fingerprint-json i)
                   (encryption/maybe-decrypt (stored-fingerprint id)))
                "every row is converted even though the list was reordered mid-sweep")))))))
