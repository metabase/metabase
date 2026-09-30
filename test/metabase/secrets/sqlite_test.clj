(ns metabase.secrets.sqlite-test
  (:require
   [clojure.test :refer :all]
   [metabase.api.common :as api]
   [metabase.app-db.connection :as connection]
   [metabase.app-db.core :as mdb]
   [metabase.app-db.data-source :as data-source]
   [metabase.app-db.liquibase :as liquibase]
   [metabase.secrets.db :as secrets.db]
   [metabase.secrets.models.secret :as secret]
   [toucan2.core :as t2])
  (:import
   (java.nio.file Files)
   (java.nio.file.attribute FileAttribute)))

(set! *warn-on-reflection* true)

(use-fixtures :each
  (fn [f]
    (let [path (Files/createTempFile "metabase-sqlite-secrets-" ".db" (make-array FileAttribute 0))
          source (data-source/broken-out-details->DataSource :sqlite {:db (str path)})]
      (try
        (with-open [conn (.getConnection source)]
          (liquibase/with-liquibase [lb conn]
            (.update lb "")))
        (mdb/with-application-db (connection/application-db :sqlite source)
          (binding [api/*current-user-id* nil]
            (f)))
        (finally
          (doseq [suffix ["" "-wal" "-shm"]]
            (Files/deleteIfExists (.resolveSibling path (str (.getFileName path) suffix)))))))))

(defn- create-secret! [existing-id value]
  (secret/upsert-secret-value! existing-id "SQLite test" :password :test value))

(deftest version-and-id-allocation-test
  (let [first-version (create-secret! nil "first")
        next-version (create-secret! (:id first-version) "second")
        new-secret (create-secret! nil "third")]
    (is (pos-int? (:id first-version)))
    (is (= (:id first-version) (:id next-version)))
    (is (= [1 2] [(:version first-version) (:version next-version)]))
    (is (not= (:id first-version) (:id new-secret)))
    (is (= 1 (:version new-secret)))
    (is (= (seq (.getBytes "first" "UTF-8"))
           (seq (:value (secrets.db/secret-version (:id first-version) 1)))))
    (is (= (seq (.getBytes "second" "UTF-8"))
           (seq (:value (secret/latest-for-id (:id first-version))))))
    (is (= (seq (.getBytes "third" "UTF-8"))
           (seq (:value new-secret))))))

(deftest rollback-allocation-test
  (let [original (create-secret! nil "original")
        next-id-before (:next_id (t2/query-one ["SELECT next_id FROM secret_id_sequence WHERE id = 1"]))]
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo #"rollback"
         (t2/with-transaction [_]
           (create-secret! (:id original) "rolled-back version")
           (create-secret! nil "rolled-back secret")
           (throw (ex-info "rollback" {})))))
    (is (= 1 (:version (secret/latest-for-id (:id original)))))
    (is (= next-id-before (:next_id (t2/query-one ["SELECT next_id FROM secret_id_sequence WHERE id = 1"]))))
    (let [new-secret (create-secret! nil "committed")]
      (is (= next-id-before (:id new-secret)))
      (is (= 1 (:version new-secret)))
      (is (= 2 (t2/count :secret))))))

(deftest imported-id-and-failed-insert-test
  (let [row {:name "Imported secret" :kind :password :source :test :value "test-only"}]
    (is (= 100 (:id (secrets.db/insert-secret! (assoc row :id 100 :version 1)))))
    (is (= 100 (:id (secrets.db/insert-secret! (assoc row :id 100 :version 2)))))
    (is (= 101 (:id (secrets.db/insert-secret! row))))
    (let [next-id-before (:next_id (t2/query-one ["SELECT next_id FROM secret_id_sequence WHERE id = 1"]))]
      (is (thrown? Exception (secrets.db/insert-secret! (dissoc row :name))))
      (is (= next-id-before (:next_id (t2/query-one ["SELECT next_id FROM secret_id_sequence WHERE id = 1"]))))
      (is (= next-id-before (:id (secrets.db/insert-secret! row)))))))
