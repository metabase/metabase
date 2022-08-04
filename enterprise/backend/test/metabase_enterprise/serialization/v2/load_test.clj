(ns metabase-enterprise.serialization.v2.load-test
  (:require [clojure.test :refer :all]
            [metabase-enterprise.serialization.test-util :as ts]
            [metabase-enterprise.serialization.v2.extract :as serdes.extract]
            [metabase-enterprise.serialization.v2.ingest :as serdes.ingest]
            [metabase-enterprise.serialization.v2.load :as serdes.load]
            [metabase.models :refer [Card Collection Dashboard DashboardCard Database Field Metric Pulse PulseChannel
                                     PulseChannelRecipient Segment Table User]]
            [metabase.models.serialization.base :as serdes.base]
            [metabase.models.serialization.hash :as serdes.hash]
            [toucan.db :as db]))

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
                          [(no-labels (serdes.base/serdes-path entity))
                           entity]))]
    (reify
      serdes.ingest/Ingestable
      (ingest-list [_]
        (keys mapped))
      (ingest-one [_ path]
        (or (get mapped (no-labels path))
            (throw (ex-info (format "Unknown ingestion target: %s" path)
                            {:path path :world mapped})))))))

;;; WARNING for test authors: [[extract/extract-metabase]] returns a lazy reducible value. To make sure you don't
;;; confound your tests with data from your dev appdb, remember to eagerly
;;; `(into [] (extract/extract-metabase ...))` in these tests.

(deftest load-basics-test
  (testing "a simple, fresh collection is imported"
    (let [serialized (atom nil)
          eid1       "0123456789abcdef_0123"]
      (ts/with-source-and-dest-dbs
        (testing "extraction succeeds"
          (ts/with-source-db
            (ts/create! Collection :name "Basic Collection" :entity_id eid1)
            (reset! serialized (into [] (serdes.extract/extract-metabase {})))
            (is (some (fn [{[{:keys [model id]}] :serdes/meta}]
                        (and (= model "Collection") (= id eid1)))
                      @serialized))))

        (testing "loading into an empty database succeeds"
          (ts/with-dest-db
            (serdes.load/load-metabase (ingestion-in-memory @serialized))
            (let [colls (db/select Collection)]
              (is (= 1 (count colls)))
              (is (= "Basic Collection" (:name (first colls))))
              (is (= eid1               (:entity_id (first colls)))))))

        (testing "loading again into the same database does not duplicate"
          (ts/with-dest-db
            (serdes.load/load-metabase (ingestion-in-memory @serialized))
            (let [colls (db/select Collection)]
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
            (reset! serialized (into [] (serdes.extract/extract-metabase {})))))

        (testing "deserialization into a database that already has the parent, but with a different ID"
          (ts/with-dest-db
            (ts/create! Collection :name "Unrelated Collection")
            (ts/create! Collection :name "Parent Collection" :location "/" :entity_id (:entity_id @parent))
            (serdes.load/load-metabase (ingestion-in-memory @serialized))
            (let [parent-dest     (db/select-one Collection :entity_id (:entity_id @parent))
                  child-dest      (db/select-one Collection :entity_id (:entity_id @child))
                  grandchild-dest (db/select-one Collection :entity_id (:entity_id @grandchild))]
              (is (some? parent-dest))
              (is (some? child-dest))
              (is (some? grandchild-dest))
              (is (not= (:id parent-dest) (:id @parent)) "should have different primary keys")
              (is (= 4 (db/count Collection)))
              (is (= "/"
                     (:location parent-dest)))
              (is (= (format "/%d/" (:id parent-dest))
                     (:location child-dest)))
              (is (= (format "/%d/%d/" (:id parent-dest) (:id child-dest))
                     (:location grandchild-dest))))))))))

(deftest deserialization-upsert-and-dupe-test
  (testing "basic collections with their names changing, one without entity_id:"
    (let [serialized (atom nil)
          c1a        (atom nil)
          c2a        (atom nil)
          c1b        (atom nil)
          c2b        (atom nil)]
      (ts/with-source-and-dest-dbs
        (testing "serializing the two collections"
          (ts/with-source-db
            (reset! c1b (ts/create! Collection :name "Renamed Collection 1"))
            (reset! c2b (ts/create! Collection :name "Collection 2 version 2"))
            (db/update! Collection (:id @c2b) {:entity_id nil})
            (reset! c2b (db/select-one Collection :id (:id @c2b)))
            (is (nil? (:entity_id @c2b)))
            (reset! serialized (into [] (serdes.extract/extract-metabase {})))))

        (testing "serialization should use identity hashes where no entity_id is defined"
          (is (= #{(:entity_id @c1b)
                   (serdes.hash/identity-hash @c2b)}
                 (ids-by-model @serialized "Collection"))))

        (testing "deserializing, the name change causes a duplicated collection"
          (ts/with-dest-db
            (reset! c1a (ts/create! Collection :name "Collection 1" :entity_id (:entity_id @c1b)))
            (reset! c2a (ts/create! Collection :name "Collection 2 version 1"))
            (db/update! Collection (:id @c2a) {:entity_id nil})
            (reset! c2a (db/select-one Collection :id (:id @c2a)))
            (is (nil? (:entity_id @c2b)))

            (serdes.load/load-metabase (ingestion-in-memory @serialized))
            (is (= 3 (db/count Collection)) "Collection 2 versions get duplicated, since the identity-hash changed")
            (is (= #{"Renamed Collection 1"
                     "Collection 2 version 1"
                     "Collection 2 version 2"}
                   (set (db/select-field :name Collection))))))))))

(deftest deserialization-database-table-field-test
  (testing "databases, tables and fields are nested in namespaces"
    (let [serialized (atom nil)
          db1s       (atom nil)
          db1d       (atom nil)
          db2s       (atom nil)
          db2d       (atom nil)
          t1s        (atom nil)
          t2s        (atom nil)]
      (ts/with-source-and-dest-dbs
        (testing "serializing the two collections"
          (ts/with-source-db
            (reset! db1s (ts/create! Database :name "db1"))
            (reset! t1s  (ts/create! Table    :name "posts" :db_id (:id @db1s)))
            (reset! db2s (ts/create! Database :name "db2"))
            (reset! t2s  (ts/create! Table    :name "posts" :db_id (:id @db2s))) ; Deliberately the same name!
            (reset! serialized (into [] (serdes.extract/extract-metabase {})))))

        (testing "serialization of databases is based on the :name"
          (is (= #{(:name @db1s) (:name @db2s) "test-data"} ; TODO I'm not sure where the `test-data` one comes from.
                 (ids-by-model @serialized "Database"))))

        (testing "tables reference their databases by name"
          (is (= #{(:name @db1s) (:name @db2s) "test-data"}
                 (->> @serialized
                      (filter #(-> % :serdes/meta last :model (= "Table")))
                      (map :db_id)
                      set))))

        (testing "deserialization works properly, keeping the same-named tables apart"
          (ts/with-dest-db
            (serdes.load/load-metabase (ingestion-in-memory @serialized))
            (reset! db1d (db/select-one Database :name (:name @db1s)))
            (reset! db2d (db/select-one Database :name (:name @db2s)))

            (is (= 3 (db/count Database)))
            (is (= #{"db1" "db2" "test-data"}
                   (db/select-field :name Database)))
            (is (= #{(:id @db1d) (:id @db2d)}
                   (db/select-field :db_id Table :name "posts")))
            (is (db/exists? Table :name "posts" :db_id (:id @db1d)))
            (is (db/exists? Table :name "posts" :db_id (:id @db2d)))))))))

(deftest pulse-channel-recipient-merging-test
  (testing "pulse channel recipients are listed as emails on a channel, then merged with the existing ones"
    (let [serialized (atom nil)
          u1s        (atom nil)
          u2s        (atom nil)
          u3s        (atom nil)
          pulse-s    (atom nil)
          pc1s       (atom nil)
          pc2s       (atom nil)
          pcr1s      (atom nil)
          pcr2s      (atom nil)

          u1d        (atom nil)
          u2d        (atom nil)
          u3d        (atom nil)
          pulse-d    (atom nil)
          pc1d       (atom nil)]
      (ts/with-source-and-dest-dbs
        (testing "serializing the pulse, channel and recipients"
          (ts/with-source-db
            (reset! u1s (ts/create! User :first_name "Alex"  :last_name "Lifeson" :email "alifeson@rush.yyz"))
            (reset! u2s (ts/create! User :first_name "Geddy" :last_name "Lee"     :email "glee@rush.yyz"))
            (reset! u3s (ts/create! User :first_name "Neil"  :last_name "Peart"   :email "neil@rush.yyz"))
            (reset! pulse-s (ts/create! Pulse :name "Heartbeat" :creator_id (:id @u1s)))
            (reset! pc1s    (ts/create! PulseChannel
                                        :pulse_id      (:id @pulse-s)
                                        :channel_type  :email
                                        :schedule_type :daily
                                        :schedule_hour 16))
            (reset! pc2s    (ts/create! PulseChannel
                                        :pulse_id      (:id @pulse-s)
                                        :channel_type  :slack
                                        :schedule_type :hourly))
            ;; Only Lifeson and Lee are recipients in the source.
            (reset! pcr1s  (ts/create! PulseChannelRecipient :pulse_channel_id (:id @pc1s) :user_id (:id @u1s)))
            (reset! pcr2s  (ts/create! PulseChannelRecipient :pulse_channel_id (:id @pc1s) :user_id (:id @u2s)))
            (reset! serialized (into [] (serdes.extract/extract-metabase {})))))

        (testing "recipients are serialized as :recipients [email] on the PulseChannel"
          (is (= #{["alifeson@rush.yyz" "glee@rush.yyz"]
                   []}
                 (set (map :recipients (by-model @serialized "PulseChannel"))))))

        (testing "deserialization merges the existing recipients with the new ones"
          (ts/with-dest-db
            ;; Users in a different order, so different IDs.
            (reset! u2d (ts/create! User :first_name "Geddy" :last_name "Lee"     :email "glee@rush.yyz"))
            (reset! u1d (ts/create! User :first_name "Alex"  :last_name "Lifeson" :email "alifeson@rush.yyz"))
            (reset! u3d (ts/create! User :first_name "Neil"  :last_name "Peart"   :email "neil@rush.yyz"))
            (reset! pulse-d (ts/create! Pulse :name "Heartbeat" :creator_id (:id @u1d) :entity_id (:entity_id @pulse-s)))
            (reset! pc1d    (ts/create! PulseChannel
                                        :entity_id     (:entity_id @pc1s)
                                        :pulse_id      (:id @pulse-d)
                                        :channel_type  :email
                                        :schedule_type :daily
                                        :schedule_hour 16))
            ;; Only Lee and Peart are recipients in the source.
            (ts/create! PulseChannelRecipient :pulse_channel_id (:id @pc1d) :user_id (:id @u2d))
            (ts/create! PulseChannelRecipient :pulse_channel_id (:id @pc1d) :user_id (:id @u3d))

            (is (= 2 (db/count PulseChannelRecipient)))
            (is (= #{(:id @u2d) (:id @u3d)}
                   (db/select-field :user_id PulseChannelRecipient)))

            (serdes.load/load-metabase (ingestion-in-memory @serialized))

            (is (= 3 (db/count PulseChannelRecipient)))
            (is (= #{(:id @u1d) (:id @u2d) (:id @u3d)}
                   (db/select-field :user_id PulseChannelRecipient)))))))))

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
            (reset! serialized (into [] (serdes.extract/extract-metabase {})))))

        (testing "the serialized form is as desired"
          (is (= {:type "query"
                  :query {:source-table ["my-db" nil "customers"]
                          :filter       [">=" [:field ["my-db" nil "customers" "age"] nil] 18]
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
            (reset! db1d    (db/select-one Database :name "my-db"))
            (reset! table1d (db/select-one Table :name "customers"))
            (reset! field1d (db/select-one Field :table_id (:id @table1d) :name "age"))
            (reset! card1d  (db/select-one Card  :name "Example Card"))

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
            (reset! serialized (into [] (serdes.extract/extract-metabase {})))))

        (testing "exported form is properly converted"
          (is (= {:source-table ["my-db" nil "customers"]
                  :aggregation [[:count]]
                  :filter ["<" [:field ["my-db" nil "customers" "age"] nil] 18]}
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
            (reset! db1d    (db/select-one Database :name "my-db"))
            (reset! table1d (db/select-one Table :name "customers"))
            (reset! field1d (db/select-one Field :table_id (:id @table1d) :name "age"))
            (reset! seg1d   (db/select-one Segment :name "Minors"))

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
            (reset! serialized (into [] (serdes.extract/extract-metabase {})))))

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
            (reset! db1d     (db/select-one Database :name "my-db"))
            (reset! table1d  (db/select-one Table :name "orders"))
            (reset! field1d  (db/select-one Field :table_id (:id @table1d) :name "subtotal"))
            (reset! metric1d (db/select-one Metric :name "Revenue"))

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

            (reset! serialized (into [] (serdes.extract/extract-metabase {})))
            (let [card     (-> @serialized (by-model "Card") first)
                  dashcard (-> @serialized (by-model "DashboardCard") first)]
              (testing "exported :parameter_mappings are properly converted"
                (is (= [{:parameter_id "12345678"
                         :target [:dimension [:field ["my-db" nil "orders" "subtotal"]
                                              {:source-field ["my-db" nil "orders" "invoice"]}]]}]
                       (:parameter_mappings card)))
                (is (= [{:parameter_id "deadbeef"
                         :card_id (:entity_id @card1s)
                         :target [:dimension [:field ["my-db" nil "orders" "subtotal"]
                                              {:source-field ["my-db" nil "orders" "invoice"]}]]}]
                       (:parameter_mappings dashcard))))

              (testing "exported :visualization_settings are properly converted"
                (let [expected {:table.pivot_column "SOURCE"
                                :table.cell_column "sum"
                                :table.columns
                                [{:name "SOME_FIELD"
                                  :fieldRef ["field" ["my-db" nil "orders" "subtotal"] nil]
                                  :enabled true}
                                 {:name "sum"
                                  :fieldRef ["field" "sum" {:base-type "type/Float"}]
                                  :enabled true}
                                 {:name "count"
                                  :fieldRef ["field" "count" {:base-type "type/BigInteger"}]
                                  :enabled true}
                                 {:name "Average order total"
                                  :fieldRef ["field" "Average order total" {:base-type "type/Float"}]
                                  :enabled true}]
                                :column_settings
                                {"[\"ref\",[\"field\",[\"my-db\",null,\"orders\",\"invoice\"],null]]" {:column_title "Locus"}}}]
                  (is (= expected
                         (:visualization_settings card)))
                  (is (= expected
                         (:visualization_settings dashcard))))))))



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
            (reset! db1d       (db/select-one Database :name "my-db"))
            (reset! table1d    (db/select-one Table :name "orders"))
            (reset! field1d    (db/select-one Field :table_id (:id @table1d) :name "subtotal"))
            (reset! field2d    (db/select-one Field :table_id (:id @table1d) :name "invoice"))
            (reset! dash1d     (db/select-one Dashboard :name "My Dashboard"))
            (reset! card1d     (db/select-one Card :name "The Card"))
            (reset! dashcard1d (db/select-one DashboardCard :card_id (:id @card1d) :dashboard_id (:id @dash1d)))

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
