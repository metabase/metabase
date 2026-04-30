(ns metabase-enterprise.workspaces.table-metadata-test
  (:require
   [clojure.test :refer [deftest is testing use-fixtures]]
   [medley.core :as m]
   [metabase-enterprise.workspaces.table-metadata :as ws.table-metadata]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util.json :as json]))

(use-fixtures :once (fixtures/initialize :db))

(defn- run-table-metadata
  "Stream `write-table-metadata!` for `db-id->schemas` and parse the JSON result."
  [db-id->schemas]
  (let [baos (java.io.ByteArrayOutputStream.)]
    (ws.table-metadata/write-table-metadata! baos db-id->schemas)
    (json/decode+kw (.toString baos "UTF-8"))))

(defn- run-field-values
  [db-id->schemas]
  (let [baos (java.io.ByteArrayOutputStream.)]
    (ws.table-metadata/write-field-values! baos db-id->schemas)
    (json/decode+kw (.toString baos "UTF-8"))))

(deftest write-table-metadata-shape-test
  (testing "Output document has the expected top-level shape and the database/table/field rows are emitted"
    (mt/with-temp [:model/Database {db-id :id} {:name "tm-db" :engine :h2}
                   :model/Table    {t-id :id}  {:db_id db-id :name "orders" :schema "PUBLIC"
                                                :description "test table"}
                   :model/Field    {f1-id :id} {:table_id t-id :name "id" :base_type :type/Integer
                                                :database_type "BIGINT" :semantic_type :type/PK}
                   :model/Field    {f2-id :id} {:table_id t-id :name "created_at" :base_type :type/Text
                                                :database_type "TIMESTAMP"
                                                :effective_type :type/DateTime
                                                :coercion_strategy :Coercion/ISO8601->DateTime
                                                :description "creation time"}
                   :model/Field    {f3-id :id} {:table_id t-id :name "parent_id" :base_type :type/Integer
                                                :database_type "BIGINT" :semantic_type :type/FK
                                                :fk_target_field_id f1-id}]
      (let [{:keys [databases tables fields]} (run-table-metadata {db-id #{"PUBLIC"}})]
        (is (= #{:databases :tables :fields}
               (set (keys (run-table-metadata {db-id #{"PUBLIC"}})))))
        (is (=? {:id db-id :name "tm-db" :engine "h2"}
                (m/find-first (comp #{db-id} :id) databases)))
        (is (=? {:id t-id :db_id db-id :name "orders" :schema "PUBLIC" :description "test table"}
                (m/find-first (comp #{t-id} :id) tables)))
        (testing "id field"
          (is (=? {:id f1-id :name "id" :base_type "type/Integer" :database_type "BIGINT"
                   :semantic_type "type/PK"}
                  (m/find-first (comp #{f1-id} :id) fields))))
        (testing "coerced field — effective_type and coercion_strategy emitted"
          (is (=? {:id f2-id :name "created_at" :base_type "type/Text"
                   :database_type "TIMESTAMP"
                   :effective_type "type/DateTime"
                   :coercion_strategy "Coercion/ISO8601->DateTime"
                   :description "creation time"}
                  (m/find-first (comp #{f2-id} :id) fields))))
        (testing "fk field — fk_target_field_id emitted"
          (is (=? {:id f3-id :name "parent_id" :semantic_type "type/FK"
                   :fk_target_field_id f1-id}
                  (m/find-first (comp #{f3-id} :id) fields))))))))

(deftest write-table-metadata-schema-filter-test
  (testing "Tables and fields outside the per-database schema set are dropped"
    (mt/with-temp [:model/Database {db-id :id}      {:name "schema-db" :engine :h2}
                   :model/Table    {keep-t :id}     {:db_id db-id :name "kept" :schema "PUBLIC"}
                   :model/Field    _                {:table_id keep-t :name "x" :base_type :type/Integer
                                                     :database_type "BIGINT"}
                   :model/Table    {drop-t :id}     {:db_id db-id :name "skipped" :schema "OTHER"}
                   :model/Field    {drop-f :id}     {:table_id drop-t :name "y" :base_type :type/Integer
                                                     :database_type "BIGINT"}]
      (let [{:keys [tables fields]} (run-table-metadata {db-id #{"PUBLIC"}})]
        (is (some? (m/find-first (comp #{keep-t} :id) tables)))
        (is (nil?  (m/find-first (comp #{drop-t} :id) tables))
            "tables in schemas not listed for this DB are excluded")
        (is (nil?  (m/find-first (comp #{drop-f} :id) fields))
            "fields whose parent table was excluded are excluded")))))

(deftest write-table-metadata-multi-db-test
  (testing "Each database in db-id->schemas can have its own schema set"
    (mt/with-temp [:model/Database {db1-id :id}    {:name "multi-a" :engine :h2}
                   :model/Database {db2-id :id}    {:name "multi-b" :engine :h2}
                   :model/Table    {db1-t1 :id}    {:db_id db1-id :name "t1" :schema "S1"}
                   :model/Table    {db1-t2 :id}    {:db_id db1-id :name "t2" :schema "S2"}
                   :model/Table    {db2-t :id}     {:db_id db2-id :name "t" :schema "PUBLIC"}]
      (let [{:keys [databases tables]} (run-table-metadata {db1-id #{"S1"}
                                                            db2-id #{"PUBLIC"}})]
        (is (= #{db1-id db2-id} (into #{} (map :id) databases)))
        (is (some? (m/find-first (comp #{db1-t1} :id) tables)))
        (is (nil?  (m/find-first (comp #{db1-t2} :id) tables))
            "db1's S2 schema is not listed and its tables are excluded")
        (is (some? (m/find-first (comp #{db2-t} :id) tables)))))))

(deftest write-table-metadata-excludes-audit-and-routing-test
  (testing "Audit and routing/destination databases are excluded even if explicitly listed"
    (mt/with-temp [:model/Database {host-id :id}   {:name "host-db" :engine :h2}
                   :model/Database {audit-id :id}  {:name "audit-db" :engine :h2 :is_audit true}
                   :model/Database {routed-id :id} {:name "routed-db" :engine :h2
                                                    :router_database_id host-id}
                   :model/Table    {audit-t :id}   {:db_id audit-id :name "at" :schema "PUBLIC"}
                   :model/Table    {routed-t :id}  {:db_id routed-id :name "rt" :schema "PUBLIC"}]
      (let [{:keys [databases tables fields]}
            (run-table-metadata {audit-id  #{"PUBLIC"}
                                 routed-id #{"PUBLIC"}})]
        (is (= [] databases))
        (is (nil? (m/find-first (comp #{audit-t}  :id) tables)))
        (is (nil? (m/find-first (comp #{routed-t} :id) tables)))
        (is (= [] fields))))))

(deftest write-table-metadata-excludes-inactive-and-hidden-test
  (testing "Inactive tables, hidden tables, inactive fields, and sensitive fields are dropped"
    (mt/with-temp [:model/Database {db-id :id}     {:name "filt-db" :engine :h2}
                   :model/Table    {keep-t :id}    {:db_id db-id :name "keep-t" :schema "PUBLIC"}
                   :model/Table    {hidden-t :id}  {:db_id db-id :name "hidden-t" :schema "PUBLIC"
                                                    :visibility_type "hidden"}
                   :model/Table    {inactive-t :id} {:db_id db-id :name "inactive-t" :schema "PUBLIC"
                                                     :active false}
                   :model/Field    {keep-f :id}    {:table_id keep-t :name "k" :base_type :type/Integer
                                                    :database_type "BIGINT"}
                   :model/Field    {sens-f :id}    {:table_id keep-t :name "s" :base_type :type/Text
                                                    :database_type "VARCHAR"
                                                    :visibility_type :sensitive}
                   :model/Field    {inact-f :id}   {:table_id keep-t :name "i" :base_type :type/Integer
                                                    :database_type "BIGINT" :active false}]
      (let [{:keys [tables fields]} (run-table-metadata {db-id #{"PUBLIC"}})]
        (is (some? (m/find-first (comp #{keep-t} :id) tables)))
        (is (nil?  (m/find-first (comp #{hidden-t}   :id) tables)))
        (is (nil?  (m/find-first (comp #{inactive-t} :id) tables)))
        (is (some? (m/find-first (comp #{keep-f} :id) fields)))
        (is (nil?  (m/find-first (comp #{sens-f}  :id) fields)))
        (is (nil?  (m/find-first (comp #{inact-f} :id) fields)))))))

(deftest write-table-metadata-empty-input-test
  (testing "An empty db-id->schemas map produces an empty document"
    (is (= {:databases [] :tables [] :fields []}
           (run-table-metadata {})))))

(deftest write-field-values-shape-test
  (testing "Output shape and basic field-values rows"
    (mt/with-temp [:model/Database    {db-id :id} {:name "fv-db" :engine :h2}
                   :model/Table       {t-id :id}  {:db_id db-id :name "people" :schema "PUBLIC"}
                   :model/Field       {f1-id :id} {:table_id t-id :name "state" :base_type :type/Text
                                                   :database_type "VARCHAR"}
                   :model/Field       {f2-id :id} {:table_id t-id :name "rating" :base_type :type/Integer
                                                   :database_type "INTEGER"}
                   :model/FieldValues _           {:field_id f1-id :type :full
                                                   :values [["CA"] ["NY"] ["TX"]]
                                                   :has_more_values false}
                   :model/FieldValues _           {:field_id f2-id :type :full
                                                   :values [[1] [2] [3]]
                                                   :human_readable_values ["Low" "Mid" "High"]
                                                   :has_more_values true}]
      (let [{:keys [field_values]} (run-field-values {db-id #{"PUBLIC"}})
            by-field                (into {} (map (juxt :field_id identity)) field_values)]
        (is (=? {:field_id f1-id :values [["CA"] ["NY"] ["TX"]] :has_more_values false}
                (by-field f1-id)))
        (is (nil? (:human_readable_values (by-field f1-id)))
            "human_readable_values is omitted when empty")
        (is (=? {:field_id              f2-id
                 :values                [[1] [2] [3]]
                 :human_readable_values ["Low" "Mid" "High"]
                 :has_more_values       true}
                (by-field f2-id)))))))

(deftest write-field-values-only-full-test
  (testing "Only :full FieldValues are streamed; sandbox/linked variants are excluded"
    (mt/with-temp [:model/Database    {db-id :id} {:name "fv-only-db" :engine :h2}
                   :model/Table       {t-id :id}  {:db_id db-id :name "t" :schema "PUBLIC"}
                   :model/Field       {f-id :id}  {:table_id t-id :name "x" :base_type :type/Text
                                                   :database_type "VARCHAR"}
                   :model/FieldValues _           {:field_id f-id :type :full
                                                   :values [["CA"]] :has_more_values false}
                   :model/FieldValues _           {:field_id f-id :type :sandbox
                                                   :hash_key "h" :values [["NY"]]
                                                   :has_more_values false}]
      (let [{:keys [field_values]} (run-field-values {db-id #{"PUBLIC"}})
            for-field               (filter #(= f-id (:field_id %)) field_values)]
        (is (= 1 (count for-field)))
        (is (= [["CA"]] (-> for-field first :values)))))))

(deftest write-field-values-schema-filter-test
  (testing "Schema filter applied to field values: values for tables outside the schema set are dropped"
    (mt/with-temp [:model/Database    {db-id :id}  {:name "fv-schema-db" :engine :h2}
                   :model/Table       {keep-t :id} {:db_id db-id :name "kept" :schema "PUBLIC"}
                   :model/Table       {drop-t :id} {:db_id db-id :name "skipped" :schema "OTHER"}
                   :model/Field       {keep-f :id} {:table_id keep-t :name "k" :base_type :type/Text
                                                    :database_type "VARCHAR"}
                   :model/Field       {drop-f :id} {:table_id drop-t :name "d" :base_type :type/Text
                                                    :database_type "VARCHAR"}
                   :model/FieldValues _            {:field_id keep-f :type :full
                                                    :values [["a"]] :has_more_values false}
                   :model/FieldValues _            {:field_id drop-f :type :full
                                                    :values [["b"]] :has_more_values false}]
      (let [{:keys [field_values]} (run-field-values {db-id #{"PUBLIC"}})
            ids                     (into #{} (map :field_id) field_values)]
        (is (contains? ids keep-f))
        (is (not (contains? ids drop-f)))))))

(deftest write-field-values-empty-input-test
  (testing "An empty db-id->schemas map produces an empty {field_values: []} document"
    (is (= {:field_values []}
           (run-field-values {})))))
