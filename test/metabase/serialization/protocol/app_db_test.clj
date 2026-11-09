(ns metabase.serialization.protocol.app-db-test
  (:require
   [clojure.test :refer :all]
   [metabase.serialization.db :as serialization.db]
   [metabase.serialization.protocol :as protocol]
   [metabase.serialization.protocol.app-db :as protocol.app-db]
   [metabase.serialization.resolve :as resolve]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(defn- query-count [thunk]
  (t2/with-call-count [call-count]
    (thunk)
    (call-count)))

(def ^:private store protocol.app-db/store)

(def ^:private create-missing {:create-missing? true})

(deftest entity-ids-test
  (testing "exports the entity ids of existing rows, leaving out missing ones"
    (mt/with-temp [:model/Collection {coll-id :id coll-eid :entity_id} {}]
      (is (= {coll-id coll-eid}
             (resolve/entity-ids store :model/Collection #{coll-id Integer/MAX_VALUE}))))))

(deftest database-refs-test
  (mt/with-temp [:model/Database {db-id :id} {:name "serdes-db"}]
    (is (= {db-id "serdes-db" Integer/MAX_VALUE nil}
           (resolve/database-refs store #{db-id Integer/MAX_VALUE})))))

(deftest table-refs-test
  (mt/with-temp [:model/Database {db-id :id}       {:name "serdes-db"}
                 :model/Table    {table-id :id}    {:db_id db-id :name "users" :schema "public"}
                 :model/Table    {schemaless :id}  {:db_id db-id :name "events" :schema nil}]
    (is (= {table-id   ["serdes-db" "public" "users"]
            schemaless ["serdes-db" nil "events"]}
           (resolve/table-refs store #{table-id schemaless Integer/MAX_VALUE})))))

(deftest field-refs-test
  (testing "exports nested Fields with one query per nesting level, whatever their number"
    (mt/with-temp [:model/Database {db-id :id}    {:name "serdes-db"}
                   :model/Table    {table-id :id} {:db_id db-id :name "events" :schema "public"}
                   :model/Field    {outer-id :id} {:table_id table-id :name "outer"}]
      (let [field-ids (vec (for [i (range 30)]
                             (t2/insert-returning-pk! :model/Field {:table_id      table-id
                                                                    :parent_id     outer-id
                                                                    :name          (str "inner_" i)
                                                                    :base_type     :type/Text
                                                                    :database_type "TEXT"})))
            export    #(resolve/field-refs store (set %))]
        (is (= {outer-id          ["serdes-db" "public" "events" "outer"]
                (first field-ids) ["serdes-db" "public" "events" "outer" "inner_0"]}
               (select-keys (export (conj field-ids outer-id Integer/MAX_VALUE))
                            [outer-id (first field-ids) Integer/MAX_VALUE])))
        (is (= (query-count #(export (take 2 field-ids)))
               (query-count #(export field-ids))))))))

(deftest entity-pks-test
  (mt/with-temp [:model/Collection {coll-id :id coll-eid :entity_id} {}]
    (testing "imports entity ids and numeric ids, leaving out missing ones"
      (is (= {coll-eid coll-id
              coll-id  coll-id}
             (resolve/entity-pks store :model/Collection #{coll-eid coll-id "aaaaaaaaaaaaaaaaaaaaa"
                                                           Integer/MAX_VALUE}))))))

(deftest user-ids-test
  (testing "finds existing Users and creates inactive ones for the missing emails"
    (mt/with-model-cleanup [:model/User]
      (let [rasta-id (mt/user->id :rasta)
            email    "serdes-new@example.com"
            ids      (resolve/user-ids store #{"rasta@metabase.com" email} create-missing)]
        (is (= rasta-id (get ids "rasta@metabase.com")))
        (is (= [email false]
               (t2/select-one-fn (juxt :email :is_active) [:model/User :email :is_active] :id (get ids email))))))))

(deftest database-and-table-ids-test
  (testing "finds existing Databases and Tables and creates stubs for missing ones"
    (mt/with-model-cleanup [:model/Database :model/Table]
      (mt/with-temp [:model/Database {db-id :id}    {:name "serdes-db"}
                     :model/Table    {table-id :id} {:db_id db-id :name "users" :schema "public"}]
        (let [ids (resolve/table-ids store
                                     #{["serdes-db" "public" "users"]
                                       ["serdes-db" nil "fresh"]
                                       ["serdes-missing-db" "public" "users"]}
                                     create-missing)]
          (is (= table-id (get ids ["serdes-db" "public" "users"])))
          (is (=? {:db_id db-id :schema nil :name "fresh" :active false}
                  (t2/select-one :model/Table :id (get ids ["serdes-db" nil "fresh"]))))
          (is (=? {:name "serdes-missing-db" :is_stub true}
                  (t2/select-one :model/Database
                                 :id (t2/select-one-fn :db_id :model/Table
                                                       :id (get ids ["serdes-missing-db" "public" "users"]))))))))))

(deftest field-ids-test
  (testing "finds existing Fields and creates each missing node of the references once"
    (mt/with-model-cleanup [:model/Field]
      (mt/with-temp [:model/Database {db-id :id}    {:name "serdes-db"}
                     :model/Table    {table-id :id} {:db_id db-id :name "events" :schema "public"}
                     :model/Field    {outer-id :id} {:table_id table-id :name "outer"}]
        (let [refs     [["serdes-db" "public" "events" "outer"]
                        ["serdes-db" "public" "events" "outer" "x"]
                        ["serdes-db" "public" "events" "outer" "y"]
                        ["serdes-db" "public" "events" "fresh" "z"]]
              import   #(resolve/field-ids store (set %) create-missing)
              resolved (import refs)]
          (is (= outer-id (get resolved (first refs))))
          (is (= #{outer-id}
                 (t2/select-fn-set :parent_id :model/Field :id [:in [(get resolved (nth refs 1))
                                                                     (get resolved (nth refs 2))]])))
          (is (= 5 (t2/count :model/Field :table_id table-id)))
          (testing "and resolves them again without creating anything, in as many queries for few references as many"
            (is (= resolved (import refs)))
            (is (= 5 (t2/count :model/Field :table_id table-id)))
            (is (= (query-count #(import (take 2 refs)))
                   (query-count #(import refs))))))))))

(deftest insert-rows-order-test
  (testing "returns the inserted instances in the order of the rows, whatever order the insert returns them in"
    (mt/with-temp [:model/Database {db-id :id}    {:name "serdes-db"}
                   :model/Table    {table-id :id} {:db_id db-id :name "events" :schema "public"}]
      (let [insert-rows! (mt/original-fn #'serialization.db/insert-rows!)
            rows         (mapv (fn [field-name] {:table_id      table-id
                                                 :name          field-name
                                                 :base_type     :type/Text
                                                 :database_type "TEXT"})
                               ["a" "b" "c"])]
        (mt/with-dynamic-fn-redefs [serialization.db/insert-rows! (fn [model rows] (reverse (insert-rows! model rows)))]
          (is (= ["a" "b" "c"] (map :name (protocol/insert-rows! store :model/Field rows)))))))))

(deftest select-by-refs-test
  (testing "selects the oldest row of each ref"
    (mt/with-temp [:model/Database {db-id :id}  {:name "serdes-db"}
                   :model/Table    {users :id}  {:db_id db-id :name "users" :schema "public"}
                   :model/Table    {other :id}  {:db_id db-id :name "users" :schema "other"}
                   :model/Table    {events :id} {:db_id db-id :name "events" :schema nil}
                   :model/Field    {outer :id}  {:table_id events :name "outer"}
                   :model/Field    {inner :id}  {:table_id events :parent_id outer :name "inner"}]
      (testing "of Tables, by Database name, schema and name"
        (is (= {["serdes-db" "public" "users"] users
                ["serdes-db" nil "events"]     events}
               (update-vals (protocol/select-by-refs store :model/Table
                                                     #{["serdes-db" "public" "users"] ["serdes-db" nil "events"]
                                                       ["serdes-db" "public" "missing"]}
                                                     [:id])
                            :id)))
        (is (= {["serdes-db" "other" "users"] other}
               (update-vals (protocol/select-by-refs store :model/Table #{["serdes-db" "other" "users"]} [:id])
                            :id))))
      (testing "of nested Fields, one query per nesting level"
        (is (= {["serdes-db" nil "events" "outer"]         outer
                ["serdes-db" nil "events" "outer" "inner"] inner}
               (update-vals (protocol/select-by-refs store :model/Field
                                                     #{["serdes-db" nil "events" "outer"]
                                                       ["serdes-db" nil "events" "outer" "inner"]
                                                       ["serdes-db" nil "events" "inner"]}
                                                     [:id])
                            :id))))
      (testing "of Databases, by name"
        (is (= {"serdes-db" db-id}
               (update-vals (protocol/select-by-refs store :model/Database #{"serdes-db" "missing"} [:id]) :id)))))))
