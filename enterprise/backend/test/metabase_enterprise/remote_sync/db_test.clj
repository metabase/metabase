(ns metabase-enterprise.remote-sync.db-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.remote-sync.db :as remote-sync.db]
   [metabase.app-db.core :as mdb]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db))

(defn- ids
  "`n` consecutive ids that match no row."
  [n]
  (vec (range 900000000 (+ 900000000 n))))

(defn- rolled-back
  "Call `f` in an app-DB transaction that is rolled back. Returns `{:result <f's result>}`, or `{:error <message>}`
  when `f` throws."
  [f]
  (try
    (t2/with-transaction [_conn nil {:rollback-only true}]
      {:result (f)})
    (catch Exception e
      {:error (ex-message (or (ex-cause e) e))})))

;; Postgres accepts at most 65,535 bind parameters in one statement.
(deftest delete-step-above-postgres-parameter-limit-test
  (when (= :postgres (mdb/db-type))
    (testing "delete-rsos-of-keys! accepts 32,768 keys (65,536 parameters)"
      (is (= {:result 0}
             (rolled-back #(remote-sync.db/delete-rsos-of-keys!
                            (mapv (fn [id] {:model_type "Card" :model_id id}) (ids 32768)))))))
    (testing "delete-instances! accepts 65,536 ids"
      (is (= {:result 0}
             (rolled-back #(remote-sync.db/delete-instances! :model/Card (ids 65536))))))
    (testing "child-card-ids accepts 65,536 dashboard ids"
      (is (= {:result []}
             (rolled-back #(remote-sync.db/child-card-ids (ids 65536) [])))))))
