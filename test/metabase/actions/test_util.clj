(ns metabase.actions.test-util
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.test :refer :all]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.models.database :refer [Database]]
   [metabase.test :as mt]
   [metabase.test.data.dataset-definitions :as defs]
   [metabase.test.data.impl :as data.impl]
   [metabase.test.data.interface :as tx]
   [toucan.db :as db]))

#_ {:clj-kondo/ignore [:unused-private-var]}
(def ^:private actions-test-data
  "This is basically the same as [[defs/test-data]] but it only includes the `categories` table for faster loading. It's
  meant to be reloaded at the start of every test using it so tests can do destructive things against it e.g. deleting
  rows. (With one Table it takes ~100ms/~250ms instead of ~200ms/~450ms for H2/Postgres respectively to load all the
  data and sync it.)"
  ;; TODO -- this is still annoyingly SLOW we need to optimize this a bit can't be waiting 200ms for every single test
  (tx/transformed-dataset-definition
   "actions-test-data"
   defs/test-data
   (fn [database-definition]
     (update database-definition :table-definitions (fn [table-definitions]
                                                      (filter #(= (:table-name %) "categories")
                                                              table-definitions))))))

(defn do-with-actions-test-data
  "Impl for [[with-actions-test-data]] macro."
  [thunk]
  (let [db (atom nil)]
    (try
      (mt/dataset actions-test-data
        (reset! db (mt/db))
        (thunk))
      (finally
        (let [{driver :engine, db-id :id} @db]
          (tx/destroy-db! driver (tx/get-dataset-definition
                                  (data.impl/resolve-dataset-definition 'metabase.actions.test-util 'actions-test-data)))
          (db/delete! Database :id db-id))))))

(defmacro with-actions-test-data
  "Sets the current dataset to a freshly-loaded copy of [[defs/test-data]] that only includes the `categories` table
  that gets destroyed at the conclusion of `body`. Use this to test destructive actions that may modify the data."
  {:style/indent 0}
  [& body]
  `(do-with-actions-test-data (fn [] ~@body)))

(deftest with-actions-test-data-test
  ;; TODO -- use the feature `:actions` once #22691 is merged in
  (mt/test-drivers #{:h2 :postgres}
    (dotimes [i 2]
      (testing (format "Iteration %d" i)
        (with-actions-test-data
          (letfn [(row-count []
                    (mt/rows (mt/run-mbql-query categories {:aggregation [[:count]]})))]
            (testing "before"
              (is (= [[75]]
                     (row-count))))
            (testing "delete row"
              (is (= [1]
                     (jdbc/execute! (sql-jdbc.conn/db->pooled-connection-spec (mt/id))
                                    "DELETE FROM CATEGORIES WHERE ID = 1;"))))
            (testing "after"
              (is (= [[74]]
                     (row-count))))))))))
