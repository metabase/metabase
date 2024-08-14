(ns ^:mb/once metabase-enterprise.serialization.v2.load-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase-enterprise.serialization.test-util :as ts]
   [metabase-enterprise.serialization.v2.extract :as serdes.extract]
   [metabase-enterprise.serialization.v2.ingest :as serdes.ingest]
   [metabase-enterprise.serialization.v2.load :as serdes.load]
   [metabase.models
    :refer [Action Card Collection Dashboard DashboardCard Database Field
            FieldValues LegacyMetric NativeQuerySnippet Segment Table Timeline
            TimelineEvent User]]
   [metabase.models.action :as action]
   [metabase.models.serialization :as serdes]
   [metabase.test :as mt]
   [metabase.util :as u]
   [metabase.util.malli.schema :as ms]
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
  (let [mapped (into {} (for [entity (vec extractions)]
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
      (ts/with-dbs [source-db dest-db]
        (testing "extraction succeeds"
          (ts/with-db source-db
            (ts/create! Collection :name "Basic Collection" :entity_id eid1)
            (reset! serialized (into [] (serdes.extract/extract {})))
            (is (some (fn [{[{:keys [model id]}] :serdes/meta}]
                        (and (= model "Collection") (= id eid1)))
                      @serialized))))

        (testing "loading into an empty database succeeds"
          (ts/with-db dest-db
            (serdes.load/load-metabase! (ingestion-in-memory @serialized))
            (let [colls (t2/select Collection)]
              (is (= 1 (count colls)))
              (is (= "Basic Collection" (:name (first colls))))
              (is (= eid1               (:entity_id (first colls)))))))

        (testing "loading again into the same database does not duplicate"
          (ts/with-db dest-db
            (serdes.load/load-metabase! (ingestion-in-memory @serialized))
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
      (ts/with-dbs [source-db dest-db]
        (testing "serialization of the three collections"
          (ts/with-db source-db
            (reset! parent     (ts/create! Collection :name "Parent Collection" :location "/"))
            (reset! child      (ts/create! Collection
                                           :name "Child Collection"
                                           :location (format "/%d/" (:id @parent))))
            (reset! grandchild (ts/create! Collection
                                           :name "Grandchild Collection"
                                           :location (format "/%d/%d/" (:id @parent) (:id @child))))
            (reset! serialized (into [] (serdes.extract/extract {})))))

        (testing "deserialization into a database that already has the parent, but with a different ID"
          (ts/with-db dest-db
            (ts/create! Collection :name "Unrelated Collection")
            (ts/create! Collection :name "Parent Collection" :location "/" :entity_id (:entity_id @parent))
            (serdes.load/load-metabase! (ingestion-in-memory @serialized))
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
          f2s        (atom nil)
          f3s        (atom nil)]
      (ts/with-dbs [source-db dest-db]
        (testing "serializing the two databases"
          (ts/with-db source-db
            (reset! db1s (ts/create! Database :name "db1"))
            (reset! t1s  (ts/create! Table    :name "posts" :db_id (:id @db1s)))
            (reset! db2s (ts/create! Database :name "db2"))
            (reset! t2s  (ts/create! Table    :name "posts" :db_id (:id @db2s))) ; Deliberately the same name!
            (reset! f1s  (ts/create! Field    :name "Target Field" :table_id (:id @t1s)))
            (reset! f2s  (ts/create! Field    :name "Foreign Key"  :table_id (:id @t2s) :fk_target_field_id (:id @f1s)))
            (reset! f3s  (ts/create! Field    :name "Nested Field"   :table_id (:id @t1s) :parent_id (:id @f1s)))
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
                      (u/seek #(and (-> % :serdes/meta last :model (= "Field"))
                                    (-> % :name (= "Foreign Key"))))
                      :fk_target_field_id))))

        (testing "Parent field references are serialized as a field path"
          (is (= ["db1" nil "posts" "Target Field"]
                 (->> @serialized
                      (u/seek #(and (-> % :serdes/meta last :model (= "Field"))
                                    (-> % :name (= "Nested Field"))))
                      :parent_id))))

        (testing "deserialization works properly, keeping the same-named tables apart"
          (ts/with-db dest-db
            (serdes.load/load-metabase! (ingestion-in-memory @serialized))
            (reset! db1d (t2/select-one Database :name (:name @db1s)))
            (reset! db2d (t2/select-one Database :name (:name @db2s)))

            (is (= 3 (t2/count Database)))
            (is (every? #(= "complete" (:initial_sync_status %)) (t2/select Database)))
            (is (= #{"db1" "db2" "test-data"}
                   (t2/select-fn-set :name Database)))
            (is (= #{(:id @db1d) (:id @db2d)}
                   (t2/select-fn-set :db_id Table :name "posts")))
            (is (t2/exists? Table :name "posts" :db_id (:id @db1d)))
            (is (t2/exists? Table :name "posts" :db_id (:id @db2d)))
            (is (= (t2/select-one-fn :id Field :name (:name @f1s))
                   (t2/select-one-fn :fk_target_field_id Field :name (:name @f2s))))
            (is (= (t2/select-one-fn :id Field :name (:name @f1s))
                   (t2/select-one-fn :parent_id Field :name (:name @f3s))))))))))

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

      (ts/with-dbs [source-db dest-db]
        (testing "serializing the original database, table, field and card"
          (ts/with-db source-db
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
          (ts/with-db dest-db
            ;; A different database and tables, so the IDs don't match.
            (reset! db2d    (ts/create! Database :name "other-db"))
            (reset! table2d (ts/create! Table    :name "orders" :db_id (:id @db2d)))
            (reset! field2d (ts/create! Field    :name "subtotal" :table_id (:id @table2d)))
            (reset! user1d  (ts/create! User  :first_name "Tom" :last_name "Scholz" :email "tom@bost.on"))

            ;; Load the serialized content.
            (serdes.load/load-metabase! (ingestion-in-memory @serialized))

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


      (ts/with-dbs [source-db dest-db]
        (testing "serializing the original database, table, field and card"
          (ts/with-db source-db
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
          (ts/with-db dest-db
            ;; A different database and tables, so the IDs don't match.
            (reset! db2d    (ts/create! Database :name "other-db"))
            (reset! table2d (ts/create! Table    :name "orders" :db_id (:id @db2d)))
            (reset! field2d (ts/create! Field    :name "subtotal" :table_id (:id @table2d)))
            (reset! user1d  (ts/create! User  :first_name "Tom" :last_name "Scholz" :email "tom@bost.on"))

            ;; Load the serialized content.
            (serdes.load/load-metabase! (ingestion-in-memory @serialized))

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


      (ts/with-dbs [source-db dest-db]
        (testing "serializing the original database, table, field and card"
          (ts/with-db source-db
            (reset! coll1s   (ts/create! Collection :name "pop! minis"))
            (reset! db1s     (ts/create! Database :name "my-db"))
            (reset! table1s  (ts/create! Table :name "orders" :db_id (:id @db1s)))
            (reset! field1s  (ts/create! Field :name "subtotal"    :table_id (:id @table1s)))
            (reset! user1s   (ts/create! User  :first_name "Tom" :last_name "Scholz" :email "tom@bost.on"))
            (reset! metric1s (ts/create! LegacyMetric :table_id (:id @table1s) :name "Revenue"
                                         :definition {:source-table (:id @table1s)
                                                      :aggregation [[:sum [:field (:id @field1s) nil]]]}
                                         :creator_id (:id @user1s)))
            (reset! serialized (into [] (serdes.extract/extract {})))))

        (testing "exported form is properly converted"
          (is (= {:source-table ["my-db" nil "orders"]
                  :aggregation [[:sum [:field ["my-db" nil "orders" "subtotal"] nil]]]}
                 (-> @serialized
                     (by-model "LegacyMetric")
                     first
                     :definition))))

        (testing "deserializing adjusts the IDs properly"
          (ts/with-db dest-db
            ;; A different database and tables, so the IDs don't match.
            (reset! db2d    (ts/create! Database :name "other-db"))
            (reset! table2d (ts/create! Table    :name "customers" :db_id (:id @db2d)))
            (reset! field2d (ts/create! Field    :name "age" :table_id (:id @table2d)))
            (reset! user1d  (ts/create! User  :first_name "Tom" :last_name "Scholz" :email "tom@bost.on"))

            ;; Load the serialized content.
            (serdes.load/load-metabase! (ingestion-in-memory @serialized))

            ;; Fetch the relevant bits
            (reset! db1d     (t2/select-one Database :name "my-db"))
            (reset! table1d  (t2/select-one Table :name "orders"))
            (reset! field1d  (t2/select-one Field :table_id (:id @table1d) :name "subtotal"))
            (reset! metric1d (t2/select-one LegacyMetric :name "Revenue"))

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

#_{:clj-kondo/ignore [:metabase/i-like-making-cams-eyes-bleed-with-horrifically-long-tests]}
(deftest dashboard-card-test
  ;; DashboardCard.parameter_mappings and Card.parameter_mappings are JSON-encoded lists of parameter maps, which
  ;; contain field IDs - these need to be converted to a portable form and read back in.
  ;; DashboardCard.visualization_settings contains JSON with several places where IDs are embedded.
  ;; This test has a database, table and fields, that exist on both sides with different IDs, and expects a Card and
  ;; DashboardCard to be correctly loaded with the dest IDs.
  (testing "parameter_mappings are portable"
    (let [serialized (atom nil)
          coll1s     (atom nil)
          db1s       (atom nil)
          table1s    (atom nil)
          field1s    (atom nil)
          field2s    (atom nil)
          field3s    (atom nil)
          dash1s     (atom nil)
          dash2s     (atom nil)
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


      (ts/with-dbs [source-db dest-db]
        (testing "serializing the original database, table, field and card"
          (ts/with-db source-db
            (reset! coll1s   (ts/create! Collection :name "pop! minis"))
            (reset! db1s     (ts/create! Database :name "my-db"))
            (reset! table1s  (ts/create! Table :name "orders" :db_id (:id @db1s)))
            (reset! field1s  (ts/create! Field :name "subtotal" :table_id (:id @table1s)))
            (reset! field2s  (ts/create! Field :name "invoice" :table_id (:id @table1s)))
            (reset! field3s  (ts/create! Field :name "discount" :table_id (:id @table1s)))
            (reset! user1s   (ts/create! User  :first_name "Tom" :last_name "Scholz" :email "tom@bost.on"))
            (reset! dash1s   (ts/create! Dashboard :name "My Dashboard" :collection_id (:id @coll1s) :creator_id (:id @user1s)))
            (reset! dash2s   (ts/create! Dashboard :name "Linked dashboard" :collection_id (:id @coll1s) :creator_id (:id @user1s)))
            (let [columns           [{:name     "SOME_FIELD"
                                      :fieldRef [:field (:id @field1s) nil]
                                      :enabled  true}
                                     {:name     "sum"
                                      :fieldRef [:field "sum" {:base-type :type/Float}]
                                      :enabled  true}
                                     {:name     "count"
                                      :fieldRef [:field "count" {:base-type :type/BigInteger}]
                                      :enabled  true}
                                     {:name     "Average order total"
                                      :fieldRef [:field "Average order total" {:base-type :type/Float}]
                                      :enabled  true}]
                  mapping-id        (format "[\"dimension\",[\"fk->\",[\"field\",%d,null],[\"field\",%d,null]]]" (:id @field1s) (:id @field2s))
                  mapping-dimension [:dimension [:field (:id @field2s) {:source-field (:id @field1s)}]]]
              (reset! card1s   (ts/create! Card :name "The Card" :database_id (:id @db1s) :table_id (:id @table1s)
                                           :collection_id (:id @coll1s) :creator_id (:id @user1s)
                                           :visualization_settings
                                           {:table.pivot_column "SOURCE"
                                            :table.cell_column  "sum"
                                            :table.columns      columns
                                            :column_settings
                                            {(str "[\"ref\",[\"field\"," (:id @field2s) ",null]]") {:column_title "Locus"}}}
                                           :parameter_mappings [{:parameter_id "12345678"
                                                                 :target       [:dimension [:field (:id @field1s) {:source-field (:id @field2s)}]]}]))
              (reset! dashcard1s (ts/create! DashboardCard :dashboard_id (:id @dash1s) :card_id (:id @card1s)
                                             :visualization_settings
                                             {:table.pivot_column "SOURCE"
                                              :table.cell_column  "sum"
                                              :table.columns      columns
                                              :column_settings
                                              {(str "[\"ref\",[\"field\"," (:id @field1s) ",null]]")
                                               {:click_behavior {:type     "link"
                                                                 :linkType "dashboard"
                                                                 :targetId (:id @dash2s)}}
                                               (str "[\"ref\",[\"field\"," (:id @field2s) ",null]]")
                                               {:column_title "Locus"
                                                :click_behavior
                                                {:type     "link"
                                                 :linkType "question"
                                                 :targetId (:id @card1s)
                                                 :parameterMapping
                                                 {mapping-id {:id     mapping-id
                                                              :source {:type "column" :id "Category_ID" :name "Category ID"}
                                                              :target {:type "dimension" :id mapping-id :dimension mapping-dimension}}}}}
                                               (str "[\"ref\",[\"field\"," (:id @field3s) ",null]]")
                                               {:click_behavior
                                                {:type     "link"
                                                 :linkType "question"
                                                 :targetId (:id @card1s)
                                                 :parameterMapping
                                                 {"qweqwe" {:id     "qweqwe"
                                                            :source {:id "DISCOUNT" :name "Discount" :type "column"}
                                                            :target {:id "amount_between" :type "variable"}}}}}}
                                              :click_behavior     {:type     "link"
                                                                   :linkType "question"
                                                                   :targetId (:id @card1s)}}
                                             :parameter_mappings [{:parameter_id "deadbeef"
                                                                   :card_id      (:id @card1s)
                                                                   :target       [:dimension [:field (:id @field1s) {:source-field (:id @field2s)}]]}])))

            (reset! serialized (into [] (serdes.extract/extract {})))
            (let [card (-> @serialized (by-model "Card") first)
                  dash (-> @serialized (by-model "Dashboard") first)]
              (testing "exported :parameter_mappings are properly converted"
                (is (= [{:parameter_id "12345678"
                         :target       [:dimension [:field ["my-db" nil "orders" "subtotal"]
                                                    {:source-field ["my-db" nil "orders" "invoice"]}]]}]
                       (:parameter_mappings card)))
                (is (=? [{:parameter_mappings [{:parameter_id "deadbeef"
                                                :card_id      (:entity_id @card1s)
                                                :target       [:dimension [:field ["my-db" nil "orders" "subtotal"]
                                                                           {:source-field ["my-db" nil "orders" "invoice"]}]]}]}]
                        (:dashcards dash))))

              (testing "exported :visualization_settings are properly converted"
                (let [exp-card     {:table.pivot_column "SOURCE"
                                    :table.cell_column  "sum"
                                    :table.columns
                                    [{:name     "SOME_FIELD"
                                      :fieldRef [:field ["my-db" nil "orders" "subtotal"] nil]
                                      :enabled  true}
                                     {:name     "sum"
                                      :fieldRef [:field "sum" {:base-type :type/Float}]
                                      :enabled  true}
                                     {:name     "count"
                                      :fieldRef [:field "count" {:base-type :type/BigInteger}]
                                      :enabled  true}
                                     {:name     "Average order total"
                                      :fieldRef [:field "Average order total" {:base-type :type/Float}]
                                      :enabled  true}]
                                    :column_settings
                                    {"[\"ref\",[\"field\",[\"my-db\",null,\"orders\",\"invoice\"],null]]" {:column_title "Locus"}}}
                      dimension    [:dimension [:field ["my-db" nil "orders" "invoice"] {:source-field ["my-db" nil "orders" "subtotal"]}]]
                      dimension-id "[\"dimension\",[\"fk->\",[\"field\",[\"my-db\",null,\"orders\",\"subtotal\"],null],[\"field\",[\"my-db\",null,\"orders\",\"invoice\"],null]]]"
                      exp-dashcard (-> exp-card
                                       (assoc :click_behavior {:type     "link"
                                                               :linkType "question"
                                                               :targetId (:entity_id @card1s)})
                                       (assoc-in [:column_settings
                                                  "[\"ref\",[\"field\",[\"my-db\",null,\"orders\",\"subtotal\"],null]]"
                                                  :click_behavior]
                                                 {:type     "link"
                                                  :linkType "dashboard"
                                                  :targetId (:entity_id @dash2s)})
                                       (assoc-in [:column_settings
                                                  "[\"ref\",[\"field\",[\"my-db\",null,\"orders\",\"invoice\"],null]]"
                                                  :click_behavior]
                                                 {:type     "link"
                                                  :linkType "question"
                                                  :targetId (:entity_id @card1s)
                                                  :parameterMapping
                                                  {dimension-id
                                                   {:id     dimension-id
                                                    :source {:type "column" :id "Category_ID" :name "Category ID"}
                                                    :target {:type "dimension" :id dimension-id :dimension dimension}}}})
                                       (assoc-in [:column_settings
                                                  "[\"ref\",[\"field\",[\"my-db\",null,\"orders\",\"discount\"],null]]"
                                                  :click_behavior]
                                                 {:type "link"
                                                  :linkType "question"
                                                  :targetId (:entity_id @card1s)
                                                  :parameterMapping
                                                  {"qweqwe" {:id "qweqwe"
                                                             :source {:id "DISCOUNT" :name "Discount" :type "column"}
                                                             :target {:id "amount_between" :type "variable"}}}}))]
                  (is (= exp-card
                         (:visualization_settings card)))
                  (is (= exp-dashcard
                         (-> dash :dashcards first :visualization_settings))))))))


        (testing "deserializing adjusts the IDs properly"
          (ts/with-db dest-db
            ;; A different database and tables, so the IDs don't match.
            (reset! db2d    (ts/create! Database :name "other-db"))
            (reset! table2d (ts/create! Table    :name "customers" :db_id (:id @db2d)))
            (reset! field3d (ts/create! Field    :name "age" :table_id (:id @table2d)))
            (ts/create! Field :name "name" :table_id (:id @table2d))
            (ts/create! Field :name "address" :table_id (:id @table2d))
            (reset! user1d  (ts/create! User  :first_name "Tom" :last_name "Scholz" :email "tom@bost.on"))

            ;; Load the serialized content.
            (serdes.load/load-metabase! (ingestion-in-memory @serialized))

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

      (ts/with-dbs [source-db dest-db]
        (testing "serialize correctly"
          (ts/with-db source-db
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
                (is (malli= [:map
                             [:serdes/meta                 [:= [{:model "Timeline"
                                                                 :id    (:entity_id timeline1)
                                                                 :label "some_events"}]]]
                             [:archived                    [:= false]]
                             [:collection_id               [:= (:entity_id @coll1s)]]
                             [:name                        [:= "Some events"]]
                             [:creator_id                  [:= "tom@bost.on"]]
                             [:created_at                  (ms/InstanceOfClass OffsetDateTime)]
                             [:entity_id                   [:= (:entity_id timeline1)]]
                             [:description                 [:maybe :string]]
                             [:events                      [:sequential
                                                            [:map
                                                             [:timezone                    :string]
                                                             [:time_matters                :boolean]
                                                             [:name                        :string]
                                                             [:archived                    :boolean]
                                                             [:description                 [:maybe :string]]
                                                             [:creator_id                  :string]
                                                             [:created_at                  (ms/InstanceOfClass OffsetDateTime)]
                                                             [:timestamp                   :string]
                                                             [:icon {:optional true}       [:maybe :string]]
                                                             [:updated_at {:optional true} (ms/InstanceOfClass OffsetDateTime)]]]]
                             [:updated_at {:optional true} (ms/InstanceOfClass OffsetDateTime)]
                             [:icon {:optional true}       [:maybe :string]]
                             [:default {:optional true}    :boolean]]
                            timeline1))
                (is (= 2 (-> timeline1 :events count)))
                (is (= 1 (-> timeline2 :events count)))))))

        (testing "deserializing merges events properly"
          (ts/with-db dest-db
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
            (serdes.load/load-metabase! (ingestion-in-memory @serialized))

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

      (ts/with-dbs [source-db dest-db]
        (testing "serializing the original entities"
          (ts/with-db source-db
            (reset! user1s    (ts/create! User :first_name "Tom" :last_name "Scholz" :email "tom@bost.on"))
            (reset! user2s    (ts/create! User :first_name "Neil"  :last_name "Peart"   :email "neil@rush.yyz"))
            (reset! metric1s  (ts/create! LegacyMetric
                                          :name "Large Users"
                                          :table_id   (mt/id :venues)
                                          :creator_id (:id @user1s)
                                          :definition {:aggregation [[:count]]}))
            (reset! metric2s  (ts/create! LegacyMetric
                                          :name "Support Headaches"
                                          :table_id   (mt/id :venues)
                                          :creator_id (:id @user2s)
                                          :definition {:aggregation [[:count]]}))
            (reset! serialized (into [] (serdes.extract/extract {})))))

        (testing "exported form is properly converted"
          (is (= "tom@bost.on"
                 (-> @serialized
                     (by-model "LegacyMetric")
                     first
                     :creator_id))))

        (testing "deserializing finds the matching user and synthesizes the missing one"
          (ts/with-db dest-db
            ;; Create another random user to change the user IDs.
            (ts/create! User   :first_name "Gideon" :last_name "Nav" :email "griddle@ninth.tomb")
            ;; Likewise, create some other metrics.
            (ts/create! LegacyMetric :name "Other metric A" :table_id (mt/id :venues))
            (ts/create! LegacyMetric :name "Other metric B" :table_id (mt/id :venues))
            (ts/create! LegacyMetric :name "Other metric C" :table_id (mt/id :venues))
            (reset! user1d  (ts/create! User  :first_name "Tom" :last_name "Scholz" :email "tom@bost.on"))

            ;; Load the serialized content.
            (serdes.load/load-metabase! (ingestion-in-memory @serialized))

            ;; Fetch the relevant bits
            (reset! metric1d (t2/select-one LegacyMetric :name "Large Users"))
            (reset! metric2d (t2/select-one LegacyMetric :name "Support Headaches"))

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
          (serdes.load/load-metabase! (ingestion-in-memory @serialized))

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
            (is (some? (serdes.load/load-metabase! ingestion)))))

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
                                  (serdes.load/load-metabase! ingestion)))))))))

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
        (ts/create! User :first_name "Geddy" :last_name "Lee" :email "glee@rush.yyz")

        (testing "on extraction"
          (reset! extracted (serdes/extract-one "Card" {} @card1s))
          (is (= (:entity_id @snippet1s)
                 (-> @extracted :dataset_query :native :template-tags (get "snippet: things") :snippet-id))))

        (testing "when loading"
          (let [new-eid   (u/generate-nano-id)
                ingestion (ingestion-in-memory [(assoc @extracted :entity_id new-eid)])]
            (is (some? (serdes.load/load-metabase! ingestion)))
            (is (= (:id @snippet1s)
                   (-> (t2/select-one Card :entity_id new-eid)
                       :dataset_query
                       :native
                       :template-tags
                       (get "snippet: things")
                       :snippet-id)))))))))

(deftest snippet-with-unique-name
  (testing "Snippets with the same name should be replaced/removed on deserialization"
    (mt/with-empty-h2-app-db
      (let [unique-name "some snippet"
            snippet     (ts/create! NativeQuerySnippet :name unique-name)
            id1         (u/generate-nano-id)
            id2         (u/generate-nano-id)
            load!       #(serdes.load/load-metabase!
                          (ingestion-in-memory [(serdes/extract-one "NativeQuerySnippet" {} %)]))]

        (testing "setup is correct"
          (is (= (:entity_id snippet)
                 (t2/select-one-fn :entity_id NativeQuerySnippet :name unique-name))))

        (testing "loading snippet with same name will get it renamed"
          (load! (assoc snippet :entity_id id1))
          (testing "old snippet is in place"
            (is (= (:entity_id snippet)
                   (t2/select-one-fn :entity_id NativeQuerySnippet :name unique-name))))
          (testing "new one got new name"
            (is (= (str unique-name " (copy)")
                   (t2/select-one-fn :name NativeQuerySnippet :entity_id id1)))))

        (testing "can handle multiple name conflicts"
          (load! (assoc snippet :entity_id id2))
          (is (= (str unique-name " (copy) (copy)")
                 (t2/select-one-fn :name NativeQuerySnippet :entity_id id2))))

        (testing "will still update original one"
          (load! (assoc snippet :content "11 = 11"))
          (is (=? {:name unique-name
                   :content "11 = 11"}
                  (t2/select-one NativeQuerySnippet :entity_id (:entity_id snippet)))))))))

(deftest load-action-test
  (let [serialized (atom nil)
        eid (u/generate-nano-id)]
    (ts/with-dbs [source-db dest-db]
      (testing "extraction succeeds"
        (ts/with-db source-db
          (let [db       (ts/create! Database :name "my-db")
                card     (ts/create! Card
                                     :name "the query"
                                     :query_type :native
                                     :type :model
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
        (ts/with-db dest-db
          (serdes.load/load-metabase! (ingestion-in-memory @serialized))
          (let [action (t2/select-one Action :entity_id eid)]
            (is (some? action))
            (testing ":type should be a keyword again"
              (is (keyword? (:type action))))))))))

(deftest remove-dashcards-test
  (let [serialized (atom nil)
        dash1s     (atom nil)
        dash1d     (atom nil)
        dashcard1s (atom nil)
        dashcard2d (atom nil)
        tab1s      (atom nil)
        tab2d      (atom nil)]
    (ts/with-dbs [source-db dest-db]
      (testing "Serializing the original database"
        (ts/with-db source-db
          (reset! dash1s (ts/create! Dashboard :name "My Dashboard"))
          (reset! tab1s (ts/create! :model/DashboardTab :name "Tab 1" :dashboard_id (:id @dash1s)))
          (reset! dashcard1s (ts/create! DashboardCard :dashboard_id (:id @dash1s) :dashboard_tab_id (:id tab1s)))

          (reset! serialized (into [] (serdes.extract/extract {:no-settings true})))))

      (testing "New dashcard will be removed on load"
        (ts/with-db dest-db
          (reset! dash1d (ts/create! Dashboard :name "Weird Name" :entity_id (:entity_id @dash1s)))
          ;; A dashcard to be removed since it does not exist in serialized data
          (reset! dashcard2d (ts/create! DashboardCard :dashboard_id (:id @dash1d)))
          (reset! tab2d (ts/create! :model/DashboardTab :name "Tab 2" :dashboard_id (:id @dash1d)))

          ;; Load the serialized content.
          (serdes.load/load-metabase! (ingestion-in-memory @serialized))

          (reset! dash1d (-> (t2/select-one Dashboard :name "My Dashboard")
                             (t2/hydrate :dashcards)
                             (t2/hydrate :tabs)))

          (testing "Dashboard has correct number of dashcards"
            (is (= 1
                   (count (:dashcards @dash1d))))
            (is (= (:entity_id @dashcard1s)
                   (get-in @dash1d [:dashcards 0 :entity_id])))
            (is (not= (:entity_id @dashcard1s)
                      (:entity_id @dashcard2d))))

          (testing "Dashboard has correct number of tabs"
            (is (= 1
                   (count (:tabs @dash1d))))
            (is (= (:entity_id @tab1s)
                   (get-in @dash1d [:tabs 0 :entity_id])))
            (is (not= (:entity_id @tab1s)
                      (:entity_id @tab2d)))))))))

(deftest dashcard-series-test
  (ts/with-dbs [source-db dest-db]
    (testing "Dashcard series are updated and deleted correctly"
     (ts/with-db source-db
       (let [dash1s        (ts/create! :model/Dashboard :name "My Dashboard")
             tab1s         (ts/create! :model/DashboardTab :name "Tab 1" :dashboard_id (:id dash1s))
             card1s        (ts/create! Card :name "The Card")
             series-card1s (ts/create! Card :name "The Series Card 1")
             series-card2s (ts/create! Card :name "The Series Card 2")
             series-card3s (ts/create! Card :name "The Series Card 3")
             dashcard1s    (ts/create! :model/DashboardCard :card_id (:id card1s) :dashboard_id (:id dash1s) :dashboard_tab_id (:id tab1s))
             series1s      (ts/create! :model/DashboardCardSeries :dashboardcard_id (:id dashcard1s) :card_id (:id series-card1s) :position 0)
             series2s      (ts/create! :model/DashboardCardSeries :dashboardcard_id (:id dashcard1s) :card_id (:id series-card2s) :position 1)
             series3s      (ts/create! :model/DashboardCardSeries :dashboardcard_id (:id dashcard1s) :card_id (:id series-card3s) :position 2)
             extract1      (into [] (serdes.extract/extract {:no-settings true}))]
         (ts/with-db dest-db
           (serdes.load/load-metabase! (ingestion-in-memory extract1))
           (ts/with-db source-db
             ;; delete the 1st series and update the 3rd series to have position 0, and the 2nd series to have position 1
             (t2/delete! :model/DashboardCardSeries (:id series1s))
             (t2/update! :model/DashboardCardSeries (:id series3s) {:position 0})
             (t2/update! :model/DashboardCardSeries (:id series2s) {:position 1})
             (let [extract2 (into [] (serdes.extract/extract {:no-settings true :no-data-model true}))]
               (ts/with-db dest-db
                 (let [series-card2d        (t2/select-one :model/Card :entity_id (:entity_id series-card2s))
                       series-card3d        (t2/select-one :model/Card :entity_id (:entity_id series-card3s))
                       ;; we deleted the card that corresponds to `series1s`, so a shortcut is to get the one with position=0
                       series-to-be-deleted (t2/select-one :model/DashboardCardSeries :position 0)]
                   (testing "Sense check: there are 3 series for the dashboard card initially"
                     (is (= 3
                            (t2/count :model/DashboardCardSeries :dashboardcard_id (:dashboardcard_id series-to-be-deleted)))))
                   (serdes.load/load-metabase! (ingestion-in-memory extract2))
                   (let [dash1d (-> (t2/select-one :model/Dashboard :name "My Dashboard")
                                    (t2/hydrate [:dashcards :series]))]
                     (testing "Dashboard cards have the same entity ID"
                       (is (= (:entity_id dashcard1s)
                              (get-in dash1d [:dashcards 0 :entity_id]))))
                     (testing "The dashboard's series is updated"
                       (is (=? [{:id (:id series-card3d)}
                                {:id (:id series-card2d)}]
                               (get-in dash1d [:dashcards 0 :series]))))
                     (testing "Dashboard card series are correctly updated/deleted in the database"
                       (is (=? [{:position 0
                                 :card_id  (:id series-card3d)}
                                {:position 1
                                 :card_id  (:id series-card2d)}]
                               (->> (t2/select :model/DashboardCardSeries :dashboardcard_id (:dashboardcard_id series-to-be-deleted))
                                    (sort-by :position))))))))))))))))

(deftest dashcard-series-multi-test
  (ts/with-dbs [source-db dest-db]
    (testing "Dashcard series works correctly with one card in multiple series"
      (ts/with-db source-db
        (mt/with-temp [:model/Dashboard           dash {:name "Dashboard"}
                       :model/Card                c1   {:name "Card 1"}
                       :model/Card                c2   {:name "Card 2"}
                       :model/Card                sc   {:name "Series Card"}
                       :model/DashboardCard       dc1  {:card_id (:id c1) :dashboard_id (:id dash)}
                       :model/DashboardCard       dc2  {:card_id (:id c2) :dashboard_id (:id dash)}
                       :model/DashboardCardSeries _s1  {:dashboardcard_id (:id dc1) :card_id (:id sc) :position 0}
                       :model/DashboardCardSeries _s2  {:dashboardcard_id (:id dc2) :card_id (:id sc) :position 0}]
          (let [extract (into [] (serdes.extract/extract {:no-settings true}))]
            (ts/with-db dest-db
              (serdes.load/load-metabase! (ingestion-in-memory extract))
              (testing "Both series get imported even though they point at the same card"
                (is (= 2
                       (t2/count :model/DashboardCardSeries)))))))))))

(deftest extraneous-keys-test
  (let [serialized (atom nil)
        eid (u/generate-nano-id)]
    (ts/with-dbs [source-db dest-db]
      (testing "Sprinkle the source database with a variety of different models"
        (ts/with-db source-db
          (let [db         (ts/create! Database :name "my-db")
                card       (ts/create! Card
                                 :name "the query"
                                 :query_type :native
                                 :type :model
                                 :database_id (:id db)
                                 :dataset_query {:database (:id db)
                                                 :native   {:type   :native
                                                            :native {:query "wow"}}})
                parent     (ts/create! Collection :name "Parent Collection" :location "/")
                _child     (ts/create! Collection
                                       :name "Child Collection"
                                       :location (format "/%d/" (:id parent)))
                _action-id (action/insert! {:entity_id     eid
                                            :name          "the action"
                                            :model_id      (:id card)
                                            :type          :query
                                            :dataset_query "wow"
                                            :database_id   (:id db)})]
            (reset! serialized
                    (->> (serdes.extract/extract {})
                         ;; add an extra key to *every serialized model*
                         (map #(assoc % :my-extraneous-keeeeeey "foobar!!!!"))
                         (into []))))))
      (testing "The extraneous keys do not interfere with loading"
        (ts/with-db dest-db
          (is (serdes.load/load-metabase! (ingestion-in-memory @serialized))))))))

(deftest tx-test
  (mt/with-empty-h2-app-db
    (let [coll       (ts/create! Collection :name "coll")
          card       (ts/create! Card :name "card" :collection_id (:id coll))
          serialized (atom {})]
      (reset! serialized (->> (serdes.extract/extract {:no-settings   true
                                                       :no-data-model true
                                                       :targets       [["Collection" (:id coll)]]})
                              vec))
      (testing "Load completes successfully"
        (t2/update! Card {:id (:id card)} {:name (str "qwe_" (:name card))})
        (is (serdes.load/load-metabase! (ingestion-in-memory @serialized)))
        (is (= (:name card)
               (t2/select-one-fn :name Card :id (:id card)))))

      (testing "Partial load does not change the database"
        (t2/update! Collection {:id (:id coll)} {:name (str "qwe_" (:name coll))})
        (let [load-update! serdes/load-update!]
          (with-redefs [serdes/load-update! (fn [model adjusted local]
                                              ;; Collection is loaded first
                                              (if (= model "Card")
                                                (throw (ex-info "oops, error" {}))
                                                (load-update! model adjusted local)))]
            (is (thrown? clojure.lang.ExceptionInfo
                         (serdes.load/load-metabase! (ingestion-in-memory @serialized))))
            (is (= (str "qwe_" (:name coll))
                   (t2/select-one-fn :name Collection :id (:id card))))))))))

(deftest circular-links-test
  (mt/with-empty-h2-app-db
    (let [coll  (ts/create! Collection :name "coll")
          card  (ts/create! Card :name "card" :collection_id (:id coll))
          dash1 (ts/create! Dashboard :name "dash1" :collection_id (:id coll))
          dash2 (ts/create! Dashboard :name "dash2" :collection_id (:id coll))
          dash3 (ts/create! Dashboard :name "dash3" :collection_id (:id coll))
          dc1   (ts/create! DashboardCard :dashboard_id (:id dash1) :card_id (:id card)
                            :visualization_settings {:click_behavior {:type     "link"
                                                                      :linkType "dashboard"
                                                                      :targetId (:id dash2)}})
          dc2   (ts/create! DashboardCard :dashboard_id (:id dash2) :card_id (:id card)
                            :visualization_settings {:click_behavior {:type     "link"
                                                                      :linkType "dashboard"
                                                                      :targetId (:id dash3)}})
          dc3   (ts/create! DashboardCard :dashboard_id (:id dash2) :card_id (:id card)
                            :visualization_settings {:click_behavior {:type     "link"
                                                                      :linkType "dashboard"
                                                                      :targetId (:id dash1)}})
          ser   (into [] (serdes.extract/extract {:no-settings   true
                                                  :no-data-model true}))]
      (t2/delete! DashboardCard :id [:in (map :id [dc1 dc2 dc3])])
      (testing "Circular dependencies are loaded correctly"
        (is (serdes.load/load-metabase! (ingestion-in-memory ser)))
        (let [select-target #(-> % :visualization_settings :click_behavior :targetId)]
          (is (= (:id dash2)
                 (t2/select-one-fn select-target DashboardCard :entity_id (:entity_id dc1))))
          (is (= (:id dash3)
                 (t2/select-one-fn select-target DashboardCard :entity_id (:entity_id dc2))))
          (is (= (:id dash1)
                 (t2/select-one-fn select-target DashboardCard :entity_id (:entity_id dc3)))))))))

(deftest continue-on-error-test
  (let [change-ser    (fn [ser changes] ;; kind of like left-join, but right side is indexed
                        (vec (for [entity ser]
                               (merge entity (get changes (:entity_id entity))))))
        logs-extract  (fn [re logs]
                        (keep #(rest (re-find re %))
                              (map (fn [[_log-level _error message]] message) logs)))]
    (mt/with-empty-h2-app-db
      (mt/with-temp [Collection coll {:name "coll"}
                     Card       c1   {:name "card1" :collection_id (:id coll)}
                     Card       c2   {:name "card2" :collection_id (:id coll)}
                     Card       _c3  {:name "card3" :collection_id (:id coll)}]
        (testing "It's possible to skip a few errors during extract"
          (let [extract-one serdes/extract-one]
            (with-redefs [serdes/extract-one (fn [model-name opts instance]
                                               (if (= (:entity_id instance) (:entity_id c1))
                                                 (throw (ex-info "Skip me" {}))
                                                 (extract-one model-name opts instance)))]
              (is (= [["Card" (str (:id c1))]]
                     (logs-extract #"Skipping (\w+) (\d+)"
                                   (mt/with-log-messages-for-level ['metabase.models.serialization :warn]
                                     (let [ser            (vec (serdes.extract/extract {:no-settings       true
                                                                                        :no-data-model     true
                                                                                        :continue-on-error true}))
                                           {errors true
                                            others false} (group-by #(instance? Exception %) ser)]
                                       (is (= 1 (count errors)))
                                       (is (= 3 (count others)))))))))))
        (testing "It's possible to skip a few errors during load"
          (let [ser     (vec (serdes.extract/extract {:no-settings   true
                                                      :no-data-model true}))
                changed (change-ser ser {(:entity_id c2) {:collection_id "does-not-exist"}})]
            (is (= [["Failed to read file for Collection does-not-exist"]]
                   (logs-extract #"Skipping deserialization error: (.*) \{.*\}$"
                                 (mt/with-log-messages-for-level ['metabase-enterprise :warn]
                                   (let [report (serdes.load/load-metabase! (ingestion-in-memory changed) {:continue-on-error true})]
                                     (is (= 1 (count (:errors report))))
                                     (is (= 3 (count (:seen report)))))))))))))))

(deftest with-dbs-works-as-expected-test
  (ts/with-dbs [source-db dest-db]
    (ts/with-db source-db
      (mt/with-temp
        [:model/Card _ {:name "MY CARD"}]
        (testing "card is available in the source db"
          (is (some? (t2/select-one :model/Card :name "MY CARD"))))
        (ts/with-db dest-db
          (testing "card should not be available in the dest db"
           (is (nil? (t2/select-one :model/Card :name "MY CARD")))))))))

(deftest database-test
  (ts/with-dbs [source-db dest-db]
    (ts/with-db source-db
      (mt/with-temp [Database   _ {:name    "My Database"
                                   :details {:some "secret"}}]
        (testing "without :include-database-secrets"
          (let [extracted (vec (serdes.extract/extract {:no-settings true}))
                dbs       (filterv #(= "Database" (:model (last (serdes/path %)))) extracted)]
            (is (= 1 (count dbs)))
            (is (not-any? :details dbs))
            (ts/with-db dest-db
              (testing "loading still works even if there are no details"
                (serdes.load/load-metabase! (ingestion-in-memory extracted))
                (is (= {}
                       (t2/select-one-fn :details Database)))
                (testing "If we did not export details - it won't override existing data"
                  (t2/update! Database {:details {:other "secret"}})
                  (serdes.load/load-metabase! (ingestion-in-memory extracted))
                  (is (= {:other "secret"}
                         (t2/select-one-fn :details Database)))))))))

      (mt/with-temp [Database   _ {:name    "My Database"
                                   :details {:some "secret"}}]
        (testing "with :include-database-secrets"
          (let [extracted (vec (serdes.extract/extract {:no-settings true :include-database-secrets true}))
                dbs       (filterv #(= "Database" (:model (last (serdes/path %)))) extracted)]
            (is (= 1 (count dbs)))
            (is (every? :details dbs))
            (ts/with-db dest-db
              (testing "Details are imported if provided"
                (serdes.load/load-metabase! (ingestion-in-memory extracted))
                (is (= (:details (first dbs))
                       (t2/select-one-fn :details Database)))))))))))

(deftest unique-dimensions-test
  (ts/with-dbs [source-db dest-db]
    (ts/with-db source-db
      (mt/with-temp [:model/Dimension d1 {:name     "Some Dimension"
                                          :field_id (mt/id :venues :price)
                                          :type     "internal"}]
        (let [ser (vec (serdes.extract/extract {:no-settings true}))]
          (ts/with-db dest-db
            (mt/with-temp [:model/Dimension d2 {:name     "Absolutely Other Dimension"
                                                :field_id (mt/id :venues :price)
                                                :type     "internal"}]
              (serdes.load/load-metabase! (ingestion-in-memory ser))
              (is (= (:entity_id d1)
                     (t2/select-one-fn :entity_id :model/Dimension :field_id (mt/id :venues :price))))
              (is (= nil
                     (t2/select-one :model/Dimension :entity_id (:entity_id d2)))))))))))

(deftest nested-identity-hashes-test ;; tests serdes/nested behavior for identity hashes
  (let [ids (atom {})]
    (ts/with-dbs [source-db dest-db]
      (ts/with-db source-db
        (mt/with-temp [:model/Collection    coll {:name "Coll"}
                       :model/Dashboard     dash {:name "Dash"}
                       :model/Card          c1   {:name "Card 1"}
                       :model/DashboardCard dc1  {:dashboard_id (:id dash)
                                                  :card_id      (:id c1)}]
          (testing "Store deserialized data ids in preparation for test"
            (let [ser1 (vec (serdes.extract/extract {:no-settings true}))]
              (ts/with-db dest-db
                (serdes.load/load-metabase! (ingestion-in-memory ser1))
                (reset! ids
                        (vec
                         (for [[_name e] {:coll coll :dash dash :c1 c1 :dc1 dc1}]
                           [(t2/model e) (:id (t2/select-one (t2/model e) :entity_id (:entity_id e)))]))))))

          (testing "Convert everything to using identity hashes"
            (t2/update! :model/Collection :id (:id coll) {:entity_id (serdes/identity-hash coll)})
            (t2/update! :model/Dashboard :id (:id dash) {:entity_id (serdes/identity-hash dash)})
            (t2/update! :model/Card :id (:id c1) {:entity_id (serdes/identity-hash c1)})
            (t2/update! :model/DashboardCard :id (:id dc1) {:entity_id (serdes/identity-hash dc1)}))

          (is (= 8 (count (serdes/entity-id "Card"
                                            (t2/select-one [:model/Card :entity_id] :id (:id c1))))))

          (testing "Identity hashes end up in target db in place of entity ids"
            (let [ser2 (vec (serdes.extract/extract {:no-settings true :no-data-model true}))]
              (testing "\nWe exported identity hashes"
                (doseq [e ser2
                        :when (:entity_id e)]
                  (is (= 8 (count (-> e :entity_id str/trim))))))
              (ts/with-db dest-db
                (serdes.load/load-metabase! (ingestion-in-memory ser2))
                (testing "\nAll entities (including nested dashcards) were updated"
                  (doseq [[model id] @ids
                          :let       [e (t2/select-one model :id id)]]
                    (testing (format "%s has identity hash in the db" model)
                      (is (= (serdes/identity-hash e)
                             (serdes/entity-id (name model) e))))))))))))))
