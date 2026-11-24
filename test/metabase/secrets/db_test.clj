(ns metabase.secrets.db-test
  (:require
   [clojure.test :refer :all]
   [metabase.app-db.query :as mdb.query]
   [metabase.secrets.db :as secrets.db]
   [toucan2.core :as t2]))

(deftest delete-secrets-partitions-test
  (let [ids (vec (for [i (range 5)]
                   (:id (secrets.db/insert-secret! {:name (str "partitioned secret " i) :kind "password" :value "v"}))))]
    (testing "every Secret is deleted and counted, whatever the number of statements"
      (is (= 5 (with-redefs [mdb.query/delete-partition-size 2]
                 (secrets.db/delete-secrets! ids))))
      (is (zero? (t2/count :model/Secret :id [:in ids]))))))
