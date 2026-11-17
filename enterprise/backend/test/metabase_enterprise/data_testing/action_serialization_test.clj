(ns metabase-enterprise.data-testing.action-serialization-test
  "An action test is exported next to its action, and imported with it."
  (:require
   [clojure.java.io :as io]
   [clojure.test :refer :all]
   [metabase-enterprise.serialization.test-util :as ts]
   [metabase-enterprise.serialization.v2.extract :as extract]
   [metabase-enterprise.serialization.v2.ingest :as ingest]
   [metabase-enterprise.serialization.v2.load :as serdes.load]
   [metabase-enterprise.serialization.v2.storage :as storage]
   [metabase-enterprise.serialization.v2.storage.files :as storage.files]
   [metabase.actions.core :as actions]
   [metabase.actions.schema :as actions.schema]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.util.yaml :as yaml]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private inputs
  [{:table   {:schema "PUBLIC" :name "ORDERS"}
    :format  :rows
    :columns [{:name "ID" :cast_type "INTEGER"} {:name "STATUS" :cast_type "VARCHAR"}]
    :rows    [{"ID" 1 "STATUS" "paid"}]}])

(def ^:private expectations
  [{:type :empty :name "order 1 is refunded" :sql "SELECT * FROM PUBLIC.ORDERS WHERE STATUS <> 'refunded'"}])

(defn- create-action-with-test!
  "Create, in the current app DB, a model in `coll` on `db`, a query action of it named `Refund` with one parameter, and
  a test of the action by `creator`. Returns the action's id."
  [db coll creator]
  (let [mp        (lib-be/application-database-metadata-provider (:id db))
        model     (ts/create! :model/Card
                              :name "Orders" :type :model :database_id (:id db) :collection_id (:id coll)
                              :creator_id (:id creator) :dataset_query (lib/native-query mp "SELECT 1 AS ID"))
        action-id (actions/insert!
                   (lib/normalize ::actions.schema/action.for-insert
                                  {:type          :query
                                   :name          "Refund"
                                   :model_id      (:id model)
                                   :database_id   (:id db)
                                   :creator_id    (:id creator)
                                   :parameters    [{:id "p-id" :slug "id" :type "number"
                                                    :target [:variable [:template-tag "id"]]}]
                                   :dataset_query {:database (:id db)
                                                   :type     :native
                                                   :native   {:query         "UPDATE PUBLIC.ORDERS SET STATUS = 'refunded' WHERE ID = {{id}}"
                                                              :template-tags {"id" {:name "id" :display-name "ID" :type :number}}}}}))]
    (ts/create! :model/ActionTest
                :action_id    action-id
                :creator_id   (:id creator)
                :name         "Refunds one order"
                :description  "Checks the table"
                :parameters   {"id" 1}
                :inputs       inputs
                :expectations expectations)
    action-id))

(deftest action-test-round-trip-test
  (ts/with-random-dump-dir [dump-dir "serdesv2-"]
    (ts/with-dbs [source-db dest-db]
      (let [[action-eid test-eid]
            (ts/with-db source-db
              (let [db        (ts/create! :model/Database :name "my-db" :engine :postgres)
                    coll      (ts/create! :model/Collection :name "Orders")
                    creator   (ts/create! :model/User :email "creator@example.com")
                    action-id (create-action-with-test! db coll creator)]
                (storage/store! (seq (into [] (extract/extract {}))) (storage.files/file-writer dump-dir))
                [(t2/select-one-fn :entity_id :model/Action :id action-id)
                 (t2/select-one-fn :entity_id :model/ActionTest :action_id action-id)]))]
        (testing "premise: the action's file is in its collection's directory"
          (is (.isFile (io/file dump-dir "collections" "main" "orders" "refund.yaml"))))
        (testing "the test's file is in the directory named like its action's file"
          (is (=? {:entity_id    test-eid
                   :action_id    action-eid
                   :creator_id   "creator@example.com"
                   :parameters   {:id 1}
                   :inputs       [{:format "rows"}]
                   :expectations [{:type "empty"}]
                   :serdes/meta  [{:model "ActionTest"}]}
                  (yaml/parse-string
                   (slurp (io/file dump-dir "collections" "main" "orders" "refund" "refunds_one_order.yaml"))))))
        (ts/with-db dest-db
          (is (serdes.load/load-metabase! (ingest/ingest-yaml dump-dir)))
          (testing "the imported test is the exported one, of the imported action"
            (is (=? {:entity_id    test-eid
                     :action_id    (t2/select-one-pk :model/Action :entity_id action-eid)
                     :creator_id   (t2/select-one-pk :model/User :email "creator@example.com")
                     :name         "Refunds one order"
                     :description  "Checks the table"
                     :parameters   {"id" 1}
                     :inputs       inputs
                     :expectations expectations}
                    (t2/select-one :model/ActionTest :entity_id test-eid)))))))))
