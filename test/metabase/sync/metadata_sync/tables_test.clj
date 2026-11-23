(ns metabase.sync.metadata-sync.tables-test
  (:require
   [clojure.set :as set]
   [clojure.test :refer :all]
   [metabase.serialization.core :as serialization]
   [metabase.sync.db :as sync.db]
   [metabase.sync.metadata-sync.pages :as pages]
   [metabase.sync.metadata-sync.tables :as tables]
   [metabase.sync.metadata-sync.wire :as wire]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util.malli.registry :as mr]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db))

(defn- entries
  "The entries of the Database with `db-id`, by `[schema name]`."
  ([db-id]
   (entries db-id nil))
  ([db-id schema-filter]
   (into {}
         (map (juxt (juxt :schema :name) identity))
         (tables/entries (tables/selection db-id schema-filter)))))

(defn- field-named [table-entry field-name]
  (some #(when (= [field-name] (:path %)) %) (:fields table-entry)))

(deftest table-entry-shape-test
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
    (let [doc   (get (entries db-id) ["public" "orders"])
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
      (testing "nothing that belongs to one instance is in the entry"
        (is (empty? (set/intersection #{:id :db_id :table_id :created_at :updated_at :entity_id :parent_id
                                        :fk_target_field_id :is_published :collection_id :owner_user_id}
                                      (set (concat (keys doc) (keys field)))))))
      (testing "the entry is valid"
        (is (mr/validate ::tables/table doc))))))

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
    (let [entries-by-key (entries db-id)]
      (testing "an inactive table is left out, also when its fields are active"
        (is (not (contains? entries-by-key ["public" "gone"]))))
      (testing "a table in a workspace scratch schema is left out"
        (is (= #{["public" "live"]} (set (keys entries-by-key)))))
      (testing "inactive and retired fields are left out"
        (is (= [["kept"]] (mapv :path (:fields (get entries-by-key ["public" "live"])))))))))

(deftest nested-fields-test
  (mt/with-temp [:model/Database {db-id :id}    {}
                 :model/Table    {table-id :id} {:db_id db-id :schema "public" :name "events"}
                 :model/Field    _              {:table_id table-id :name "payload → kind" :base_type :type/Text
                                                 :nfc_path ["payload" "kind"]}
                 :model/Field    {parent :id}   {:table_id table-id :name "address" :base_type :type/Dictionary}
                 :model/Field    {city :id}     {:table_id table-id :name "city" :base_type :type/Dictionary
                                                 :parent_id parent}
                 :model/Field    _              {:table_id table-id :name "zip" :base_type :type/Text
                                                 :parent_id city}
                 :model/Field    {old :id}      {:table_id table-id :name "old" :base_type :type/Dictionary
                                                 :visibility_type :retired}
                 :model/Field    _              {:table_id table-id :name "child_of_old" :base_type :type/Text
                                                 :parent_id old}]
    (let [doc   (get (entries db-id) ["public" "events"])
          paths (map :path (:fields doc))]
      (testing "an unfolded JSON field is carried with its nfc_path"
        (is (= ["payload" "kind"] (:nfc_path (field-named doc "payload → kind")))))
      (testing "a nested field is carried with the names of its parents first in its path"
        (is (= #{["payload → kind"] ["address"] ["address" "city"] ["address" "city" "zip"]} (set paths))))
      (testing "a parent comes before its children"
        (is (= [["address"] ["address" "city"] ["address" "city" "zip"]]
               (filter #(= "address" (first %)) paths))))
      (testing "a field whose parent is not sent is not sent"
        (is (not-any? #(= "child_of_old" (last %)) paths))))))

(deftest nested-fields-weigh-in-the-field-counts-test
  (mt/with-temp [:model/Database {db-id :id}    {}
                 :model/Table    {table-id :id} {:db_id db-id :schema "public" :name "events"}
                 :model/Field    {parent :id}   {:table_id table-id :name "address" :base_type :type/Dictionary}
                 :model/Field    _              {:table_id table-id :name "city" :base_type :type/Text
                                                 :parent_id parent}]
    (is (= [{:table_id table-id :field_count 2}] (sync.db/described-field-counts db-id)))))

(deftest schema-filter-test
  (mt/with-temp [:model/Database {db-id :id} {}
                 :model/Table    _           {:db_id db-id :schema "sales" :name "orders"}
                 :model/Table    _           {:db_id db-id :schema "finance" :name "ledger"}
                 :model/Table    _           {:db_id db-id :schema nil :name "loose"}]
    (testing "no filter gives every schema"
      (is (= #{["sales" "orders"] ["finance" "ledger"] [nil "loose"]}
             (set (keys (entries db-id))))))
    (testing "an inclusion filter"
      (is (= #{["sales" "orders"]}
             (set (keys (entries db-id {:type "inclusion" :patterns "sales"}))))))
    (testing "an exclusion filter"
      (is (= #{["finance" "ledger"] [nil "loose"]}
             (set (keys (entries db-id {:type "exclusion" :patterns "sal*"}))))))))

(deftest entries-of-some-tables-test
  (mt/with-temp [:model/Database {db-id :id}  {}
                 :model/Table    {orders :id} {:db_id db-id :schema "sales" :name "orders"}
                 :model/Field    _            {:table_id orders :name "id" :base_type :type/Integer}
                 :model/Table    _            {:db_id db-id :schema "sales" :name "people"}]
    (let [tables (tables/selection db-id nil)]
      (testing "the selection of a database is its tables that are sent, in key order"
        (is (= [["sales" "orders"] ["sales" "people"]]
               (map (juxt :schema :name) tables))))
      (testing "entries can be built for some of them only, and are the same as for the whole database"
        (is (= [(get (entries db-id) ["sales" "orders"])]
               (tables/entries (filterv #(= orders (:id %)) tables))))))))

(deftest ^:parallel every-serialized-column-is-carried-or-left-out-test
  (testing "a column that serialization copies is in the entry, or is left out with a reason"
    (doseq [[model carried left-out] [[:model/Field tables/field-columns tables/left-out-field-columns]
                                      [:model/Table tables/table-columns tables/left-out-table-columns]]]
      (testing model
        (is (= #{}
               (set/difference (set (:copy (serialization/spec model)))
                               (set carried)
                               (set (keys left-out))))))))
  (testing "no column is both carried and left out"
    (is (= #{} (set/intersection (set tables/field-columns) (set (keys tables/left-out-field-columns)))))
    (is (= #{} (set/intersection (set tables/table-columns) (set (keys tables/left-out-table-columns)))))))

(deftest ^:parallel database-values-test
  (testing "a Database's values hold its dbms version and timezone, and not its default schema or anything else"
    (is (= {:dbms_version {:flavor "H2"} :timezone "UTC"}
           (wire/database-values {:id 1 :name "db" :engine :h2 :default_schema "PUBLIC"
                                  :dbms_version {:flavor "H2"} :timezone "UTC"}))))
  (testing "a value it does not have is left out"
    (is (= {} (wire/database-values {:dbms_version nil :timezone nil})))))

(deftest same-content-gives-the-same-entry-on-two-databases-test
  (mt/with-temp [:model/Database {db-1 :id} {}
                 :model/Database {db-2 :id} {}
                 :model/Table    {t-1 :id}  {:db_id db-1 :schema "public" :name "orders"}
                 :model/Table    {t-2 :id}  {:db_id db-2 :schema "public" :name "orders"}
                 :model/Field    _          {:table_id t-1 :name "id" :base_type :type/Integer :database_type "INT4"}
                 :model/Field    _          {:table_id t-2 :name "id" :base_type :type/Integer :database_type "INT4"}]
    (is (= (get (entries db-1) ["public" "orders"])
           (get (entries db-2) ["public" "orders"])))))

(deftest many-tables-are-read-in-batches-test
  (mt/with-temp [:model/Database {db-id :id} {}
                 :model/Table    {t-1 :id}   {:db_id db-id :schema "public" :name "bluebird"}
                 :model/Table    {t-2 :id}   {:db_id db-id :schema "public" :name "cardinal"}
                 :model/Table    {t-3 :id}   {:db_id db-id :schema "public" :name "dunlin"}
                 :model/Field    _           {:table_id t-1 :name "id" :base_type :type/Integer}
                 :model/Field    _           {:table_id t-2 :name "id" :base_type :type/Integer}
                 :model/Field    _           {:table_id t-3 :name "id" :base_type :type/Integer}]
    (let [expected (entries db-id)
          id-lists (atom [])
          query    (mt/original-fn #'sync.db/described-fields)]
      (mt/with-dynamic-fn-redefs [sync.db/described-fields (fn [table-ids]
                                                             (swap! id-lists conj table-ids)
                                                             (query table-ids))]
        (with-redefs [pages/query-batch-size 2]
          (testing "the entries are the same as with one query for all Tables"
            (is (= expected (entries db-id))))
          (testing "the Fields are read once per batch, with no more Table ids than the batch size"
            (is (= [1 2] (sort (map count @id-lists))))))))))

(deftest row-count-is-not-in-the-entry-test
  (mt/with-temp [:model/Database {db-id :id}  {}
                 :model/Table    {orders :id} {:db_id db-id :name "orders" :estimated_row_count 10}
                 :model/Field    _            {:table_id orders :name "id" :base_type :type/Integer}]
    (testing "the row count is not in a Table's entry: it is in its stats"
      (is (not (contains? (first (tables/entries (tables/selection db-id nil)))
                          :estimated_row_count))))))

(deftest defective-duplicate-fields-are-not-sent-test
  (mt/with-temp [:model/Database {db-id :id}    {}
                 :model/Table    {table-id :id} {:db_id db-id :schema "public" :name "wrens"}
                 :model/Field    _              {:table_id table-id :name "song" :base_type :type/Text}
                 :model/Field    {twin :id}     {:table_id table-id :name "song_twin" :base_type :type/Text}]
    ;; a legacy duplicate has the name of another Field; H2's unique index refuses that, so only the flag is set here
    (t2/query-one {:update :metabase_field :set {:is_defective_duplicate true} :where [:= :id twin]})
    (testing "a Field marked as a defective duplicate is not sent, so a path is sent once"
      (is (= [["song"]] (mapv :path (:fields (get (entries db-id) ["public" "wrens"]))))))
    (testing "and it does not weigh in the Field counts"
      (is (= [{:table_id table-id :field_count 1}] (sync.db/described-field-counts db-id))))))

(deftest table-columns-of-the-sender-are-not-sent-test
  (mt/with-temp [:model/Database {db-id :id} {}
                 :model/Table    _           {:db_id db-id :schema "public" :name "finches" :data_source :ingested
                                              :is_writable true}
                 :model/Table    _           {:db_id db-id :schema "public" :name "gulls" :data_source :upload}
                 :model/Table    _           {:db_id db-id :schema "public" :name "herons"
                                              :data_source :metabase-transform}]
    (let [entries-by-key (entries db-id)]
      (testing "a data source that says what the data is, is sent"
        (is (= "ingested" (:data_source (entries-by-key ["public" "finches"])))))
      (testing "a data source that says how this instance made the Table is not sent"
        (is (not (contains? (entries-by-key ["public" "gulls"]) :data_source)))
        (is (not (contains? (entries-by-key ["public" "herons"]) :data_source))))
      (testing "whether the sender's login can write the Table is not sent"
        (is (not-any? #(contains? % :is_writable) (vals entries-by-key))))
      (testing "the entries are valid"
        (is (every? #(mr/validate ::tables/table %) (vals entries-by-key)))))))

(deftest user-set-columns-are-named-test
  (mt/with-temp [:model/Database {db-id :id}  {}
                 :model/Table    {wrens :id}  {:db_id db-id :schema "public" :name "wrens" :description "Small birds"}
                 :model/Table    {gulls :id}  {:db_id db-id :schema "public" :name "gulls" :data_source :upload}
                 :model/Table    _            {:db_id db-id :schema "public" :name "owls"}
                 :model/Field    {song :id}   {:table_id wrens :name "song" :base_type :type/Text
                                               :description "What it sings" :semantic_type :type/Category}
                 :model/Field    _            {:table_id wrens :name "nest" :base_type :type/Text}]
    (t2/insert! :model/TableUserSettings {:table_id wrens :description "Small birds"})
    (t2/insert! :model/TableUserSettings {:table_id gulls :data_source :upload})
    (t2/insert! :model/FieldUserSettings {:field_id song :description "What it sings" :semantic_type :type/Category})
    (let [entries-by-key (entries db-id)
          wrens-entry    (entries-by-key ["public" "wrens"])]
      (testing "a Table names the columns a user set, of the ones sync also writes"
        (is (= ["description"] (:user_set wrens-entry))))
      (testing "a Field does too, in a fixed order"
        (is (= ["description" "semantic_type"] (:user_set (field-named wrens-entry "song")))))
      (testing "a Table and a Field with no user-set column have no such key"
        (is (not (contains? (entries-by-key ["public" "owls"]) :user_set)))
        (is (not (contains? (field-named wrens-entry "nest") :user_set))))
      (testing "a column whose value is not sent is not named"
        (is (not (contains? (entries-by-key ["public" "gulls"]) :user_set))))
      (testing "the entries are valid"
        (is (every? #(mr/validate ::tables/table %) (vals entries-by-key)))))))

(deftest a-sensitive-field-sends-no-fingerprint-test
  (mt/with-temp [:model/Database {db-id :id}    {}
                 :model/Table    {table-id :id} {:db_id db-id :schema "public" :name "people"}
                 :model/Field    _              {:table_id            table-id
                                                 :name                "salary"
                                                 :base_type           :type/Integer
                                                 :database_type       "INT"
                                                 :visibility_type     :sensitive
                                                 :fingerprint         {:type {:type/Number {:min 1 :max 9}}}
                                                 :fingerprint_version 5
                                                 :last_analyzed       #t "2026-01-01T00:00:00Z"}
                 :model/Field    _              {:table_id            table-id
                                                 :name                "age"
                                                 :base_type           :type/Integer
                                                 :database_type       "INT"
                                                 :fingerprint         {:type {:type/Number {:min 1 :max 9}}}
                                                 :fingerprint_version 5
                                                 :last_analyzed       #t "2026-01-01T00:00:00Z"}]
    (let [doc (get (entries db-id) ["public" "people"])]
      (testing "a sensitive Field is sent, as sensitive, without its fingerprint, which holds values of its column"
        (is (=? {:visibility_type "sensitive"} (field-named doc "salary")))
        (is (= #{} (set (keys (select-keys (field-named doc "salary")
                                           [:fingerprint :fingerprint_version :last_analyzed]))))))
      (testing "another Field keeps its fingerprint"
        (is (=? {:fingerprint {:type {:type/Number {:min 1 :max 9}}} :fingerprint_version 5 :last_analyzed string?}
                (field-named doc "age")))))))

(deftest a-user-set-fk-is-named-on-the-field-only-when-it-has-no-target-test
  (mt/with-temp [:model/Database {db-id :id}    {}
                 :model/Table    {people :id}   {:db_id db-id :schema "public" :name "people"}
                 :model/Field    {person :id}   {:table_id people :name "id" :base_type :type/Integer}
                 :model/Table    {orders :id}   {:db_id db-id :schema "public" :name "orders"}
                 :model/Field    {user-id :id}  {:table_id orders :name "user_id" :base_type :type/Integer
                                                 :fk_target_field_id person}
                 :model/Field    {cleared :id}  {:table_id orders :name "cleared_id" :base_type :type/Integer}]
    (t2/insert! :model/FieldUserSettings {:field_id user-id :fk_target_field_id person :fk_target_field_id_set true})
    (t2/insert! :model/FieldUserSettings {:field_id cleared :fk_target_field_id nil :fk_target_field_id_set true})
    (let [orders-entry (get (entries db-id) ["public" "orders"])]
      (testing "a user-set FK with a target is not named on its Field: its link says so"
        (is (not (contains? (field-named orders-entry "user_id") :user_set))))
      (testing "an FK that a user cleared is named on its Field: it has no link, and the receiver's sync must not set it"
        (is (= ["fk_target_field_id"] (:user_set (field-named orders-entry "cleared_id"))))))))
