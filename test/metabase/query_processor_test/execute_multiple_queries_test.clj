(ns metabase.query-processor-test.execute-multiple-queries-test
  "Tests for [[metabase.driver/EXPERIMENTAL-execute-multiple-queries]]."
  (:require
   [clojure.set :as set]
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.lib.convert :as lib.convert]
   [metabase.query-processor.compile :as qp.compile]
   [metabase.query-processor.pipeline :as qp.pipeline]
   [metabase.query-processor.store :as qp.store]
   [metabase.test :as mt]))

(defn- compiled-query [query]
  {:lib/type :mbql/query
   :database (mt/id)
   :stages   [(merge
               {:lib/type :mbql.stage/native}
               (set/rename-keys (qp.compile/compile query) {:query :native}))]})

(deftest ^:parallel execute-multiple-queries-test
  (mt/test-drivers (mt/normal-drivers)
    (when (get-method driver/EXPERIMENTAL-execute-multiple-queries driver/*driver*)
      (qp.store/with-metadata-provider (mt/id)
        (let [q1      (compiled-query (mt/mbql-query venues {:filter [:= $name "Fred 62"]}))
              q2      (compiled-query (mt/mbql-query venues {:filter [:= $name "Brite Spot Family Restaurant"]}))
              respond (fn respond [metadata rows]
                        {:metadata metadata, :rows (into [] rows)})
              single-results (driver/execute-reducible-query
                              driver/*driver*
                              (lib.convert/->legacy-MBQL q1)
                              {:canceled-chan qp.pipeline/*canceled-chan*}
                              respond)
              multi-results (driver/EXPERIMENTAL-execute-multiple-queries
                             driver/*driver*
                             [q1 q2]
                             respond)]
          ;; we don't really care if the database type is a little different in the UNION ALL version. For MySQL when we
          ;; UNION ALL two MEDIUMTEXT columns we get a TEXT column in the result
          (letfn [(cols [results]
                    (mapv (fn [col]
                            (dissoc col :database_type))
                          (get-in results [:metadata :cols])))]
            (is (= (cols single-results)
                   (cols multi-results))))
          (is (= [[10 "Fred 62"                      20 34.1  -118.29 2]
                  [5  "Brite Spot Family Restaurant" 20 34.08 -118.26 2]]
                 (mt/formatted-rows
                  [int str int 2.0 2.0 int]
                  {:data multi-results}))))))))
