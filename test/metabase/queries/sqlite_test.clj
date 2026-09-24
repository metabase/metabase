(ns metabase.queries.sqlite-test
  (:require
   [clojure.test :refer :all]
   [metabase.app-db.connection :as connection]
   [metabase.app-db.core :as mdb]
   [metabase.app-db.data-source :as data-source]
   [metabase.app-db.liquibase :as liquibase]
   [metabase.queries.db :as queries-db]
   [metabase.queries.models.card]
   [toucan2.core :as t2])
  (:import
   (java.nio.file Files)
   (java.nio.file.attribute FileAttribute)
   (java.time OffsetDateTime)))

(set! *warn-on-reflection* true)

(use-fixtures :each
  (fn [f]
    (let [path (Files/createTempFile "metabase-sqlite-query-hydration-" ".db" (make-array FileAttribute 0))
          source (data-source/broken-out-details->DataSource :sqlite {:db (str path)})]
      (try
        (with-open [conn (.getConnection source)]
          (liquibase/with-liquibase [lb conn]
            (.update lb "")))
        (mdb/with-application-db (connection/application-db :sqlite source)
          (f))
        (finally
          (doseq [suffix ["" "-wal" "-shm"]]
            (Files/deleteIfExists (.resolveSibling path (str (.getFileName path) suffix)))))))))

(deftest last-query-start-hydration-test
  (let [earlier (OffsetDateTime/parse "2026-09-23T12:34:56.000001Z")
        latest (OffsetDateTime/parse "2026-09-24T12:34:56.123456Z")
        cached (OffsetDateTime/parse "2026-09-25T12:34:56.999999Z")]
    (t2/query {:insert-into :query_execution
               :values (for [[card-id started-at cache-hit] [[100 earlier false]
                                                             [100 latest false]
                                                             [100 latest false]
                                                             [100 cached true]
                                                             [101 earlier false]
                                                             [102 cached true]
                                                             [103 cached false]]]
                         {:hash (byte-array [1]) :card_id card-id :started_at started-at :cache_hit cache-hit
                          :running_time 5 :result_rows 1 :native false})})
    (testing "The batched query preserves temporal types and precision while excluding cached executions and unrequested cards"
      (is (= [{:card_id 100 :started_at latest} {:card_id 101 :started_at earlier}]
             (sort-by :card_id (queries-db/last-query-starts-by-card [100 101 102])))))
    (testing "Card hydration can satisfy the API TemporalInstant response schema"
      (let [cards (t2/hydrate (mapv #(t2/instance :model/Card {:id %}) [100 101 102]) :last_query_start)]
        (is (= [latest earlier nil] (mapv :last_query_start cards)))
        (is (every? #(instance? OffsetDateTime %) (keep :last_query_start cards)))))
    (is (= [] (queries-db/last-query-starts-by-card [])))))
