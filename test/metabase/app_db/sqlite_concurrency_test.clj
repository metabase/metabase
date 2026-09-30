(ns metabase.app-db.sqlite-concurrency-test
  (:require
   [clojure.java.io :as io]
   [clojure.test :refer :all]
   [metabase.app-db.connection :as connection]
   [metabase.app-db.data-source :as data-source]
   [metabase.app-db.setup]
   [toucan2.connection :as t2.conn]
   [toucan2.core :as t2])
  (:import
   (com.mchange.v2.c3p0 DataSources)
   (java.nio.file Files)
   (java.sql Connection)))

(set! *warn-on-reflection* true)

(defn- with-sqlite-file! [pooled? f]
  (let [path (Files/createTempFile "sqlite-concurrency" ".db" (make-array java.nio.file.attribute.FileAttribute 0))
        source (data-source/broken-out-details->DataSource :sqlite {:db (str path)})
        app-db (connection/application-db :sqlite source :create-pool? pooled?)]
    (try
      (binding [connection/*application-db* app-db]
        (with-open [a (.getConnection (connection/data-source))
                    b (.getConnection (connection/data-source))]
          (binding [t2.conn/*current-connectable* a]
            (f a b))))
      (finally
        (when pooled?
          (DataSources/destroy (:data-source app-db))
          (DataSources/destroy (:quartz-data-source app-db)))
        (doseq [suffix ["" "-wal" "-shm"]]
          (Files/deleteIfExists (.toPath (io/file (str path suffix)))))))))

(deftest sqlite-reducer-can-write-after-another-connection-commits-test
  (doseq [pooled? [false true]]
    (testing (str "pooled? " pooled?)
      (with-sqlite-file! pooled?
        (fn [^Connection reader ^Connection writer]
          (t2/query ["CREATE TABLE probe (id INTEGER PRIMARY KEY, value INTEGER)"])
          (doseq [query-kind [:model :raw]]
            (testing (str "query kind " query-kind)
              (t2/delete! :probe)
              (t2/insert! :probe [{:id 1 :value 0} {:id 2 :value 0}])
              (let [rows (case query-kind
                           :model (t2/reducible-select :probe {:order-by [:id]})
                           :raw (t2/reducible-query ["SELECT id, value FROM probe ORDER BY id"]))]
                (is (= [0 0]
                       (reduce (fn [values row]
                                 (when (= 1 (:id row))
                                   ;; Sync has exactly this shape: read table metadata, then write fields
                                   ;; while unrelated requests or Quartz advance the SQLite WAL.
                                   (with-open [stmt (.createStatement writer)]
                                     (.executeUpdate stmt "UPDATE probe SET value = 10 WHERE id = 2"))
                                   (t2/with-transaction [_]
                                     (t2/update! :probe :id 1 {:value 20})))
                                 (conj values (:value row)))
                               [] rows))))
              (is (= [{:id 1 :value 20} {:id 2 :value 10}]
                     (mapv #(into {} %) (t2/select :probe {:order-by [:id]}))))
              (is (.getAutoCommit reader))
              (is (.getAutoCommit writer)))))))))

(deftest sqlite-buffering-preserves-update-count-and-ddl-test
  (with-sqlite-file! false
    (fn [_ _]
      (is (= [0] (t2/query ["CREATE TABLE probe (id INTEGER PRIMARY KEY, value INTEGER)"])))
      (is (= 2 (t2/insert! :probe [{:id 1 :value 0} {:id 2 :value 0}])))
      (is (= 2 (t2/update! :probe {:value 1})))
      (is (= [1] (t2/query ["UPDATE probe SET value = 2 WHERE id = 1"])))
      (is (= 1 (t2/delete! :probe :id 2)))
      (is (= [{:id 1 :value 2}] (mapv #(into {} %) (t2/select :probe)))))))
