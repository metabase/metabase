(ns metabase.serialization.protocol.memoized-test
  (:require
   [clojure.test :refer :all]
   [metabase.serialization.core :as serialization]
   [metabase.serialization.protocol :as protocol]))

(defn- counting-store
  "A store of the rows `rows`, a map from model to a map from pk to row, that records the pks of each read."
  [rows reads]
  (reify protocol/Store
    (select-by-pks [_ model pks columns]
      (swap! reads conj [model columns (set pks)])
      (keep #(get-in rows [model %]) pks))
    (select-by-refs [_ _ _ _] {})
    (select-by-parent-pks [_ _ _ _] [])
    (transact [_ _ f] (f))))

(deftest memoized-store-test
  (let [reads (atom [])
        store (serialization/memoized-store
               (counting-store {:model/Collection {1 {:id 1 :entity_id "a"} 2 {:id 2 :entity_id "b"}}} reads))]
    (testing "a read gives the rows of the pks that have one"
      (is (= [{:id 1 :entity_id "a"}]
             (protocol/select-by-pks store :model/Collection #{1 3} [:id :entity_id]))))
    (testing "a later read of the same columns reads only the pks not read before, missing ones included"
      (is (= #{{:id 1 :entity_id "a"} {:id 2 :entity_id "b"}}
             (set (protocol/select-by-pks store :model/Collection #{1 2 3} [:id :entity_id]))))
      (is (= [[:model/Collection [:id :entity_id] #{1 3}]
              [:model/Collection [:id :entity_id] #{2}]]
             @reads)))
    (testing "a read of other columns reads again"
      (protocol/select-by-pks store :model/Collection #{1} [:id :name])
      (is (= [:model/Collection [:id :name] #{1}] (peek @reads))))))
