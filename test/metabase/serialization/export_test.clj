(ns metabase.serialization.export-test
  (:require
   [clojure.test :refer :all]
   [metabase.serialization.core :as serialization]
   [metabase.settings.models.setting :as setting]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(deftest export-test
  (testing "exports the objects the caller selected, in one transaction"
    (mt/with-temp [:model/Collection {coll-id :id} {:name "serdes export"}
                   :model/Card       _             {:collection_id coll-id :name "a"}
                   :model/Card       _             {:collection_id coll-id :name "b"}]
      (is (= ["a" "b"]
             (serialization/with-export-transaction
               (mapv :name (serialization/export :model/Card (t2/reducible-select :model/Card :collection_id coll-id
                                                                                  {:order-by [[:name :asc]]})))))))))

(deftest export-skips-missing-references-test
  (testing "an object whose reference has no target is left out, and the others export"
    (mt/with-temp [:model/Collection {coll-id :id} {}
                   :model/Card       card          {:collection_id coll-id :name "card"}]
      (let [exported (into [] (serialization/export :model/Card [card (assoc card :collection_id Integer/MAX_VALUE)]))]
        (is (= ["card"] (map :name exported)))))))

(deftest export-settings-test
  (testing "settings export by key"
    (mt/with-temporary-setting-values [site-name "serdes site"]
      (is (some #{{:serdes/meta [{:model "Setting"}] :key "site-name" :value "serdes site"}}
                (into [] (serialization/export :model/Setting (setting/exportable-settings))))))))

(deftest export-transaction-isolation-test
  (testing "the export transaction is REPEATABLE READ, and the connection gets its isolation back afterwards"
    (let [isolation #(t2/with-connection [^java.sql.Connection conn] (.getTransactionIsolation conn))
          before    (isolation)]
      (is (= java.sql.Connection/TRANSACTION_REPEATABLE_READ (serialization/with-export-transaction (isolation))))
      (is (= before (isolation))))))
