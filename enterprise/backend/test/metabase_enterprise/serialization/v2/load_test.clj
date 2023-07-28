(ns ^:mb/once metabase-enterprise.serialization.v2.load-test
  (:require
   [clojure.test :refer :all]
   [java-time :as t]
   [metabase-enterprise.serialization.test-util :as ts]
   [metabase-enterprise.serialization.v2.extract :as serdes.extract]
   [metabase-enterprise.serialization.v2.ingest :as serdes.ingest]
   [metabase-enterprise.serialization.v2.load :as serdes.load]
   [metabase.models
    :refer [Action Card Collection Dashboard DashboardCard Database Field
            FieldValues Metric NativeQuerySnippet Segment Table Timeline
            TimelineEvent User]]
   [metabase.models.action :as action]
   [metabase.models.serialization :as serdes]
   [metabase.test :as mt]
   [metabase.util :as u]
   [schema.core :as s]
   [toucan2.core :as t2])
  (:import
   (java.time OffsetDateTime)))

(defn- no-labels [path]
  (mapv #(dissoc % :label) path))

(defn- by-model [entities model-name]
  (filter #(-> % :serdes/meta last :model (= model-name))
          entities))

(defn- ids-by-model [entities model-name]
  (->> (by-model entities model-name)
       (map (comp :id last :serdes/meta))
       set))

(defn- ingestion-in-memory [extractions]
  (let [mapped (into {} (for [entity (into [] extractions)]
                          [(no-labels (serdes/path entity))
                           entity]))]
    (reify
      serdes.ingest/Ingestable
      (ingest-list [_]
        (keys mapped))
      (ingest-one [_ path]
        (or (get mapped (no-labels path))
            (throw (ex-info (format "Unknown ingestion target: %s" path)
                            {:path path :world mapped})))))))

;;; WARNING for test authors: [[extract/extract]] returns a lazy reducible value. To make sure you don't
;;; confound your tests with data from your dev appdb, remember to eagerly
;;; `(into [] (extract/extract ...))` in these tests.

(deftest load-basics-test
  (testing "a simple, fresh collection is imported"
    (let [serialized (atom nil)
          eid1       "0123456789abcdef_0123"]
      (ts/with-source-and-dest-dbs
        (testing "extraction succeeds"
          (ts/with-source-db
            (ts/create! Collection :name "Basic Collection" :entity_id eid1)
            (reset! serialized (into [] (serdes.extract/extract {})))
            (is (some (fn [{[{:keys [model id]}] :serdes/meta}]
                        (and (= model "Collection") (= id eid1)))
                      @serialized))))

        (testing "loading into an empty database succeeds"
          (ts/with-dest-db
            (serdes.load/load-metabase (ingestion-in-memory @serialized))
            (let [colls (t2/select Collection)]
              (is (= 1 (count colls)))
              (is (= "Basic Collection" (:name (first colls))))
              (is (= eid1               (:entity_id (first colls)))))))

        (testing "loading again into the same database does not duplicate"
          (ts/with-dest-db
            (serdes.load/load-metabase (ingestion-in-memory @serialized))
            (let [colls (t2/select Collection)]
              (is (= 1 (count colls)))
              (is (= "Basic Collection" (:name (first colls))))
              (is (= eid1               (:entity_id (first colls)))))))))))

(deftest deserialization-nested-collections-test
  (testing "with a three-level nesting of collections"
    (let [serialized (atom nil)
          parent     (atom nil)
          child      (atom nil)
          grandchild (atom nil)]
      (ts/with-source-and-dest-dbs
        (testing "serialization of the three collections"
          (ts/with-source-db
            (reset! parent     (ts/create! Collection :name "Parent Collection" :location "/"))
            (reset! child      (ts/create! Collection
                                           :name "Child Collection"
                                           :location (format "/%d/" (:id @parent))))
            (reset! grandchild (ts/create! Collection
                                           :name "Grandchild Collection"
                                           :location (format "/%d/%d/" (:id @parent) (:id @child))))
            (reset! serialized (into [] (serdes.extract/extract {})))))

        (testing "deserialization into a database that already has the parent, but with a different ID"
          (ts/with-dest-db
            (ts/create! Collection :name "Unrelated Collection")
            (ts/create! Collection :name "Parent Collection" :location "/" :entity_id (:entity_id @parent))
            (serdes.load/load-metabase (ingestion-in-memory @serialized))
            (let [parent-dest     (t2/select-one Collection :entity_id (:entity_id @parent))
                  child-dest      (t2/select-one Collection :entity_id (:entity_id @child))
                  grandchild-dest (t2/select-one Collection :entity_id (:entity_id @grandchild))]
              (is (some? parent-dest))
              (is (some? child-dest))
              (is (some? grandchild-dest))
              (is (not= (:id parent-dest) (:id @parent)) "should have different primary keys")
              (is (= 4 (t2/count Collection)))
              (is (= "/"
                     (:location parent-dest)))
              (is (= (format "/%d/" (:id parent-dest))
                     (:location child-dest)))
              (is (= (format "/%d/%d/" (:id parent-dest) (:id child-dest))
                     (:location grandchild-dest))))))))))

(deftest deserialization-database-table-field-test
  (testing "databases, tables and fields are nested in namespaces"
    (let [serialized (atom nil)
          db1s       (atom nil)
          db1d       (atom nil)
          db2s       (atom nil)
          db2d       (atom nil)
          t1s        (atom nil)
          t2s        (atom nil)
          f1s        (atom nil)
          f2s        (atom nil)]
      (ts/with-source-and-dest-dbs
        (testing "serializing the two databases"
          (ts/with-source-db
            (reset! db1s (ts/create! Database :name "db1"))
            (reset! t1s  (ts/create! Table    :name "posts" :db_id (:id @db1s)))
            (reset! db2s (ts/create! Database :name "db2"))
            (reset! t2s  (ts/create! Table    :name "posts" :db_id (:id @db2s))) ; Deliberately the same name!
            (reset! f1s  (ts/create! Field    :name "Target Field" :table_id (:id @t1s)))
            (reset! f2s  (ts/create! Field    :name "Foreign Key"  :table_id (:id @t2s) :fk_target_field_id (:id @f1s)))
            (reset! serialized (into [] (serdes.extract/extract {})))))

        (testing "serialization of databases is based on the :name"
          (is (= #{(:name @db1s) (:name @db2s) "test-data"} ; TODO I'm not sure where the `test-data` one comes from.
                 (ids-by-model @serialized "Database"))))

        (testing "tables reference their databases by name"
          (is (= #{(:name @db1s) (:name @db2s) "test-data"}
                 (->> @serialized
                      (filter #(-> % :serdes/meta last :model (= "Table")))
                      (map :db_id)
                      set))))

        (testing "foreign key references are serialized as a field path"
          (is (= ["db1" nil "posts" "Target Field"]
                 (->> @serialized
                      (filter #(-> % :serdes/meta last :model (= "Field")))
                      (filter #(-> % :table_id (= ["db2" nil "posts"])))
                      (keep :fk_target_field_id)
                      first))))

        (testing "deserialization works properly, keeping the same-named tables apart"
          (ts/with-dest-db
            (serdes.load/load-metabase (ingestion-in-memory @serialized))
            (reset! db1d (t2/select-one Database :name (:name @db1s)))
            (reset! db2d (t2/select-one Database :name (:name @db2s)))

            (is (= 3 (t2/count Database)))
            (is (every? #(= "complete" (:initial_sync_status %)) (t2/select Database)))
            (is (= #{"db1" "db2" "test-data"}
                   (t2/select-fn-set :name Database)))
            (is (= #{(:id @db1d) (:id @db2d)}
                   (t2/select-fn-set :db_id Table :name "posts")))
            (is (t2/exists? Table :name "posts" :db_id (:id @db1d)))
            (is (t2/exists? Table :name "posts" :db_id (:id @db2d)))))))))

(deftest card-dataset-query-test
  ;; Card.dataset_query is a JSON-encoded MBQL query, which contain database, table, and field IDs - these need to be
  ;; converted to a portable form and read back in.
  ;; This test has a database, table and fields, that exist on both sides with different IDs, and expects a card that
  ;; references those fields to be correctly loaded with the dest IDs.
  (testing "embedded MBQL in Card :dataset-query is portable"
    (let [serialized (atom nil)
          coll1s     (atom nil)
          db1s       (atom nil)
          table1s    (atom nil)
          field1s    (atom nil)
          card1s     (atom nil)
          user1s     (atom nil)
          db1d       (atom nil)
          table1d    (atom nil)
          field1d    (atom nil)
          user1d     (atom nil)
          card1d     (atom nil)
          db2d       (atom nil)
          table2d    (atom nil)
          field2d    (atom nil)]

      (ts/with-source-and-dest-dbs
        (testing "serializing the original database, table, field and card"
          (ts/with-source-db
            (reset! coll1s  (ts/create! Collection :name "pop! minis"))
            (reset! db1s    (ts/create! Database :name "my-db"))
            (reset! table1s (ts/create! Table :name "customers" :db_id (:id @db1s)))
            (reset! field1s (ts/create! Field :name "age"    :table_id (:id @table1s)))
            (reset! user1s  (ts/create! User  :first_name "Tom" :last_name "Scholz" :email "tom@bost.on"))
            (reset! card1s  (ts/create! Card
                                        :database_id   (:id @db1s)
                                        :table_id      (:id @table1s)
                                        :collection_id (:id @coll1s)
                                        :creator_id    (:id @user1s)
                                        :query_type    :query
                                        :name          "Example Card"
                                        :dataset_query {:type     :query
                                                        :query    {:source-table (:id @table1s)
                                                                   :filter       [:>= [:field (:id @field1s) nil] 18]
                                                                   :aggregation  [[:count]]}
                                                        :database (:id @db1s)}
                                        :display        :line))
            (reset! serialized (into [] (serdes.extract/extract {})))))

        (testing "the serialized form is as desired"
          (is (= {:type  :query
                  :query {:source-table ["my-db" nil "customers"]
                          :filter       [:>= [:field ["my-db" nil "customers" "age"] nil] 18]
                          :aggregation  [[:count]]}
                  :database "my-db"}
                 (->> (by-model @serialized "Card")
                      first
                      :dataset_query))))

        (testing "deserializing adjusts the IDs properly"
          (ts/with-dest-db
            ;; A different database and tables, so the IDs don't match.
            (reset! db2d    (ts/create! Database :name "other-db"))
            (reset! table2d (ts/create! Table    :name "orders" :db_id (:id @db2d)))
            (reset! field2d (ts/create! Field    :name "subtotal" :table_id (:id @table2d)))
            (reset! user1d  (ts/create! User  :first_name "Tom" :last_name "Scholz" :email "tom@bost.on"))

            ;; Load the serialized content.
            (serdes.load/load-metabase (ingestion-in-memory @serialized))

            ;; Fetch the relevant bits
            (reset! db1d    (t2/select-one Database :name "my-db"))
            (reset! table1d (t2/select-one Table :name "customers"))
            (reset! field1d (t2/select-one Field :table_id (:id @table1d) :name "age"))
            (reset! card1d  (t2/select-one Card  :name "Example Card"))

            (testing "the main Database, Table, and Field have different IDs now"
              (is (not= (:id @db1s) (:id @db1d)))
              (is (not= (:id @table1s) (:id @table1d)))
              (is (not= (:id @field1s) (:id @field1d))))

            (is (not= (:dataset_query @card1s)
                      (:dataset_query @card1d)))
            (testing "the Card's query is based on the new Database, Table, and Field IDs"
              (is (= {:type     :query
                      :query    {:source-table (:id @table1d)
                                 :filter       [:>= [:field (:id @field1d) nil] 18]
                                 :aggregation  [[:count]]}
                      :database (:id @db1d)}
                     (:dataset_query @card1d))))))))))

(deftest segment-test
  ;; Segment.definition is a JSON-encoded MBQL query, which contain database, table, and field IDs - these need to be
  ;; converted to a portable form and read back in.
  ;; This test has a database, table and fields, that exist on both sides with different IDs, and expects a segment that
  ;; references those fields to be correctly loaded with the dest IDs.
  (testing "embedded MBQL in Segment :definition is portable"
    (let [serialized (atom nil)
          coll1s     (atom nil)
          db1s       (atom nil)
          table1s    (atom nil)
          field1s    (atom nil)
          seg1s      (atom nil)
          user1s     (atom nil)
          db1d       (atom nil)
          table1d    (atom nil)
          field1d    (atom nil)
          user1d     (atom nil)
          seg1d      (atom nil)
          db2d       (atom nil)
          table2d    (atom nil)
          field2d    (atom nil)]


      (ts/with-source-and-dest-dbs
        (testing "serializing the original database, table, field and card"
          (ts/with-source-db
            (reset! coll1s  (ts/create! Collection :name "pop! minis"))
            (reset! db1s    (ts/create! Database :name "my-db"))
            (reset! table1s (ts/create! Table :name "customers" :db_id (:id @db1s)))
            (reset! field1s (ts/create! Field :name "age"    :table_id (:id @table1s)))
            (reset! user1s  (ts/create! User  :first_name "Tom" :last_name "Scholz" :email "tom@bost.on"))
            (reset! seg1s   (ts/create! Segment :table_id (:id @table1s) :name "Minors"
                                        :definition {:source-table (:id @table1s)
                                                     :aggregation [[:count]]
                                                     :filter [:< [:field (:id @field1s) nil] 18]}
                                        :creator_id (:id @user1s)))
            (reset! serialized (into [] (serdes.extract/extract {})))))

        (testing "exported form is properly converted"
          (is (= {:source-table ["my-db" nil "customers"]
                  :aggregation [[:count]]
                  :filter [:< [:field ["my-db" nil "customers" "age"] nil] 18]}
                 (-> @serialized
                     (by-model "Segment")
                     first
                     :definition))))

        (testing "deserializing adjusts the IDs properly"
          (ts/with-dest-db
            ;; A different database and tables, so the IDs don't match.
            (reset! db2d    (ts/create! Database :name "other-db"))
            (reset! table2d (ts/create! Table    :name "orders" :db_id (:id @db2d)))
            (reset! field2d (ts/create! Field    :name "subtotal" :table_id (:id @table2d)))
            (reset! user1d  (ts/create! User  :first_name "Tom" :last_name "Scholz" :email "tom@bost.on"))

            ;; Load the serialized content.
            (serdes.load/load-metabase (ingestion-in-memory @serialized))

            ;; Fetch the relevant bits
            (reset! db1d    (t2/select-one Database :name "my-db"))
            (reset! table1d (t2/select-one Table :name "customers"))
            (reset! field1d (t2/select-one Field :table_id (:id @table1d) :name "age"))
            (reset! seg1d   (t2/select-one Segment :name "Minors"))

            (testing "the main Database, Table, and Field have different IDs now"
              (is (not= (:id @db1s) (:id @db1d)))
              (is (not= (:id @table1s) (:id @table1d)))
              (is (not= (:id @field1s) (:id @field1d))))

            (is (not= (:definition @seg1s)
                      (:definition @seg1d)))
            (testing "the Segment's definition is based on the new Database, Table, and Field IDs"
              (is (= {:source-table (:id @table1d)
                      :filter       [:< [:field (:id @field1d) nil] 18]
                      :aggregation  [[:count]]}
                     (:definition @seg1d))))))))))

(deftest metric-test
  ;; Metric.definition is a JSON-encoded MBQL query, which contain database, table, and field IDs - these need to be
  ;; converted to a portable form and read back in.
  ;; This test has a database, table and fields, that exist on both sides with different IDs, and expects a metric
  ;; to be correctly loaded with the dest IDs.
  (testing "embedded MBQL in Metric :definition is portable"
    (let [serialized (atom nil)
          coll1s     (atom nil)
          db1s       (atom nil)
          table1s    (atom nil)
          field1s    (atom nil)
          metric1s   (atom nil)
          user1s     (atom nil)
          db1d       (atom nil)
          table1d    (atom nil)
          field1d    (atom nil)
          user1d     (atom nil)
          metric1d   (atom nil)
          db2d       (atom nil)
          table2d    (atom nil)
          field2d    (atom nil)]


      (ts/with-source-and-dest-dbs
        (testing "serializing the original database, table, field and card"
          (ts/with-source-db
            (reset! coll1s   (ts/create! Collection :name "pop! minis"))
            (reset! db1s     (ts/create! Database :name "my-db"))
            (reset! table1s  (ts/create! Table :name "orders" :db_id (:id @db1s)))
            (reset! field1s  (ts/create! Field :name "subtotal"    :table_id (:id @table1s)))
            (reset! user1s   (ts/create! User  :first_name "Tom" :last_name "Scholz" :email "tom@bost.on"))
            (reset! metric1s (ts/create! Metric :table_id (:id @table1s) :name "Revenue"
                                         :definition {:source-table (:id @table1s)
                                                      :aggregation [[:sum [:field (:id @field1s) nil]]]}
                                         :creator_id (:id @user1s)))
            (reset! serialized (into [] (serdes.extract/extract {})))))

        (testing "exported form is properly converted"
          (is (= {:source-table ["my-db" nil "orders"]
                  :aggregation [[:sum [:field ["my-db" nil "orders" "subtotal"] nil]]]}
                 (-> @serialized
                     (by-model "Metric")
                     first
                     :definition))))

        (testing "deserializing adjusts the IDs properly"
          (ts/with-dest-db
            ;; A different database and tables, so the IDs don't match.
            (reset! db2d    (ts/create! Database :name "other-db"))
            (reset! table2d (ts/create! Table    :name "customers" :db_id (:id @db2d)))
            (reset! field2d (ts/create! Field    :name "age" :table_id (:id @table2d)))
            (reset! user1d  (ts/create! User  :first_name "Tom" :last_name "Scholz" :email "tom@bost.on"))

            ;; Load the serialized content.
            (serdes.load/load-metabase (ingestion-in-memory @serialized))

            ;; Fetch the relevant bits
            (reset! db1d     (t2/select-one Database :name "my-db"))
            (reset! table1d  (t2/select-one Table :name "orders"))
            (reset! field1d  (t2/select-one Field :table_id (:id @table1d) :name "subtotal"))
            (reset! metric1d (t2/select-one Metric :name "Revenue"))

            (testing "the main Database, Table, and Field have different IDs now"
              (is (not= (:id @db1s) (:id @db1d)))
              (is (not= (:id @table1s) (:id @table1d)))
              (is (not= (:id @field1s) (:id @field1d))))

            (is (not= (:definition @metric1s)
                      (:definition @metric1d)))
            (testing "the Metric's definition is based on the new Database, Table, and Field IDs"
              (is (= {:source-table (:id @table1d)
                      :aggregation  [[:sum [:field (:id @field1d) nil]]]}
                     (:definition @metric1d))))))))))

(deftest dashboard-card-test
  ;; DashboardCard.parameter_mappings and Card.parameter_mappings are JSON-encoded lists of parameter maps, which
  ;; contain field IDs - these need to be converted to a portable form and read back in.
  ;; This test has a database, table and fields, that exist on both sides with different IDs, and expects a Card and
  ;; DashboardCard to be correctly loaded with the dest IDs.
  (testing "parameter_mappings are portable"
    (let [serialized (atom nil)
          coll1s     (atom nil)
          db1s       (atom nil)
          table1s    (atom nil)
          field1s    (atom nil)
          field2s    (atom nil)
          dash1s     (atom nil)
          card1s     (atom nil)
          dashcard1s (atom nil)
          user1s     (atom nil)
          db1d       (atom nil)
          table1d    (atom nil)
          field1d    (atom nil)
          field2d    (atom nil)
          user1d     (atom nil)
          dash1d     (atom nil)
          card1d     (atom nil)
          dashcard1d (atom nil)
          db2d       (atom nil)
          table2d    (atom nil)
          field3d    (atom nil)]


      (ts/with-source-and-dest-dbs
        (testing "serializing the original database, table, field and card"
          (ts/with-source-db
            (reset! coll1s   (ts/create! Collection :name "pop! minis"))
            (reset! db1s     (ts/create! Database :name "my-db"))
            (reset! table1s  (ts/create! Table :name "orders" :db_id (:id @db1s)))
            (reset! field1s  (ts/create! Field :name "subtotal" :table_id (:id @table1s)))
            (reset! field2s  (ts/create! Field :name "invoice" :table_id (:id @table1s)))
            (reset! user1s   (ts/create! User  :first_name "Tom" :last_name "Scholz" :email "tom@bost.on"))
            (reset! dash1s   (ts/create! Dashboard :name "My Dashboard" :collection_id (:id @coll1s) :creator_id (:id @user1s)))
            (reset! card1s   (ts/create! Card :name "The Card" :database_id (:id @db1s) :table_id (:id @table1s)
                                         :collection_id (:id @coll1s) :creator_id (:id @user1s)
                                         :visualization_settings
                                         {:table.pivot_column "SOURCE"
                                          :table.cell_column "sum"
                                          :table.columns
                                          [{:name "SOME_FIELD"
                                            :fieldRef [:field (:id @field1s) nil]
                                            :enabled true}
                                           {:name "sum"
                                            :fieldRef [:field "sum" {:base-type :type/Float}]
                                            :enabled true}
                                           {:name "count"
                                            :fieldRef [:field "count" {:base-type :type/BigInteger}]
                                            :enabled true}
                                           {:name "Average order total"
                                            :fieldRef [:field "Average order total" {:base-type :type/Float}]
                                            :enabled true}]
                                          :column_settings
                                          {(str "[\"ref\",[\"field\"," (:id @field2s) ",null]]") {:column_title "Locus"}}}
                                         :parameter_mappings [{:parameter_id "12345678"
                                                               :target [:dimension [:field (:id @field1s) {:source-field (:id @field2s)}]]}]))
            (reset! dashcard1s (ts/create! DashboardCard :dashboard_id (:id @dash1s) :card_id (:id @card1s)
                                           :visualization_settings
                                           {:table.pivot_column "SOURCE"
                                            :table.cell_column "sum"
                                            :table.columns
                                            [{:name "SOME_FIELD"
                                              :fieldRef [:field (:id @field1s) nil]
                                              :enabled true}
                                             {:name "sum"
                                              :fieldRef [:field "sum" {:base-type :type/Float}]
                                              :enabled true}
                                             {:name "count"
                                              :fieldRef [:field "count" {:base-type :type/BigInteger}]
                                              :enabled true}
                                             {:name "Average order total"
                                              :fieldRef [:field "Average order total" {:base-type :type/Float}]
                                              :enabled true}]
                                            :column_settings
                                            {(str "[\"ref\",[\"field\"," (:id @field2s) ",null]]") {:column_title "Locus"}}}
                                           :parameter_mappings [{:parameter_id "deadbeef"
                                                                 :card_id (:id @card1s)
                                                                 :target [:dimension [:field (:id @field1s) {:source-field (:id @field2s)}]]}]))

            (reset! serialized (into [] (serdes.extract/extract {})))
            (let [card (-> @serialized (by-model "Card") first)
                  dash (-> @serialized (by-model "Dashboard") first)]
              (testing "exported :parameter_mappings are properly converted"
                (is (= [{:parameter_id "12345678"
                         :target [:dimension [:field ["my-db" nil "orders" "subtotal"]
                                              {:source-field ["my-db" nil "orders" "invoice"]}]]}]
                       (:parameter_mappings card)))
                (is (schema= [{:parameter_mappings [{:parameter_id (s/eq "deadbeef")
                                                     :card_id      (s/eq (:entity_id @card1s))
                                                     :target       (s/eq [:dimension [:field ["my-db" nil "orders" "subtotal"]
                                                                                      {:source-field ["my-db" nil "orders" "invoice"]}]])}]
                               s/Keyword s/Any}]
                       (:ordered_cards dash))))

              (testing "exported :visualization_settings are properly converted"
                (let [expected {:table.pivot_column "SOURCE"
                                :table.cell_column "sum"
                                :table.columns
                                [{:name "SOME_FIELD"
                                  :fieldRef [:field ["my-db" nil "orders" "subtotal"] nil]
                                  :enabled true}
                                 {:name "sum"
                                  :fieldRef [:field "sum" {:base-type :type/Float}]
                                  :enabled true}
                                 {:name "count"
                                  :fieldRef [:field "count" {:base-type :type/BigInteger}]
                                  :enabled true}
                                 {:name "Average order total"
                                  :fieldRef [:field "Average order total" {:base-type :type/Float}]
                                  :enabled true}]
                                :column_settings
                                {"[\"ref\",[\"field\",[\"my-db\",null,\"orders\",\"invoice\"],null]]" {:column_title "Locus"}}}]
                  (is (= expected
                         (:visualization_settings card)))
                  (is (= expected
                         (-> dash :ordered_cards first :visualization_settings))))))))


        (testing "deserializing adjusts the IDs properly"
          (ts/with-dest-db
            ;; A different database and tables, so the IDs don't match.
            (reset! db2d    (ts/create! Database :name "other-db"))
            (reset! table2d (ts/create! Table    :name "customers" :db_id (:id @db2d)))
            (reset! field3d (ts/create! Field    :name "age" :table_id (:id @table2d)))
            (ts/create! Field :name "name" :table_id (:id @table2d))
            (ts/create! Field :name "address" :table_id (:id @table2d))
            (reset! user1d  (ts/create! User  :first_name "Tom" :last_name "Scholz" :email "tom@bost.on"))

            ;; Load the serialized content.
            (serdes.load/load-metabase (ingestion-in-memory @serialized))

            ;; Fetch the relevant bits
            (reset! db1d       (t2/select-one Database :name "my-db"))
            (reset! table1d    (t2/select-one Table :name "orders"))
            (reset! field1d    (t2/select-one Field :table_id (:id @table1d) :name "subtotal"))
            (reset! field2d    (t2/select-one Field :table_id (:id @table1d) :name "invoice"))
            (reset! dash1d     (t2/select-one Dashboard :name "My Dashboard"))
            (reset! card1d     (t2/select-one Card :name "The Card"))
            (reset! dashcard1d (t2/select-one DashboardCard :card_id (:id @card1d) :dashboard_id (:id @dash1d)))

            (testing "the main Database, Table, and Field have different IDs now"
              (is (not= (:id @db1s) (:id @db1d)))
              (is (not= (:id @table1s) (:id @table1d)))
              (is (not= (:id @field1s) (:id @field1d)))
              (is (not= (:id @field2s) (:id @field2d))))

            (is (not= (:parameter_mappings @dashcard1s)
                      (:parameter_mappings @dashcard1d)))
            (is (not= (:parameter_mappings @card1s)
                      (:parameter_mappings @card1d)))
            (testing "Card.parameter_mappings are based on the new Field IDs"
              (is (= [{:parameter_id "12345678"
                       :target       [:dimension [:field (:id @field1d) {:source-field (:id @field2d)}]]}]
                     (:parameter_mappings @card1d))))
            (testing "DashboardCard.parameter_mappings are based on the new Field IDs"
              (is (= [{:parameter_id "deadbeef"
                       :card_id      (:id @card1d)
                       :target       [:dimension [:field (:id @field1d) {:source-field (:id @field2d)}]]}]
                     (:parameter_mappings @dashcard1d))))))))))

(deftest timelines-test
  (testing "timelines"
    (let [serialized (atom nil)
          coll1s     (atom nil)
          user1s     (atom nil)
          timeline1s (atom nil)
          event1s    (atom nil)
          event2s    (atom nil)
          timeline2s (atom nil)
          event3s    (atom nil)

          coll1d     (atom nil)
          user1d     (atom nil)
          timeline1d (atom nil)
          timeline2d (atom nil)
          eventsT1   (atom nil)
          eventsT2   (atom nil)]

      (ts/with-source-and-dest-dbs
        (testing "serialize correctly"
          (ts/with-source-db
            (reset! coll1s     (ts/create! Collection :name "col1"))
            (reset! user1s     (ts/create! User  :first_name "Tom" :last_name "Scholz" :email "tom@bost.on"))
            (reset! timeline1s (ts/create! Timeline :name "Some events" :creator_id (:id @user1s)
                                           :collection_id (:id @coll1s)))
            (reset! event1s    (ts/create! TimelineEvent :name "First thing"  :timeline_id (:id @timeline1s)
                                           :creator_id (:id @user1s) :timezone "America/New_York"
                                           :timestamp (t/local-date 2022 11 3)))
            (reset! event2s    (ts/create! TimelineEvent :name "Second thing" :timeline_id (:id @timeline1s)
                                           :creator_id (:id @user1s) :timezone "America/New_York"
                                           :timestamp (t/local-date 2022 11 8)))
            (reset! timeline2s (ts/create! Timeline :name "More events" :creator_id (:id @user1s)
                                           :collection_id (:id @coll1s)))
            (reset! event3s    (ts/create! TimelineEvent :name "Different event"  :timeline_id (:id @timeline2s)
                                           :creator_id (:id @user1s) :timezone "America/New_York"
                                           :time_matters true :timestamp (t/offset-date-time 2022 10 31 19 00 00)))

            (testing "expecting 3 events"
              (is (= 3 (t2/count TimelineEvent))))

            (reset! serialized (into [] (serdes.extract/extract {})))

            (let [timelines (by-model @serialized "Timeline")
                  timeline1 (first (filter #(= (:entity_id %) (:entity_id @timeline1s)) timelines))
                  timeline2 (first (filter #(= (:entity_id %) (:entity_id @timeline2s)) timelines))]
              (testing "with inline :events"
                (is (schema= {:serdes/meta                 (s/eq [{:model "Timeline"
                                                                   :id    (:entity_id timeline1)
                                                                   :label "some_events"}])
                              :archived                    (s/eq false)
                              :collection_id               (s/eq (:entity_id @coll1s))
                              :name                        (s/eq "Some events")
                              :creator_id                  (s/eq "tom@bost.on")
                              (s/optional-key :updated_at) OffsetDateTime
                              :created_at                  OffsetDateTime
                              :entity_id                   (s/eq (:entity_id timeline1))
                              (s/optional-key :icon)       (s/maybe s/Str)
                              :description                 (s/maybe s/Str)
                              (s/optional-key :default)    s/Bool
                              :events                      [{:timezone                    s/Str
                                                             :time_matters                s/Bool
                                                             :name                        s/Str
                                                             :archived                    s/Bool
                                                             :description                 (s/maybe s/Str)
                                                             :creator_id                  s/Str
                                                             (s/optional-key :icon)       (s/maybe s/Str)
                                                             :created_at                  OffsetDateTime
                                                             (s/optional-key :updated_at) OffsetDateTime
                                                             :timestamp                   s/Str}]}
                             timeline1))
                (is (= 2 (-> timeline1 :events count)))
                (is (= 1 (-> timeline2 :events count)))))))

        (testing "deserializing merges events properly"
          (ts/with-dest-db
            ;; The collection, timeline 1 and event 2 already exist. Event 1, plus timeline 2 and its event 3, are new.
            (reset! user1d     (ts/create! User  :first_name "Tom" :last_name "Scholz" :email "tom@bost.on"))
            (reset! coll1d     (ts/create! Collection :name "col1" :entity_id (:entity_id @coll1s)))
            (reset! timeline1d (ts/create! Timeline :name "Some events" :creator_id (:id @user1s)
                                           :entity_id (:entity_id @timeline1s)
                                           :collection_id (:id @coll1d)))
            (ts/create! TimelineEvent :name "Second thing with different name" :timeline_id (:id @timeline1s)
                        :timestamp  (:timestamp @event2s)
                        :creator_id (:id @user1s) :timezone "America/New_York")

            ;; Load the serialized content.
            (serdes.load/load-metabase (ingestion-in-memory @serialized))

            ;; Fetch the relevant bits
            (reset! timeline2d (t2/select-one Timeline :entity_id (:entity_id @timeline2s)))
            (reset! eventsT1   (t2/select TimelineEvent :timeline_id (:id @timeline1d)))
            (reset! eventsT2   (t2/select TimelineEvent :timeline_id (:id @timeline2d)))

            (testing "no duplication - there are two timelines with the right event counts"
              (is (some? @timeline2d))
              (is (= 2 (count @eventsT1)))
              (is (= 1 (count @eventsT2))))

            (testing "resulting events match up"
              (let [[event1 event2] (sort-by :timestamp @eventsT1)]
                (is (= (:timestamp @event1s) (:timestamp event1)))
                (is (= (:timestamp @event2s) (:timestamp event2)))

                (is (= (:timestamp @event3s)
                       (:timestamp (first @eventsT2))))

                (is (= (:name @event2s)
                       (:name event2))
                    "existing event name should be updated")))))))))

(deftest users-test
  ;; Users are serialized as their email address. If a corresponding user is found during deserialization, its ID is
  ;; used. However, if no such user exists, a new one is created with mostly blank fields.
  (testing "existing users are found and used; missing users are created on the fly"
    (let [serialized (atom nil)
          metric1s   (atom nil)
          metric2s   (atom nil)
          user1s     (atom nil)
          user2s     (atom nil)
          user1d     (atom nil)
          metric1d   (atom nil)
          metric2d   (atom nil)]

      (ts/with-source-and-dest-dbs
        (testing "serializing the original entities"
          (ts/with-source-db
            (reset! user1s    (ts/create! User :first_name "Tom" :last_name "Scholz" :email "tom@bost.on"))
            (reset! user2s    (ts/create! User :first_name "Neil"  :last_name "Peart"   :email "neil@rush.yyz"))
            (reset! metric1s  (ts/create! Metric :name "Large Users"       :creator_id (:id @user1s) :definition {:aggregation [[:count]]}))
            (reset! metric2s  (ts/create! Metric :name "Support Headaches" :creator_id (:id @user2s) :definition {:aggregation [[:count]]}))
            (reset! serialized (into [] (serdes.extract/extract {})))))

        (testing "exported form is properly converted"
          (is (= "tom@bost.on"
                 (-> @serialized
                     (by-model "Metric")
                     first
                     :creator_id))))

        (testing "deserializing finds the matching user and synthesizes the missing one"
          (ts/with-dest-db
            ;; Create another random user to change the user IDs.
            (ts/create! User   :first_name "Gideon" :last_name "Nav" :email "griddle@ninth.tomb")
            ;; Likewise, create some other metrics.
            (ts/create! Metric :name "Other metric A")
            (ts/create! Metric :name "Other metric B")
            (ts/create! Metric :name "Other metric C")
            (reset! user1d  (ts/create! User  :first_name "Tom" :last_name "Scholz" :email "tom@bost.on"))

            ;; Load the serialized content.
            (serdes.load/load-metabase (ingestion-in-memory @serialized))

            ;; Fetch the relevant bits
            (reset! metric1d (t2/select-one Metric :name "Large Users"))
            (reset! metric2d (t2/select-one Metric :name "Support Headaches"))

            (testing "the Metrics and Users have different IDs now"
              (is (not= (:id @metric1s) (:id @metric1d)))
              (is (not= (:id @metric2s) (:id @metric2d)))
              (is (not= (:id @user1s)   (:id @user1d))))

            (testing "both existing User and the new one are set up properly"
              (is (= (:id @user1d) (:creator_id @metric1d)))
              (let [user2d-id (:creator_id @metric2d)
                    user2d    (t2/select-one User :id user2d-id)]
                (is (any? user2d))
                (is (= (:email @user2s) (:email user2d)))))))))))

(deftest field-values-test
  ;; FieldValues are a bit special - they map 1-1 with Fields but are a separate table serialized separately.
  ;; The main special thing to test here is that the custom load-find-local correctly finds an existing FieldValues.
  ;; This test creates:
  ;; - in src: a database, table, and two fields each with field values.
  ;; - in dst: a different database, table and field, to fiddle the IDs; plus the same database, table, both fields, but
  ;;   only one FieldValues. The existing and new FieldValues should both work correctly.
  ;; Another thing tested here is that the :field_id is properly reconstructed from the serdes path.
  (testing "FieldValues are portable"
    (let [serialized (atom nil)
          db1s       (atom nil)
          table1s    (atom nil)
          field1s    (atom nil)
          field2s    (atom nil)
          fv1s       (atom nil)
          fv2s       (atom nil)

          db1d       (atom nil)
          table1d    (atom nil)
          field1d    (atom nil)
          field2d    (atom nil)
          fv1d       (atom nil)
          fv2d       (atom nil)
          db2d       (atom nil)
          table2d    (atom nil)
          field3d    (atom nil)]

      (testing "serializing the original database, table, field and fieldvalues"
        (mt/with-empty-h2-app-db
          (reset! db1s     (ts/create! Database :name "my-db"))
          (reset! table1s  (ts/create! Table :name "CUSTOMERS" :db_id (:id @db1s)))
          (reset! field1s  (ts/create! Field :name "STATE" :table_id (:id @table1s)))
          (reset! field2s  (ts/create! Field :name "CATEGORY" :table_id (:id @table1s)))
          (reset! fv1s     (ts/create! FieldValues :field_id (:id @field1s) :values ["AZ" "CA" "NY" "TX"]))
          (reset! fv2s     (ts/create! FieldValues :field_id (:id @field2s)
                                       :values ["CONSTRUCTION" "DAYLIGHTING" "DELIVERY" "HAULING"]))

          (reset! serialized (into [] (serdes.extract/extract {:include-field-values true})))

          (testing "the expected fields are serialized"
            (is (= 1
                   (->> @serialized
                        (filter #(= (:serdes/meta %)
                                    [{:model "Database" :id "test-data"}
                                     {:model "Schema"   :id "PUBLIC"}
                                     {:model "Table"    :id "VENUES"}
                                     {:model "Field"    :id "NAME"}]))
                        count))))

          (testing "FieldValues are serialized under their fields, with their own ID always 0"
            (let [fvs (by-model @serialized "FieldValues")]
              (is (= #{[{:model "Database"    :id "my-db"}
                        {:model "Table"       :id "CUSTOMERS"}
                        {:model "Field"       :id "STATE"}
                        {:model "FieldValues" :id "0"}]
                       [{:model "Database"    :id "my-db"}
                        {:model "Table"       :id "CUSTOMERS"}
                        {:model "Field"       :id "CATEGORY"}
                        {:model "FieldValues" :id "0"}]}
                     (->> fvs
                          (map serdes/path)
                          (filter #(-> % first :id (= "my-db")))
                          set)))))))

      (testing "deserializing finds existing FieldValues properly"
        (mt/with-empty-h2-app-db
          ;; A different database and tables, so the IDs don't match.
          (reset! db2d    (ts/create! Database :name "other-db"))
          (reset! table2d (ts/create! Table    :name "ORDERS" :db_id (:id @db2d)))
          (reset! field3d (ts/create! Field    :name "SUBTOTAL" :table_id (:id @table2d)))
          (ts/create! Field :name "DISCOUNT" :table_id (:id @table2d))
          (ts/create! Field :name "UNITS"    :table_id (:id @table2d))

          ;; Now the database, table, fields and *one* of the FieldValues from the src side.
          (reset! db1d     (ts/create! Database :name "my-db"))
          (reset! table1d  (ts/create! Table :name "CUSTOMERS" :db_id (:id @db1d)))
          (reset! field1d  (ts/create! Field :name "STATE" :table_id (:id @table1d)))
          (reset! field2d  (ts/create! Field :name "CATEGORY" :table_id (:id @table1d)))
          ;; The :values are different here; they should get overwritten by the update.
          (reset! fv1d     (ts/create! FieldValues :field_id (:id @field1d) :values ["WA" "NC" "NM" "WI"]))

          ;; Load the serialized content.
          (serdes.load/load-metabase (ingestion-in-memory @serialized))

          ;; Fetch the relevant bits
          (reset! fv1d (t2/select-one FieldValues :field_id (:id @field1d)))
          (reset! fv2d (t2/select-one FieldValues :field_id (:id @field2d)))

          (testing "the main Database, Table, and Field have different IDs now"
            (is (not= (:id @db1s)    (:id @db1d)))
            (is (not= (:id @table1s) (:id @table1d)))
            (is (not= (:id @field1s) (:id @field1d)))
            (is (not= (:id @field2s) (:id @field2d))))

          (testing "there are 2 FieldValues defined under fields of table1d"
            (let [fields (t2/select-pks-set Field :table_id (:id @table1d))]
              (is (= 2 (t2/count FieldValues :field_id [:in fields])))))

          (testing "existing FieldValues are properly found and updated"
            (is (= (set (:values @fv1s)) (set (:values @fv1d)))))
          (testing "new FieldValues are properly added"
            (is (= (dissoc @fv2s :id :field_id :created_at :updated_at)
                   (dissoc @fv2d :id :field_id :created_at :updated_at)))))))))

(deftest bare-import-test
  ;; If the dependencies of an entity exist in the receiving database, they don't need to be in the export.
  ;; This tests that such an import will succeed, and that it still fails when the dependency is not found in
  ;; either location.
  (let [db1s       (atom nil)
        table1s    (atom nil)]

    (testing "loading a bare card"
      (mt/with-empty-h2-app-db
        (reset! db1s    (ts/create! Database :name "my-db"))
        (reset! table1s (ts/create! Table :name "CUSTOMERS" :db_id (:id @db1s)))
        (ts/create! Field :name "STATE" :table_id (:id @table1s))
        (ts/create! User :first_name "Geddy" :last_name "Lee"     :email "glee@rush.yyz")

        (testing "depending on existing values works"
          (let [ingestion (ingestion-in-memory [{:serdes/meta   [{:model "Card" :id "0123456789abcdef_0123"}]
                                                 :created_at    (t/instant)
                                                 :creator_id    "glee@rush.yyz"
                                                 :database_id   "my-db"
                                                 :dataset_query {:database "my-db"
                                                                 :type     :query
                                                                 :query    {:source-table ["my-db" nil "CUSTOMERS"]}}
                                                 :display       :table
                                                 :entity_id     "0123456789abcdef_0123"
                                                 :name          "Some card"
                                                 :table_id      ["my-db" nil "CUSTOMERS"]
                                                 :visualization_settings {}}])]
            (is (some? (serdes.load/load-metabase ingestion)))))

        (testing "depending on nonexisting values fails"
          (let [ingestion (ingestion-in-memory [{:serdes/meta   [{:model "Card" :id "0123456789abcdef_0123"}]
                                                 :created_at    (t/instant)
                                                 :creator_id    "glee@rush.yyz"
                                                 :database_id   "bad-db"
                                                 :dataset_query {:database "bad-db"
                                                                 :type     :query
                                                                 :query    {:source-table ["bad-db" nil "CUSTOMERS"]}}
                                                 :display       :table
                                                 :entity_id     "0123456789abcdef_0123"
                                                 :name          "Some card"
                                                 :table_id      ["bad-db" nil "CUSTOMERS"]
                                                 :visualization_settings {}}])]
            (is (thrown-with-msg? clojure.lang.ExceptionInfo
                                  #"Failed to read file"
                                  (serdes.load/load-metabase ingestion)))))))))

(deftest card-with-snippet-test
  (let [db1s       (atom nil)
        table1s    (atom nil)
        snippet1s  (atom nil)
        card1s     (atom nil)
        extracted  (atom nil)]
    (testing "snippets referenced by native cards must be deserialized"
      (mt/with-empty-h2-app-db
        (reset! db1s      (ts/create! Database :name "my-db"))
        (reset! table1s   (ts/create! Table :name "CUSTOMERS" :db_id (:id @db1s)))
        (reset! snippet1s (ts/create! NativeQuerySnippet :name "some snippet"))
        (reset! card1s    (ts/create! Card
                                      :name "the query"
                                      :dataset_query {:database (:id @db1s)
                                                      :native {:template-tags {"snippet: things"
                                                                               {:id "e2d15f07-37b3-01fc-3944-2ff860a5eb46",
                                                                                :name "snippet: filtered data",
                                                                                :display-name "Snippet: Filtered Data",
                                                                                :type :snippet,
                                                                                :snippet-name "filtered data",
                                                                                :snippet-id (:id @snippet1s)}}}}))
        (ts/create! User :first_name "Geddy" :last_name "Lee"     :email "glee@rush.yyz")

        (testing "on extraction"
          (reset! extracted (serdes/extract-one "Card" {} @card1s))
          (is (= (:entity_id @snippet1s)
                 (-> @extracted :dataset_query :native :template-tags (get "snippet: things") :snippet-id))))

        (testing "when loading"
          (let [new-eid   (u/generate-nano-id)
                ingestion (ingestion-in-memory [(assoc @extracted :entity_id new-eid)])]
            (is (some? (serdes.load/load-metabase ingestion)))
            (is (= (:id @snippet1s)
                   (-> (t2/select-one Card :entity_id new-eid)
                       :dataset_query
                       :native
                       :template-tags
                       (get "snippet: things")
                       :snippet-id)))))))))

(deftest load-action-test
  (let [serialized (atom nil)
        eid (u/generate-nano-id)]
    (ts/with-source-and-dest-dbs
      (testing "extraction succeeds"
        (ts/with-source-db
          (let [db       (ts/create! Database :name "my-db")
                card     (ts/create! Card
                                     :name "the query"
                                     :query_type :native
                                     :dataset true
                                     :database_id (:id db)
                                     :dataset_query {:database (:id db)
                                                     :native {:type   :native
                                                              :native {:query "wow"}}})
                _action-id (action/insert! {:entity_id     eid
                                            :name          "the action"
                                            :model_id      (:id card)
                                            :type          :query
                                            :dataset_query "wow"
                                            :database_id   (:id db)})]
            (reset! serialized (into [] (serdes.extract/extract {})))
            (let [action-serialized (first (filter (fn [{[{:keys [model id]}] :serdes/meta}]
                                                     (and (= model "Action") (= id eid)))
                                                   @serialized))]
              (is (some? action-serialized))
              (testing ":type should be a string"
                (is (string? (:type action-serialized))))))))
      (testing "loading succeeds"
        (ts/with-dest-db
          (serdes.load/load-metabase (ingestion-in-memory @serialized))
          (let [action (t2/select-one Action :entity_id eid)]
            (is (some? action))
            (testing ":type should be a keyword again"
              (is (keyword? (:type action))))))))))
