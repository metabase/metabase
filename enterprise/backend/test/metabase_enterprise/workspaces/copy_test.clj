(ns metabase-enterprise.workspaces.copy-test
  "How a workspace's copies differ from the shared metadata: what a transform records, and what a request in the
  workspace reads."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.workspaces.copy :as ws.copy]
   [metabase-enterprise.workspaces.db :as ws.db]
   [metabase-enterprise.workspaces.query-processor.copy-metadata :as ws.copy-metadata]
   [metabase-enterprise.workspaces.request-workspace-test :as request-workspace-test]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.sync.core :as sync]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn column
  "A copy column, as `describe-table` describes it."
  [column-name base-type database-type position]
  {:name column-name :base-type base-type :database-type database-type :database-position position})

(def ^:private canonical-columns
  [(column "id" :type/Integer "int4" 0)
   (column "name" :type/Text "text" 1)
   (column "created" :type/Text "text" 2)])

(defn do-with-orders
  "Calls `f` with `{:workspace-id :db-id :table-id :field-ids}`: a workspace's Database with a Table `orders` whose
  shared Fields are `canonical-columns`, `created` coerced to a datetime, and `name` holding a nested Field `first`."
  [f]
  (request-workspace-test/do-with-request-workspace
   (fn [{:keys [db-id] :as context}]
     (mt/with-temp [:model/Table {table-id :id} {:db_id db-id :schema "public" :name "orders" :active true
                                                 :field_order :alphabetical}
                    :model/Field {id-id :id}    {:table_id table-id :name "id" :base_type :type/Integer
                                                 :database_type "int4" :database_position 0 :position 0}
                    :model/Field {name-id :id}  {:table_id table-id :name "name" :base_type :type/Text
                                                 :database_type "text" :database_position 1 :position 2}
                    :model/Field {first-id :id} {:table_id table-id :name "first" :base_type :type/Text
                                                 :database_type "text" :parent_id name-id}
                    :model/Field {created-id :id} {:table_id table-id :name "created" :base_type :type/Text
                                                   :database_type "text" :database_position 2 :position 1
                                                   :coercion_strategy :Coercion/ISO8601->DateTime
                                                   :effective_type :type/DateTime}]
       (f (assoc context :table-id table-id :field-ids {"id" id-id "name" name-id "first" first-id
                                                        "created" created-id}))))))

(defn record!
  "Record, in the workspace, a copy of the Table with `table-id` whose columns are `columns`."
  [workspace-id db-id table-id columns]
  (mt/with-dynamic-fn-redefs [sync/table-fields-metadata (constantly (set columns))]
    (ws.copy/record-copy! workspace-id (lib.metadata/database (lib-be/application-database-metadata-provider db-id))
                          (t2/select-one :model/Table :id table-id))))

(defn- field-copies [workspace-id]
  (into {}
        (map (juxt :field_id #(select-keys % [:active :base_type :database_type :database_position])))
        (t2/select :model/WorkspaceFieldCopy :workspace_id workspace-id)))

(deftest record-copy-test
  (do-with-orders
   (fn [{:keys [workspace-id db-id table-id field-ids]}]
     (testing "a copy with the shape of its canonical table has no copy rows"
       (record! workspace-id db-id table-id canonical-columns)
       (is (= {} (field-copies workspace-id)))
       (is (not (t2/exists? :model/WorkspaceTableCopy :workspace_id workspace-id))))
     (testing "a copy records only how it differs"
       (record! workspace-id db-id table-id [(column "id" :type/Integer "int4" 0)
                                             (column "created" :type/DateTime "timestamp" 1)
                                             (column "total" :type/Float "float8" 2)])
       (let [total-id (t2/select-one-pk :model/Field :table_id table-id :name "total")]
         (testing "a column only the copy has is an inactive shared Field"
           (is (=? {:active false :base_type :type/Float} (t2/select-one :model/Field :id total-id))))
         (is (= {(field-ids "created") {:active true :base_type :type/DateTime :database_type "timestamp"
                                        :database_position 1}
                 total-id              {:active true :base_type :type/Float :database_type "float8"
                                        :database_position 2}
                 (field-ids "name")    {:active false :base_type nil :database_type nil :database_position nil}
                 (field-ids "first")   {:active false :base_type nil :database_type nil :database_position nil}}
                (field-copies workspace-id)))))
     (testing "a copy back in the canonical shape deletes the rows"
       (record! workspace-id db-id table-id canonical-columns)
       (is (= {} (field-copies workspace-id))))
     (testing "a Table that only workspaces have is active in a workspace that records its copy"
       (t2/update! :model/Table :id table-id {:active false})
       (record! workspace-id db-id table-id canonical-columns)
       (is (=? [{:table_id table-id :active true}] (t2/select :model/WorkspaceTableCopy :workspace_id workspace-id)))))))

(defn- copy-provider [workspace-id db-id]
  (ws.copy-metadata/copy-metadata-provider (lib-be/application-database-metadata-provider db-id) workspace-id db-id))

(deftest copy-metadata-provider-test
  (do-with-orders
   (fn [{:keys [workspace-id db-id table-id field-ids]}]
     (testing "a workspace with no copy rows has no provider of its own"
       (is (nil? (copy-provider workspace-id db-id))))
     (record! workspace-id db-id table-id [(column "id" :type/Integer "int4" 0)
                                           (column "created" :type/DateTime "timestamp" 1)
                                           (column "total" :type/Float "float8" 2)])
     (let [mp       (copy-provider workspace-id db-id)
           total-id (t2/select-one-pk :model/Field :table_id table-id :name "total")]
       (testing "the fields of a table are those of the copy"
         (is (= #{"id" "created" "total"} (into #{} (map :name) (lib.metadata/fields mp table-id)))))
       (testing "a column the copy gives another base type has that type, without the shared coercion"
         (is (=? {:base-type :type/DateTime :effective-type :type/DateTime :coercion-strategy nil
                  :database-type "timestamp"}
                 (lib.metadata/field mp (field-ids "created")))))
       (testing "a column the copy lacks is inactive when read by id"
         (is (=? {:active false} (lib.metadata/field mp (field-ids "name"))))
         (is (=? [{:id (field-ids "name") :active false}]
                 (lib.metadata.protocols/cached-metadatas mp :metadata/column [(field-ids "name")]))))
       (testing "a column only the copy has is active"
         (is (=? {:active true :base-type :type/Float} (lib.metadata/field mp total-id))))
       (testing "the shared metadata does not change"
         (is (= #{"id" "name" "first" "created"}
                (into #{} (map :name) (lib.metadata/fields (lib-be/application-database-metadata-provider db-id)
                                                           table-id))))))
     (testing "a Table only the workspace has is in the workspace's tables"
       (t2/update! :model/Table :id table-id {:active false})
       (record! workspace-id db-id table-id canonical-columns)
       (is (contains? (into #{} (map :id) (lib.metadata/tables (copy-provider workspace-id db-id))) table-id))
       (is (not (contains? (into #{} (map :id) (lib.metadata/tables (lib-be/application-database-metadata-provider db-id)))
                           table-id)))))))

(deftest query-metadata-test
  (do-with-orders
   (fn [{:keys [workspace-id db-id table-id field-ids]}]
     (record! workspace-id db-id table-id [(column "id" :type/Integer "int4" 0)
                                           (column "created" :type/DateTime "timestamp" 1)
                                           (column "total" :type/Float "float8" 2)])
     (let [path    (format "table/%d/query_metadata" table-id)
           headers {:request-options {:headers {"x-metabase-workspace-id" (str workspace-id)}}}]
       (testing "without the header, the shared fields"
         (is (= ["id" "created" "first" "name"] (map :name (:fields (mt/user-http-request :crowberto :get 200 path))))))
       (testing "in the workspace, the copy's fields, in the table's field order"
         (let [fields (:fields (mt/user-http-request :crowberto :get 200 path headers))]
           (is (= ["id" "created" "total"] (map :name fields)))
           (is (=? {:id (field-ids "created") :base_type "type/DateTime" :coercion_strategy nil}
                   (second fields)))))
       (testing "a retired column the copy has stays out"
         (t2/update! :model/Field :table_id table-id :name "total" {:visibility_type :retired})
         (is (= ["id" "created"]
                (map :name (:fields (mt/user-http-request :crowberto :get 200 path headers))))))))))

(deftest deprovisioned-database-loses-its-copy-rows-test
  (do-with-orders
   (fn [{:keys [workspace-id db-id table-id]}]
     (t2/update! :model/Table :id table-id {:active false})
     (record! workspace-id db-id table-id [(column "id" :type/Integer "int4" 0)])
     (is (t2/exists? :model/WorkspaceFieldCopy :workspace_id workspace-id))
     (is (t2/exists? :model/WorkspaceTableCopy :workspace_id workspace-id))
     (testing "the copies were in the isolation schema that a deprovision drops, so their rows go with it"
       (ws.db/delete-copies-of-database! workspace-id db-id)
       (is (not (t2/exists? :model/WorkspaceFieldCopy :workspace_id workspace-id)))
       (is (not (t2/exists? :model/WorkspaceTableCopy :workspace_id workspace-id)))))))
