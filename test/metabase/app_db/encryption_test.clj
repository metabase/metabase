(ns metabase.app-db.encryption-test
  (:require
   [clojure.test :refer :all]
   [metabase.app-db.encryption :as mdb.encryption]
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
          (is (nil? (:cursor (mdb.encryption/rewrite-dwh-derived-columns!
                              mdb.encryption/encrypt-value nil nil 2)))
              "a nil cursor means every column is done")
          (doseq [[i id] (map-indexed vector ids)]
            (let [stored (stored-fingerprint id)]
              (is (not= (fingerprint-json i) stored))
              (is (= (fingerprint-json i) (encryption/maybe-decrypt stored)))))
          (testing "a second sweep does not double-encrypt"
            (let [before (mapv stored-fingerprint ids)]
              (mdb.encryption/rewrite-dwh-derived-columns!
               mdb.encryption/encrypt-value nil nil 2)
              (is (= before (mapv stored-fingerprint ids))))))))))

(deftest rewrite-resumes-from-cursor-test
  (testing "hitting the deadline returns a cursor the next run picks up from"
    (mt/with-empty-h2-app-db!
      (encryption-test/with-secret-key secret-key
        (let [ids (plaintext-fields! 6)]
          ;; a deadline already in the past stops after a single page
          (let [{:keys [cursor]} (mdb.encryption/rewrite-dwh-derived-columns!
                                  mdb.encryption/encrypt-value nil (System/currentTimeMillis) 2)]
            (is (some? cursor) "stopped early, so there is somewhere to resume from")
            (loop [cursor cursor]
              (when-let [next-cursor (:cursor (mdb.encryption/rewrite-dwh-derived-columns!
                                               mdb.encryption/encrypt-value cursor
                                               (System/currentTimeMillis) 2))]
                (recur next-cursor))))
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
