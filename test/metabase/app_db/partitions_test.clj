(ns metabase.app-db.partitions-test
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.app-db.connection :as connection]
   [metabase.app-db.core :as mdb]
   [metabase.app-db.partitions :as partitions]
   [next.jdbc :as next.jdbc]))

(set! *warn-on-reflection* true)

(defn partitions-for-months [& months]
  (set (for [m months] (format "query_execution_2026_%02d" m))))

(def now (t/local-date 2026 07 01))
(def mid-month (t/local-date 2026 07 15))
(def next-month (t/local-date 2026 8 01))
(def nnext-month (t/local-date 2026 9 01))

(deftest partitions-to-create-test
  (is (= [] (partitions/partitions-to-create ["query_execution_2026_08"] now)))
  (let [existing (partitions-for-months 7 8)]
    (is (= [] (partitions/partitions-to-create existing now)))
    (is (= [] (partitions/partitions-to-create existing mid-month)))
    (is (= [{:name "query_execution_2026_09" :from "2026-09-01" :to "2026-10-01"}]
           (partitions/partitions-to-create existing next-month)))
    (is (= [{:name "query_execution_2026_09" :from "2026-09-01" :to "2026-10-01"}
            {:name "query_execution_2026_10" :from "2026-10-01" :to "2026-11-01"}]
           (partitions/partitions-to-create existing nnext-month)))))

(deftest partitions-to-detach-test
  (let [existing (partitions-for-months 4 5 6 7)]
    (is (= [] (partitions/partitions-to-detach existing now 0)))
    (is (= (partitions-for-months 4 5 6)
           (set (partitions/partitions-to-detach existing now 7))))
    (is (= (partitions-for-months 4 5 6)
           (set (partitions/partitions-to-detach existing mid-month 7))))
    (is (= (partitions-for-months 4 5)
           (set (partitions/partitions-to-detach existing now 30))))
    (is (= [] (partitions/partitions-to-detach existing now 100)))
    (testing "future months"
      (is (= (partitions-for-months 4 5 6 7)
             (set (partitions/partitions-to-detach existing next-month 7))))
      (is (= (partitions-for-months 4 5 6 7)
             (set (partitions/partitions-to-detach existing next-month 30))))
      (is (= (partitions-for-months 4)
             (set (partitions/partitions-to-detach existing next-month 100))))
      (is (= (partitions-for-months 4 5 6 7)
             (set (partitions/partitions-to-detach existing nnext-month 30))))
      (is (= (partitions-for-months 4 5)
             (set (partitions/partitions-to-detach existing nnext-month 100)))))))

(defn drop-all-tables [conn]
  ;; can't use current-partitions because we want to get rid of them regardless
  ;; of whether they're attached currently or not
  (doseq [t (next.jdbc/execute! conn ["SELECT table_name FROM information_schema.tables
                                      WHERE table_name LIKE 'query_execution_%'"])]
    (next.jdbc/execute! conn [(format "DROP TABLE %s" (:tables/table_name t))])))

(deftest manage-partitions
  (when (= :postgres (mdb/db-type))
    (with-open [conn (.getConnection (connection/data-source))]
      (try
        (testing "Normal progression of time"
          (drop-all-tables conn)
          (partitions/manage-partitions conn now 25)
          (is (= #{"query_execution_2026_07"
                   "query_execution_2026_08"}
                 (set (partitions/current-partitions conn))))
          (partitions/manage-partitions conn next-month 25)
          (is (= #{"query_execution_2026_08"
                   "query_execution_2026_09"}
                 (set (partitions/current-partitions conn))))
          (partitions/manage-partitions conn nnext-month 45)
          (is (= #{"query_execution_2026_08"
                   "query_execution_2026_09"
                   "query_execution_2026_10"}
                 (set (partitions/current-partitions conn))))
          (partitions/manage-partitions conn nnext-month 25)
          (is (= #{"query_execution_2026_09"
                   "query_execution_2026_10"}
                 (set (partitions/current-partitions conn)))))
        (testing "Initial run with a multi-month legacy partition"
          (drop-all-tables conn)
          (partitions/create-partition conn {:name "query_execution_2026_08"
                                             :from "1970-01-01"
                                             :to "2026-08-01"})
          (partitions/manage-partitions conn now 25)
          (is (= #{"query_execution_2026_08"}
                 (set (partitions/current-partitions conn)))))
        (finally
          (drop-all-tables conn)
          ;; make sure we end up in a good state for other tests
          (partitions/manage-partitions conn (t/local-date) 100))))))
