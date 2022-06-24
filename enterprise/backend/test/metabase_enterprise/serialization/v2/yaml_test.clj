(ns metabase-enterprise.serialization.v2.yaml-test
  (:require [clojure.java.io :as io]
            [clojure.test :refer :all]
            [metabase-enterprise.serialization.test-util :as ts]
            [metabase-enterprise.serialization.v2.extract :as extract]
            [metabase-enterprise.serialization.v2.ingest :as ingest]
            [metabase-enterprise.serialization.v2.ingest.yaml :as ingest.yaml]
            [metabase-enterprise.serialization.v2.storage.yaml :as storage.yaml]
            [metabase.models.collection :refer [Collection]]
            [metabase.util.date-2 :as u.date]
            [metabase.test.generate :as test-gen]
            [reifyhealth.specmonstah.core :as rs]
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
            (is (= (-> (into {} (Collection (:id parent)))
                       (dissoc :id :location)
                       (assoc :parent_id nil))
                   (yaml/from-file (io/file dump-dir "Collection" parent-filename))))

            (is (= (-> (into {} (Collection (:id child)))
                       (dissoc :id :location)
                       (assoc :parent_id (:entity_id parent)))
                   (yaml/from-file (io/file dump-dir "Collection" child-filename))))))))))

(deftest basic-ingest-test
  (ts/with-random-dump-dir [dump-dir "serdesv2-"]
    (io/make-parents dump-dir "Collection" "fake") ; Prepare the right directories.
    (spit (io/file dump-dir "settings.yaml")
          (yaml/generate-string {:some-key "with string value"
                                 :another-key 7
                                 :blank-key nil}))
    (spit (io/file dump-dir "Collection" "fake-id+the_label.yaml")
          (yaml/generate-string {:some "made up" :data "here"}))
    (spit (io/file dump-dir "Collection" "no-label.yaml")
          (yaml/generate-string {:some "other" :data "in this one"}))

    (let [ingestable (ingest.yaml/ingest-yaml dump-dir)
          meta-maps  (into [] (ingest/ingest-list ingestable))
          exp-files  {{:model "Collection" :id "fake-id" :label "the_label"} {:some "made up" :data "here"}
                      {:model "Collection" :id "no-label"}                   {:some "other" :data "in this one"}
                      {:model "Setting" :id "some-key"}                      {:key :some-key :value "with string value"}
                      {:model "Setting" :id "another-key"}                   {:key :another-key :value 7}
                      {:model "Setting" :id "blank-key"}                     {:key :blank-key :value nil}}]
      (testing "the right set of file is returned by ingest-list"
        (is (= (set (keys exp-files))
               (set meta-maps))))

      (testing "individual reads in any order are correct"
        (doseq [meta-map (->> exp-files
                              keys
                              (repeat 10)
                              (into [] cat)
                              shuffle)]
          (is (= (-> exp-files
                     (get meta-map)
                     (assoc :serdes/meta meta-map))
                 (ingest/ingest-one ingestable meta-map))))))))

(deftest e2e-storage-ingestion-test
  (ts/with-random-dump-dir [dump-dir "serdesv2-"]
    (ts/with-empty-h2-app-db
      (test-gen/insert! {:collection [[100 {:refs {:personal_owner_id ::rs/omit}}]]
                         :database   [[10]]
                         :table      [[100]]})
      (let [extraction (into [] (extract/extract-metabase {}))
            entities   (reduce (fn [m {{:keys [model id]} :serdes/meta :as entity}]
                                 (assoc-in m [model id] entity))
                               {} extraction)]
        (is (= 100 (-> entities (get "Collection") vals count)))

        (testing "storage"
          (storage.yaml/store! (seq extraction) dump-dir)
          (testing "for Collections"
            (is (= 100 (count (dir->file-set (io/file dump-dir "Collection")))))
            (doseq [{:keys [entity_id slug] :as coll} (vals (get entities "Collection"))
                    :let [filename (str entity_id "+" slug ".yaml")]]
              (is (= (dissoc coll :serdes/meta)
                     (yaml/from-file (io/file dump-dir "Collection" filename))))))

          (testing "for Databases"
            (is (= 10 (count (dir->file-set (io/file dump-dir "Database")))))
            (doseq [{:keys [name] :as coll} (vals (get entities "Database"))
                    :let [filename (str name ".yaml")]]
              (is (= (-> coll
                         (dissoc :serdes/meta)
                         (update :created_at u.date/format)
                         (update :updated_at u.date/format))
                     (yaml/from-file (io/file dump-dir "Database" filename))))))

          (testing "for Tables"
            (is (= 100 (count (dir->file-set (io/file dump-dir "Table")))))
            (doseq [{:keys [name] :as coll} (vals (get entities "Table"))
                    :let [filename (str name ".yaml")]]
              (is (= (-> coll
                         (dissoc :serdes/meta)
                         (update :created_at u.date/format)
                         (update :updated_at u.date/format))
                     (yaml/from-file (io/file dump-dir "Table" filename))))))

          (testing "for settings"
            (is (= (into {} (for [{:keys [key value]} (vals (get entities "Setting"))]
                              [key value]))
                   (yaml/from-file (io/file dump-dir "settings.yaml"))))))

        (testing "ingestion"
          (let [ingestable (ingest.yaml/ingest-yaml dump-dir)]
            (testing "ingest-list is accurate"
              (is (= (into #{} (comp (map vals) cat (map :serdes/meta)) (vals entities))
                     (into #{} (ingest/ingest-list ingestable)))))

            (testing "each entity matches its in-memory original"
              (doseq [entity extraction]
                (is (= entity (ingest/ingest-one ingestable (:serdes/meta entity))))))))))))
