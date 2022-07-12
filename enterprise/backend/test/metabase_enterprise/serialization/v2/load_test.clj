(ns metabase-enterprise.serialization.v2.load-test
  (:require [clojure.test :refer :all]
            [metabase-enterprise.serialization.test-util :as ts]
            [metabase-enterprise.serialization.v2.extract :as serdes.extract]
            [metabase-enterprise.serialization.v2.ingest :as serdes.ingest]
            [metabase-enterprise.serialization.v2.load :as serdes.load]
            [metabase.models :refer [Collection Database Table]]
            [metabase.models.serialization.base :as serdes.base]
            [metabase.models.serialization.hash :as serdes.hash]
            [toucan.db :as db]))

(defn- no-labels [path]
  (mapv #(dissoc % :label) path))

(defn- ids-by-model [entities model-name]
  (->> entities
       (map (comp last :serdes/meta))
       (filter #(= model-name (:model %)))
       (map :id)
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
          t1d        (atom nil)
          t2s        (atom nil)
          t2d        (atom nil)]
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
