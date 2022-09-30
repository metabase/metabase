(ns metabase-enterprise.serialization.v2.storage.yaml-test
  (:require [clojure.java.io :as io]
            [clojure.test :refer :all]
            [metabase-enterprise.serialization.test-util :as ts]
            [metabase-enterprise.serialization.v2.extract :as extract]
            [metabase-enterprise.serialization.v2.storage.yaml :as storage.yaml]
            [metabase.models :refer [Collection Database Field FieldValues Table]]
            [metabase.models.serialization.base :as serdes.base]
            [toucan.db :as db]
            [yaml.core :as yaml]))

(defn- dir->file-set [dir]
  (->> dir
       .listFiles
       (filter #(.isFile %))
       (map #(.getName %))
       set))

(deftest basic-dump-test
  (ts/with-random-dump-dir [dump-dir "serdesv2-"]
    (ts/with-empty-h2-app-db
      (ts/with-temp-dpc [Collection [parent {:name "Some Collection"}]
                         Collection [child  {:name "Child Collection" :location (format "/%d/" (:id parent))}]]
        (let [export          (into [] (extract/extract-metabase nil))
              parent-filename (format "%s+some_collection.yaml"  (:entity_id parent))
              child-filename  (format "%s+child_collection.yaml" (:entity_id child))]
          (storage.yaml/store! export dump-dir)
          (testing "the right files in the right places"
            (is (= #{parent-filename child-filename}
                   (dir->file-set (io/file dump-dir "Collection")))
                "Entities go in subdirectories")
            (is (= #{"settings.yaml"}
                   (dir->file-set (io/file dump-dir)))
                "A few top-level files are expected"))

          (testing "the Collections properly exported"
            (is (= (-> (into {} (db/select-one Collection :id (:id parent)))
                       (dissoc :id :location)
                       (assoc :parent_id nil))
                   (yaml/from-file (io/file dump-dir "Collection" parent-filename))))

            (is (= (-> (into {} (db/select-one Collection :id (:id child)))
                       (dissoc :id :location)
                       (assoc :parent_id (:entity_id parent)))
                   (yaml/from-file (io/file dump-dir "Collection" child-filename))))))))))

(deftest embedded-slash-test
  (ts/with-random-dump-dir [dump-dir "serdesv2-"]
    (ts/with-empty-h2-app-db
      (ts/with-temp-dpc [Database    [db      {:name "My Company Data"}]
                         Table       [table   {:name "Customers" :db_id (:id db)}]
                         Field       [website {:name "Company/organization website" :table_id (:id table)}]
                         FieldValues [fc      {:field_id (:id website)}]]
        (let [export          (into [] (extract/extract-metabase nil))]
          (storage.yaml/store! export dump-dir)
          (testing "the right files in the right places"
            (is (= #{"Company__SLASH__organization website.yaml"}
                   (dir->file-set (io/file dump-dir "Database" "My Company Data" "Table" "Customers" "Field")))
                "Slashes in file names get escaped")
            (is (= #{"0.yaml"}
                   (dir->file-set (io/file dump-dir "Database" "My Company Data" "Table" "Customers"
                                           "Field" "Company__SLASH__organization website"
                                           "FieldValues")))
                "Slashes in parent directory names get escaped"))

          (testing "the Field was properly exported"
            (is (= (-> (into {} (serdes.base/extract-one "Field" {} (db/select-one 'Field :id (:id website))))
                       (dissoc :serdes/meta))
                   (-> (yaml/from-file (io/file dump-dir
                                                "Database" "My Company Data"
                                                "Table" "Customers"
                                                "Field" "Company__SLASH__organization website.yaml"))
                       (update :visibility_type keyword)
                       (update :base_type       keyword))))))))))
