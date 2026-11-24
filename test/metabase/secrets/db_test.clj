(ns metabase.secrets.db-test
  (:require
   [clojure.test :refer :all]
   [metabase.secrets.db :as secrets.db]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(deftest delete-secrets-partitions-test
  (let [ids (vec (for [i (range 5)]
                   (:id (secrets.db/insert-secret! {:name (str "partitioned secret " i) :kind "password" :value "v"}))))]
    (testing "every Secret is deleted and counted, whatever the number of statements"
      (is (= 5 (mt/with-partition-size 2
                 (secrets.db/delete-secrets! ids))))
      (is (zero? (t2/count :model/Secret :id [:in ids]))))))
