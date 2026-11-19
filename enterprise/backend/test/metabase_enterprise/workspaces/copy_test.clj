(ns metabase-enterprise.workspaces.copy-test
  "How a workspace's copies differ from the shared metadata: what a transform records, and what a request in the
  workspace reads. A column only the copy has is a Field the workspace owns, a column the copy lacks is a hide row, and
  a column the copy gives another type is a type row. Row-level security shows each workspace its own rows, so these
  tests run only where the app DB can keep the rows of workspaces apart."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.workspaces.copy :as ws.copy]
   [metabase-enterprise.workspaces.db :as ws.db]
   [metabase-enterprise.workspaces.query-processor.copy-metadata :as ws.copy-metadata]
   [metabase-enterprise.workspaces.request-workspace :as ws.request-workspace]
   [metabase-enterprise.workspaces.request-workspace-test :as request-workspace-test]
   [metabase-enterprise.workspaces.row-security-test :as row-security-test]
   [metabase.app-db.core :as mdb]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.sync.core :as sync]
   [metabase.test :as mt]
   [metabase.workspaces.core :as workspaces]
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

(def ^:private changed-columns
  "A copy that keeps `id`, gives `created` another type, drops `name`, and adds `total`."
  [(column "id" :type/Integer "int4" 0)
   (column "created" :type/DateTime "timestamp" 1)
   (column "total" :type/Float "float8" 2)])

(defn do-with-orders!
  "Calls `f` with `{:workspace-id :db-id :table-id :field-ids}`: a workspace's Database with a Table `orders` whose
  shared Fields are `canonical-columns`, `created` coerced to a datetime, and `name` holding a nested Field `first`.
  Only where requests can name a workspace ([[row-security-test/with-request-workspaces-enabled!]])."
  [f]
  (row-security-test/with-request-workspaces-enabled!
    (request-workspace-test/do-with-request-workspace
     (fn [{:keys [db-id] :as context}]
       (mt/with-temp [:model/Table {table-id :id} {:db_id db-id :schema "public" :name "orders" :active true
                                                   :field_order :database}
                      :model/Field {id-id :id}    {:table_id table-id :name "id" :base_type :type/Integer
                                                   :database_type "int4" :database_position 0 :position 0}
                      :model/Field {name-id :id}  {:table_id table-id :name "name" :base_type :type/Text
                                                   :database_type "text" :database_position 1 :position 1}
                      :model/Field {first-id :id} {:table_id table-id :name "first" :base_type :type/Text
                                                   :database_type "text" :parent_id name-id}
                      :model/Field {created-id :id} {:table_id table-id :name "created" :base_type :type/Text
                                                     :database_type "text" :database_position 2 :position 2
                                                     :coercion_strategy :Coercion/ISO8601->DateTime
                                                     :effective_type :type/DateTime}]
         (f (assoc context :table-id table-id :field-ids {"id" id-id "name" name-id "first" first-id
                                                          "created" created-id})))))))

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

(defn- owned-fields [workspace-id table-id]
  (mdb/with-workspace-id :all
    (into {}
          (map (juxt :name #(select-keys % [:active :base_type :database_type :database_position])))
          (t2/select :model/Field :table_id table-id :workspace_id workspace-id))))

(defn- top-level-field-names [table-id]
  (t2/select-fn-set :name :model/Field :table_id table-id :parent_id nil))

(deftest record-copy-test
  (do-with-orders!
   (fn [{:keys [workspace-id db-id table-id field-ids]}]
     (testing "a copy with the shape of its canonical table has no rows"
       (record! workspace-id db-id table-id canonical-columns)
       (is (= {} (field-copies workspace-id)))
       (is (= {} (owned-fields workspace-id table-id))))
     (testing "a copy records only how it differs"
       (record! workspace-id db-id table-id changed-columns)
       (testing "a column only the copy has is a Field the workspace owns"
         (is (= {"total" {:active true :base_type :type/Float :database_type "float8" :database_position 2}}
                (owned-fields workspace-id table-id))))
       (testing "a column the copy gives another type has a type row; a column it lacks, and the Fields nested in it,
                 have hide rows"
         (is (= {(field-ids "created") {:active true :base_type :type/DateTime :database_type "timestamp"
                                        :database_position 1}
                 (field-ids "name")    {:active false :base_type nil :database_type nil :database_position nil}
                 (field-ids "first")   {:active false :base_type nil :database_type nil :database_position nil}}
                (field-copies workspace-id)))))
     (testing "the workspace sees the copy's columns"
       (workspaces/with-workspace-id workspace-id
         (is (= #{"id" "created" "total"} (top-level-field-names table-id)))))
     (testing "no workspace sees the shared columns"
       (is (= #{"id" "name" "created"} (top-level-field-names table-id))))
     (testing "recording again changes nothing"
       (let [before [(field-copies workspace-id) (owned-fields workspace-id table-id)]]
         (record! workspace-id db-id table-id changed-columns)
         (is (= before [(field-copies workspace-id) (owned-fields workspace-id table-id)]))))
     (testing "a copy back in the canonical shape deletes the rows and the Fields the workspace owns"
       (record! workspace-id db-id table-id canonical-columns)
       (is (= {} (field-copies workspace-id)))
       (is (= {} (owned-fields workspace-id table-id)))))))

(deftest recording-a-copy-drops-old-field-values-test
  (do-with-orders!
   (fn [{:keys [workspace-id db-id table-id field-ids]}]
     (t2/insert! :model/FieldValues {:field_id (field-ids "id") :type :advanced :hash_key "workspace-values"
                                     :values [1 2]})
     (testing "a new copy has new values, so the values read from the old copy go"
       (record! workspace-id db-id table-id changed-columns)
       (is (not (t2/exists? :model/FieldValues :field_id (field-ids "id") :type :advanced)))))))

(deftest a-shared-twin-of-a-workspace-field-is-hidden-test
  (do-with-orders!
   (fn [{:keys [workspace-id db-id table-id]}]
     (record! workspace-id db-id table-id (conj canonical-columns (column "total" :type/Float "float8" 3)))
     (testing "a sync in production adds the column the workspace already owns"
       (t2/insert! :model/Field {:table_id table-id :name "total" :base_type :type/Decimal :database_type "numeric"
                                 :database_position 3}))
     (testing "once the workspace is read again, it sees one Field for it, its own"
       (ws.request-workspace/invalidate!)
       (ws.request-workspace/request-workspace workspace-id)
       (workspaces/with-workspace-id workspace-id
         (is (= [:type/Float] (t2/select-fn-vec :base_type :model/Field :table_id table-id :name "total")))))
     (testing "no workspace sees the shared one"
       (is (= [:type/Decimal] (t2/select-fn-vec :base_type :model/Field :table_id table-id :name "total")))))))

(defn- copy-provider [workspace-id db-id]
  (ws.copy-metadata/copy-metadata-provider (lib-be/application-database-metadata-provider db-id) workspace-id db-id))

(deftest copy-metadata-provider-test
  (do-with-orders!
   (fn [{:keys [workspace-id db-id table-id field-ids]}]
     (workspaces/with-workspace-id workspace-id
       (testing "a workspace with no type rows has no provider of its own"
         (is (nil? (copy-provider workspace-id db-id)))))
     (record! workspace-id db-id table-id changed-columns)
     (workspaces/with-workspace-id workspace-id
       (let [mp (copy-provider workspace-id db-id)]
         (testing "the fields of a table are those of the copy"
           (is (= #{"id" "created" "total"} (into #{} (map :name) (lib.metadata/fields mp table-id)))))
         (testing "a column the copy gives another base type has that type, without the shared coercion"
           (is (=? {:base-type :type/DateTime :effective-type :type/DateTime :coercion-strategy nil
                    :database-type "timestamp"}
                   (lib.metadata/field mp (field-ids "created")))))
         (testing "a column the copy lacks is not there, even by id"
           (is (empty? (lib.metadata.protocols/metadatas mp {:lib/type :metadata/column :id #{(field-ids "name")}}))))))
     (testing "the shared metadata does not change"
       (is (= #{"id" "name" "first" "created"}
              (into #{} (map :name) (lib.metadata/fields (lib-be/application-database-metadata-provider db-id)
                                                         table-id))))))))

(deftest query-metadata-test
  (do-with-orders!
   (fn [{:keys [workspace-id db-id table-id field-ids]}]
     (record! workspace-id db-id table-id changed-columns)
     (let [path    (format "table/%d/query_metadata" table-id)
           headers {:request-options {:headers {"x-metabase-workspace-id" (str workspace-id)}}}]
       (testing "without the header, the shared fields"
         (is (= #{"id" "name" "first" "created"}
                (set (map :name (:fields (mt/user-http-request :crowberto :get 200 path)))))))
       (testing "in the workspace, the copy's fields"
         (let [fields (:fields (mt/user-http-request :crowberto :get 200 path headers))]
           (is (= ["id" "created" "total"] (map :name fields)))
           (is (=? {:id (field-ids "created") :base_type "type/DateTime" :coercion_strategy nil}
                   (second fields)))))
       (testing "a retired column the workspace owns stays out"
         (workspaces/with-workspace-id workspace-id
           (t2/update! :model/Field {:table_id table-id :name "total"} {:visibility_type :retired}))
         (is (= ["id" "created"]
                (map :name (:fields (mt/user-http-request :crowberto :get 200 path headers))))))))))

(deftest deprovisioned-database-loses-its-copy-rows-test
  (do-with-orders!
   (fn [{:keys [workspace-id db-id table-id]}]
     (record! workspace-id db-id table-id changed-columns)
     (let [owned-table (workspaces/with-workspace-id workspace-id
                         (t2/insert-returning-pk! :model/Table {:db_id db-id :schema "public" :name "only_ws"
                                                                :active true}))]
       (is (t2/exists? :model/WorkspaceFieldCopy :workspace_id workspace-id))
       (testing "the copies were in the isolation schema that a deprovision drops, so their rows go with it"
         (ws.db/delete-copies-of-database! workspace-id db-id)
         (is (not (t2/exists? :model/WorkspaceFieldCopy :workspace_id workspace-id)))
         (is (= {} (owned-fields workspace-id table-id)))
         (is (not (mdb/with-workspace-id :all (t2/exists? :model/Table :id owned-table)))))))))
