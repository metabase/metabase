(ns metabase.sync.metadata-sync.document-test
  (:require
   [clojure.set :as set]
   [clojure.test :refer :all]
   [metabase.serialization.core :as serialization]
   [metabase.sync.db :as sync.db]
   [metabase.sync.metadata-sync.document :as document]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util.malli.registry :as mr]))

(use-fixtures :once (fixtures/initialize :db))

(defn- documents
  "The documents of the Database with `db-id`, by `[schema name]`."
  ([db-id]
   (documents db-id nil))
  ([db-id schema-filter]
   (into {}
         (map (juxt (juxt :schema :name) identity))
         (document/table-documents (document/described-tables db-id schema-filter)))))

(defn- field-named [table-document field-name]
  (some #(when (= [field-name] (:path %)) %) (:fields table-document)))

(deftest table-document-shape-test
  (mt/with-temp [:model/Database {db-id :id}    {}
                 :model/Table    {table-id :id} {:db_id db-id :schema "public" :name "orders" :description "All orders"}
                 :model/Field    _              {:table_id          table-id
                                                 :name              "total"
                                                 :base_type         :type/Decimal
                                                 :database_type     "NUMERIC"
                                                 :semantic_type     :type/Currency
                                                 :database_position 1
                                                 :position          1
                                                 :fingerprint       {:global {:distinct-count 10}}
                                                 :last_analyzed     #t "2026-01-01T00:00:00Z"}]
    (let [doc   (get (documents db-id) ["public" "orders"])
          field (field-named doc "total")]
      (testing "a table is its schema, its name and its columns"
        (is (=? {:schema "public" :name "orders" :description "All orders"} doc)))
      (testing "a field is a name path and its columns, with types as strings"
        (is (=? {:path          ["total"]
                 :base_type     "type/Decimal"
                 :database_type "NUMERIC"
                 :semantic_type "type/Currency"
                 :fingerprint   {:global {:distinct-count 10}}
                 :last_analyzed string?}
                field)))
      (testing "nothing that belongs to one instance is in the document"
        (is (empty? (set/intersection #{:id :db_id :table_id :created_at :updated_at :entity_id :parent_id
                                        :fk_target_field_id :is_published :collection_id :owner_user_id}
                                      (set (concat (keys doc) (keys field)))))))
      (testing "the document is valid"
        (is (mr/validate ::document/table doc))))))

(deftest rows-that-are-left-out-test
  (mt/with-temp [:model/Database {db-id :id}    {}
                 :model/Table    {live :id}     {:db_id db-id :schema "public" :name "live"}
                 :model/Table    {inactive :id} {:db_id db-id :schema "public" :name "gone" :active false}
                 :model/Table    {scratch :id}  {:db_id db-id :schema "mb__isolation_abc" :name "public__live"}
                 :model/Field    _              {:table_id live :name "kept" :base_type :type/Text}
                 :model/Field    _              {:table_id live :name "dropped" :base_type :type/Text :active false}
                 :model/Field    _              {:table_id live :name "old" :base_type :type/Text
                                                 :visibility_type :retired}
                 :model/Field    _              {:table_id inactive :name "still_active" :base_type :type/Text}
                 :model/Field    _              {:table_id scratch :name "kept" :base_type :type/Text}]
    (let [docs (documents db-id)]
      (testing "an inactive table is left out, also when its fields are active"
        (is (not (contains? docs ["public" "gone"]))))
      (testing "a table in a workspace scratch schema is left out"
        (is (= #{["public" "live"]} (set (keys docs)))))
      (testing "inactive and retired fields are left out"
        (is (= [["kept"]] (mapv :path (:fields (get docs ["public" "live"])))))))))

(deftest nested-fields-test
  (mt/with-temp [:model/Database {db-id :id}    {}
                 :model/Table    {table-id :id} {:db_id db-id :schema "public" :name "events"}
                 :model/Field    _              {:table_id table-id :name "payload → kind" :base_type :type/Text
                                                 :nfc_path ["payload" "kind"]}
                 :model/Field    {parent :id}   {:table_id table-id :name "address" :base_type :type/Dictionary}
                 :model/Field    _              {:table_id table-id :name "city" :base_type :type/Text
                                                 :parent_id parent}]
    (let [doc (get (documents db-id) ["public" "events"])]
      (testing "an unfolded JSON field is carried with its nfc_path"
        (is (= ["payload" "kind"] (:nfc_path (field-named doc "payload → kind")))))
      (testing "a nested field is not carried"
        (is (= #{["payload → kind"] ["address"]} (set (map :path (:fields doc)))))))))

(deftest schema-filter-test
  (mt/with-temp [:model/Database {db-id :id} {}
                 :model/Table    _           {:db_id db-id :schema "sales" :name "orders"}
                 :model/Table    _           {:db_id db-id :schema "finance" :name "ledger"}
                 :model/Table    _           {:db_id db-id :schema nil :name "loose"}]
    (testing "no filter gives every schema"
      (is (= #{["sales" "orders"] ["finance" "ledger"] [nil "loose"]}
             (set (keys (documents db-id))))))
    (testing "an inclusion filter"
      (is (= #{["sales" "orders"]}
             (set (keys (documents db-id {:type "inclusion" :patterns "sales"}))))))
    (testing "an exclusion filter"
      (is (= #{["finance" "ledger"] [nil "loose"]}
             (set (keys (documents db-id {:type "exclusion" :patterns "sal*"}))))))))

(deftest documents-of-some-tables-test
  (mt/with-temp [:model/Database {db-id :id}  {}
                 :model/Table    {orders :id} {:db_id db-id :schema "sales" :name "orders"}
                 :model/Field    _            {:table_id orders :name "id" :base_type :type/Integer}
                 :model/Table    _            {:db_id db-id :schema "sales" :name "people"}]
    (let [tables (document/described-tables db-id nil)]
      (testing "the described tables of a database are its tables that a document describes, in key order"
        (is (= [["sales" "orders"] ["sales" "people"]]
               (map (juxt :schema :name) tables))))
      (testing "documents can be built for some of them only, and are the same as for the whole database"
        (is (= [(get (documents db-id) ["sales" "orders"])]
               (document/table-documents (filterv #(= orders (:id %)) tables))))))))

(deftest ^:parallel every-serialized-column-is-carried-or-left-out-test
  (testing "a column that serialization copies is in the document, or is left out with a reason"
    (doseq [[model carried left-out] [[:model/Field document/field-columns document/left-out-field-columns]
                                      [:model/Table document/table-columns document/left-out-table-columns]]]
      (testing model
        (is (= #{}
               (set/difference (set (:copy (serialization/spec model)))
                               (set carried)
                               (set (keys left-out))))))))
  (testing "no column is both carried and left out"
    (is (= #{} (set/intersection (set document/field-columns) (set (keys document/left-out-field-columns)))))
    (is (= #{} (set/intersection (set document/table-columns) (set (keys document/left-out-table-columns)))))))

(deftest ^:parallel database-document-test
  (testing "a Database's document holds its dbms version and timezone, and not its default schema or anything else"
    (is (= {:dbms_version {:flavor "H2"} :timezone "UTC"}
           (document/database-document {:id 1 :name "db" :engine :h2 :default_schema "PUBLIC"
                                        :dbms_version {:flavor "H2"} :timezone "UTC"}))))
  (testing "a value it does not have is left out"
    (is (= {} (document/database-document {:dbms_version nil :timezone nil})))))

(deftest same-content-gives-the-same-document-on-two-databases-test
  (mt/with-temp [:model/Database {db-1 :id} {}
                 :model/Database {db-2 :id} {}
                 :model/Table    {t-1 :id}  {:db_id db-1 :schema "public" :name "orders"}
                 :model/Table    {t-2 :id}  {:db_id db-2 :schema "public" :name "orders"}
                 :model/Field    _          {:table_id t-1 :name "id" :base_type :type/Integer :database_type "INT4"}
                 :model/Field    _          {:table_id t-2 :name "id" :base_type :type/Integer :database_type "INT4"}]
    (is (= (get (documents db-1) ["public" "orders"])
           (get (documents db-2) ["public" "orders"])))))

(deftest many-tables-are-read-in-batches-test
  (mt/with-temp [:model/Database {db-id :id} {}
                 :model/Table    {t-1 :id}   {:db_id db-id :schema "public" :name "bluebird"}
                 :model/Table    {t-2 :id}   {:db_id db-id :schema "public" :name "cardinal"}
                 :model/Table    {t-3 :id}   {:db_id db-id :schema "public" :name "dunlin"}
                 :model/Field    _           {:table_id t-1 :name "id" :base_type :type/Integer}
                 :model/Field    _           {:table_id t-2 :name "id" :base_type :type/Integer}
                 :model/Field    _           {:table_id t-3 :name "id" :base_type :type/Integer}]
    (let [expected (documents db-id)
          id-lists (atom [])
          query    (mt/original-fn #'sync.db/described-fields)]
      (mt/with-dynamic-fn-redefs [sync.db/described-fields (fn [table-ids]
                                                             (swap! id-lists conj table-ids)
                                                             (query table-ids))]
        (with-redefs [document/query-batch-size 2]
          (testing "the documents are the same as with one query for all Tables"
            (is (= expected (documents db-id))))
          (testing "the Fields are read once per batch, with no more Table ids than the batch size"
            (is (= [1 2] (sort (map count @id-lists))))))))))

(deftest row-count-is-not-in-the-document-test
  (mt/with-temp [:model/Database {db-id :id}  {}
                 :model/Table    {orders :id} {:db_id db-id :name "orders" :estimated_row_count 10}
                 :model/Field    _            {:table_id orders :name "id" :base_type :type/Integer}]
    (testing "the row count is not in a Table's document: it is in its stats"
      (is (not (contains? (first (document/table-documents (document/described-tables db-id nil)))
                          :estimated_row_count))))))
