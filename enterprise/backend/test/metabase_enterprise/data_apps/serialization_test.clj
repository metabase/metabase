(ns metabase-enterprise.data-apps.serialization-test
  (:require
   [clojure.java.io :as io]
   [clojure.test :refer :all]
   [metabase-enterprise.serialization.core :as serialization]
   [metabase-enterprise.serialization.test-util :as ts]
   [metabase-enterprise.serialization.v2.extract :as extract]
   [metabase.models.serialization :as serdes]
   [metabase.test :as mt]
   [metabase.util.yaml :as yaml]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- insert-app! [& {:as extra}]
  (t2/insert-returning-instance! :model/DataApp
                                 (merge {:name          "sales-ops"
                                         :display_name  "Sales Ops"
                                         :bundle_path   "dist/index.js"
                                         :bundle        (.getBytes "console.log(1)" "UTF-8")
                                         :allowed_hosts ["https://api.example.com"]}
                                        extra)))

(defn- export!
  "Export the data apps, with the collection each owns (its serdes descendant) when `with-collections?`."
  [dir & {:keys [with-collections?]}]
  (serialization/store! (if with-collections?
                          (extract/extract {:targets        (mapv (fn [id] ["DataApp" id])
                                                                  (t2/select-pks-vec :model/DataApp))
                                            :no-settings    true
                                            :no-data-model  true})
                          (serdes/extract-all "DataApp" {}))
                        (serialization/file-writer dir)))

(defn- import! [dir]
  (serialization/load-metabase! (serialization/ingest-yaml dir)))

(defn- bundle-text [app]
  (String. ^bytes (t2/select-one-fn :bundle [:model/DataApp :bundle] :id (:id app)) "UTF-8"))

(defn- write-app-files!
  "Write a serialized data app with `yaml` fields and the `files` next to it under `data_apps/<dir>/`."
  [dump-dir dir yaml-fields files]
  (let [app-dir (io/file dump-dir "data_apps" dir)]
    (.mkdirs app-dir)
    (spit (io/file app-dir "data_app.yaml") (yaml/generate-string yaml-fields))
    (doseq [[path content] files
            :let [f (io/file app-dir ^String path)]]
      (io/make-parents f)
      (spit f content))))

(defn- app-yaml [entity-id slug & {:as extra}]
  (merge {:serdes/meta [{:model "DataApp" :id entity-id :label slug}]
          :entity_id   entity-id
          :slug        slug
          :name        "Sales"
          :path        "dist/index.js"}
         extra))

(deftest export-writes-the-manifest-and-the-bundle-file-test
  (mt/with-model-cleanup [:model/DataApp :model/Collection :model/PermissionsGroup]
    (ts/with-random-dump-dir [dump-dir "data-app-export-"]
      (let [app (insert-app! :description "Pipeline health")]
        (export! dump-dir)
        (testing "the manifest is a serdes YAML in the app's directory, keyed like a hand-written data_app.yaml"
          (is (= {:serdes/meta   [{:model "DataApp"}]
                  :entity_id     (:entity_id app)
                  :slug          "sales-ops"
                  :name          "Sales Ops"
                  :description   "Pipeline health"
                  :path          "dist/index.js"
                  :allowed_hosts ["https://api.example.com"]
                  :collection    (t2/select-one-fn :entity_id :model/Collection :id (:resource_collection_id app))}
                 (dissoc (yaml/from-file (io/file dump-dir "data_apps" "sales-ops" "data_app.yaml"))
                         :created_at))))
        (testing "the bundle is a plain file at its path next to the manifest"
          (is (= "console.log(1)"
                 (slurp (io/file dump-dir "data_apps" "sales-ops" "dist" "index.js")))))))))

(deftest round-trip-test
  (mt/with-premium-features #{:data-apps}
    (mt/with-model-cleanup [:model/DataApp :model/Collection :model/PermissionsGroup]
      (ts/with-random-dump-dir [dump-dir "data-app-round-trip-"]
        (let [app                  (insert-app!)
              collection-entity-id (t2/select-one-fn :entity_id :model/Collection :id (:resource_collection_id app))]
          (export! dump-dir :with-collections? true)
          (testing "the app's collection is exported with it, like any collection"
            (is (= [collection-entity-id]
                   (->> (file-seq (io/file dump-dir "collections"))
                        (filter #(.isFile ^java.io.File %))
                        (map (comp :entity_id yaml/from-file))))))
          (t2/delete! :model/DataApp (:id app))
          (import! dump-dir)
          (let [imported (t2/select-one :model/DataApp :entity_id (:entity_id app))]
            (is (=? {:name          "sales-ops"
                     :display_name  "Sales Ops"
                     :bundle_path   "dist/index.js"
                     :bundle_hash   (:bundle_hash app)
                     :allowed_hosts ["https://api.example.com"]}
                    imported))
            (is (= "console.log(1)" (bundle-text imported)))
            (testing "the import links the collection the manifest names and creates the permission group"
              (is (=? {:entity_id collection-entity-id :namespace :data-apps}
                      (t2/select-one :model/Collection :id (:resource_collection_id imported))))
              (is (t2/exists? :model/PermissionsGroup :id (:permission_group_id imported))))))))))

(deftest import-refuses-a-manifest-that-names-another-collection-test
  (mt/with-premium-features #{:data-apps}
    (mt/with-model-cleanup [:model/DataApp :model/Collection :model/PermissionsGroup]
      (ts/with-random-dump-dir [dump-dir "data-app-switch-"]
        (mt/with-temp [:model/Collection {other-entity-id :entity_id} {:name "Other" :namespace :data-apps}]
          (let [app (insert-app!)]
            (write-app-files! dump-dir "sales-ops" (app-yaml (:entity_id app) "sales-ops" :collection other-entity-id)
                              {"dist/index.js" "B"})
            (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Failed to load" (import! dump-dir)))
            (is (= (:resource_collection_id app)
                   (t2/select-one-fn :resource_collection_id :model/DataApp :id (:id app))))))))))

(deftest import-refuses-a-manifest-naming-a-collection-the-repository-lacks-test
  (mt/with-premium-features #{:data-apps}
    (mt/with-model-cleanup [:model/DataApp :model/Collection :model/PermissionsGroup]
      (ts/with-random-dump-dir [dump-dir "data-app-no-collection-"]
        (write-app-files! dump-dir "x" (app-yaml "pZrj7PDuz3vSWYYi0QFhd" "x" :collection "nosuchcollection00001")
                          {"dist/index.js" "B"})
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Collection 'nosuchcollection00001' was not found"
                              (import! dump-dir)))
        (is (not (t2/exists? :model/DataApp :entity_id "pZrj7PDuz3vSWYYi0QFhd")))))))

(deftest import-updates-in-place-and-keeps-local-state-test
  (mt/with-premium-features #{:data-apps}
    (mt/with-model-cleanup [:model/DataApp :model/Collection :model/PermissionsGroup]
      (ts/with-random-dump-dir [dump-dir "data-app-update-"]
        (let [app (insert-app! :enabled false)]
          (write-app-files! dump-dir "sales-ops" (app-yaml (:entity_id app) "sales-ops" :name "Renamed"
                                                           :path "./dist/index.js")
                            {"dist/index.js" "console.log(2)"})
          (import! dump-dir)
          (let [updated (t2/select-one :model/DataApp :id (:id app))]
            (is (=? {:display_name           "Renamed"
                     :enabled                false
                     :resource_collection_id (:resource_collection_id app)
                     :permission_group_id    (:permission_group_id app)}
                    updated))
            (is (= "console.log(2)" (bundle-text updated)))
            (is (not= (:bundle_hash app) (:bundle_hash updated)))))))))

(deftest import-rejects-invalid-apps-test
  (mt/with-premium-features #{:data-apps}
    (mt/with-model-cleanup [:model/DataApp :model/Collection :model/PermissionsGroup]
      (testing "a missing bundle file"
        (ts/with-random-dump-dir [dump-dir "data-app-missing-"]
          (write-app-files! dump-dir "x" (app-yaml "pZrj7PDuz3vSWYYi0QFhd" "x") {})
          (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Failed to load"
                                (import! dump-dir)))))
      (testing "a manifest field that fails validation"
        (ts/with-random-dump-dir [dump-dir "data-app-invalid-"]
          (write-app-files! dump-dir "x" (app-yaml "pZrj7PDuz3vSWYYi0QFhd" "Not A Slug")
                            {"dist/index.js" "BUNDLE"})
          (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Failed to load"
                                (import! dump-dir)))))
      (testing "a bundle path leaving the app's directory is never read"
        (ts/with-random-dump-dir [dump-dir "data-app-traversal-"]
          (write-app-files! dump-dir "x" (app-yaml "pZrj7PDuz3vSWYYi0QFhd" "x" :path "../../secret.js") {})
          (is (= "Invalid resource file path: ../../secret.js"
                 (try
                   (serialization/ingest-one (serialization/ingest-yaml dump-dir)
                                             [{:model "DataApp" :id "pZrj7PDuz3vSWYYi0QFhd"}])
                   nil
                   (catch clojure.lang.ExceptionInfo e
                     (ex-message (ex-cause e))))))))
      (is (not (t2/exists? :model/DataApp))))))

(deftest import-clears-an-omitted-description-test
  (mt/with-premium-features #{:data-apps}
    (mt/with-model-cleanup [:model/DataApp :model/Collection :model/PermissionsGroup]
      (ts/with-random-dump-dir [dump-dir "data-app-description-"]
        (let [app (insert-app! :description "Pipeline health")]
          (write-app-files! dump-dir "sales-ops" (app-yaml (:entity_id app) "sales-ops") {"dist/index.js" "B"})
          (import! dump-dir)
          (is (nil? (t2/select-one-fn :description :model/DataApp :id (:id app)))))))))

(deftest import-does-not-take-over-an-app-made-on-the-instance-test
  (mt/with-premium-features #{:data-apps}
    (mt/with-model-cleanup [:model/DataApp :model/Collection :model/PermissionsGroup]
      (ts/with-random-dump-dir [dump-dir "data-app-takeover-"]
        (let [app (insert-app!)]
          (write-app-files! dump-dir "sales-ops" (app-yaml "Ld3cXiYs9n8HP3q3FvC7R" "sales-ops") {"dist/index.js" "B"})
          (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Failed to load" (import! dump-dir)))
          (is (=? {:entity_id (:entity_id app)} (t2/select-one :model/DataApp :id (:id app)))))))))

(deftest export-includes-data-apps-test
  (mt/with-model-cleanup [:model/DataApp :model/Collection :model/PermissionsGroup]
    (let [app (insert-app!)]
      (is (some #(= [{:model "DataApp" :id (:entity_id app)}] (map (fn [m] (dissoc m :label)) (:serdes/meta %)))
                (into [] (extract/extract {:no-collections true :no-data-model true :no-settings true})))))))
