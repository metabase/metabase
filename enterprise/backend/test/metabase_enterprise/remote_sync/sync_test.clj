(ns metabase-enterprise.remote-sync.sync-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.remote-sync.content :as content]
   [metabase-enterprise.remote-sync.tasks :as tasks]
   [metabase-enterprise.remote-sync.test-util :as remote-sync.tu]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(deftest push-test
  (remote-sync.tu/with-repository [url]
    (remote-sync.tu/with-remote-sync [url :read-write]
      (mt/with-temp [:model/Collection synced   {:name "Synced" :is_remote_synced true :location "/"}
                     :model/Collection unsynced {:name "Unsynced" :location "/"}
                     :model/Card       card     {:name "Synced card" :collection_id (:id synced)}
                     :model/Card       other    {:name "Unsynced card" :collection_id (:id unsynced)}]
        (let [result (remote-sync.tu/push! url nil)]
          (testing "a push commits the synced content, and only it"
            (is (=? {:status :success :outcome {:kind "pushed"}} result))
            (is (= (:version result) (remote-sync.tu/tip! url "main")))
            (is (some? (remote-sync.tu/entity-path! url "main" card)))
            (is (nil? (remote-sync.tu/entity-path! url "main" other))))
          (testing "a push with no change commits nothing"
            (is (=? {:status :success :version (:version result) :outcome {:kind "push-skipped"}}
                    (remote-sync.tu/push! url (:version result))))))))))

(deftest push-stops-when-remote-changed-test
  (remote-sync.tu/with-repository [url]
    (remote-sync.tu/with-remote-sync [url :read-write]
      (mt/with-temp [:model/Collection synced {:name "Synced" :is_remote_synced true :location "/"}
                     :model/Card       card   {:name "Synced card" :collection_id (:id synced)}
                     :model/Card       other  {:name "Other card" :collection_id (:id synced)}]
        (let [{v1 :version} (remote-sync.tu/push! url nil)
              path          (remote-sync.tu/entity-path! url "main" card)]
          (remote-sync.tu/commit! url "main" {path (str/replace (remote-sync.tu/read-file! url "main" path)
                                                                "name: Synced card" "name: Renamed remotely")})
          (t2/update! :model/Card :id (:id other) {:name "Renamed locally"})
          (testing "a push stops when the remote changed since the last sync"
            (is (=? {:status :conflict :outcome {:kind "remote-changed"}} (remote-sync.tu/push! url v1))))
          (testing "a merging push takes both changes, in git and in the app DB"
            (is (=? {:status :success} (remote-sync.tu/push! url v1 {:merge? true})))
            (is (str/includes? (remote-sync.tu/read-file! url "main" path) "Renamed remotely"))
            (is (str/includes? (remote-sync.tu/read-file! url "main" (remote-sync.tu/entity-path! url "main" other)) "Renamed locally"))
            (is (= "Renamed remotely" (t2/select-one-fn :name :model/Card :id (:id card))))))))))

(deftest push-refuses-unsynced-dependencies-test
  (remote-sync.tu/with-repository [url]
    (remote-sync.tu/with-remote-sync [url :read-write]
      (mt/with-temp [:model/Collection synced   {:name "Synced" :is_remote_synced true :location "/"}
                     :model/Collection unsynced {:name "Unsynced" :location "/"}
                     :model/Card       source   {:name "Unsynced source" :collection_id (:id unsynced)}]
        (let [mp (mt/metadata-provider)]
          (mt/with-temp [:model/Card _ {:name          "Synced card"
                                        :collection_id (:id synced)
                                        :dataset_query (lib/query mp (lib.metadata/card mp (:id source)))}]
            (testing "a push fails, naming the dependency, when synced content uses unsynced content"
              (is (=? {:status :error :message #"Synced card uses Card .+, which isn't synced\. Sync it too, or remove the reference\."} (remote-sync.tu/push! url nil)))
              (is (= #{"README.md"} (remote-sync.tu/files! url "main"))))))))))

(deftest push-transform-with-built-in-tag-test
  (remote-sync.tu/with-repository [url]
    (remote-sync.tu/with-remote-sync [url :read-write]
      (let [daily (t2/select-one :model/TransformTag :built_in_type "daily")]
        (mt/with-temp [:model/Transform             transform {:name "Tagged transform"}
                       :model/TransformTransformTag _         {:transform_id (:id transform)
                                                               :tag_id       (:id daily)
                                                               :position     0}]
          (testing "a push of a transform with a built-in tag succeeds without syncing the tag"
            (is (=? {:status :success} (remote-sync.tu/push! url nil)))
            (is (nil? (remote-sync.tu/entity-path! url "main" daily)))))))))

(deftest push-after-transforms-folder-delete-test
  (remote-sync.tu/with-repository [url]
    (remote-sync.tu/with-remote-sync [url :read-write]
      (mt/with-temporary-raw-setting-values [transforms-enabled "true"]
        (mt/with-temp [:model/Collection folder    {:name "Folder" :namespace "transforms" :location "/"}
                       :model/Collection subfolder {:name      "Subfolder"
                                                    :namespace "transforms"
                                                    :location  (str "/" (:id folder) "/")}
                       :model/Transform  outer     {:name "Outer transform" :collection_id (:id folder)}
                       :model/Transform  inner     {:name "Inner transform" :collection_id (:id subfolder)}]
          (let [deleted       [folder subfolder outer inner]
                {v1 :version} (remote-sync.tu/push! url nil)]
            (testing "a push commits the transforms folder, its subfolder and the transforms in them"
              (is (every? #(some? (remote-sync.tu/entity-path! url "main" %)) deleted)))
            (mt/user-http-request :crowberto :delete 204 (str "transform/collection/" (:id folder)))
            (testing "the push after the folder delete removes them from the remote"
              (is (=? {:status :success :outcome {:kind "pushed"}} (remote-sync.tu/push! url v1)))
              (is (every? #(nil? (remote-sync.tu/entity-path! url "main" %)) deleted)))))))))

(deftest pull-test
  (remote-sync.tu/with-repository [url]
    (remote-sync.tu/with-remote-sync [url :read-write]
      (mt/with-temp [:model/Collection synced {:name "Synced" :is_remote_synced true :location "/"}
                     :model/Card       card   {:name "Synced card" :collection_id (:id synced)}
                     :model/Card       gone   {:name "Removed card" :collection_id (:id synced)}]
        (let [{v1 :version} (remote-sync.tu/push! url nil)
              path          (remote-sync.tu/entity-path! url "main" card)]
          (remote-sync.tu/commit! url "main" {path                 (str/replace (remote-sync.tu/read-file! url "main" path)
                                                                                "name: Synced card" "name: Renamed remotely")
                                              (remote-sync.tu/entity-path! url "main" gone) nil})
          (testing "a pull loads the changes of the remote and deletes the synced rows it removed"
            (is (=? {:status :success :version (remote-sync.tu/tip! url "main") :outcome {:kind "pulled" :count 2}}
                    (remote-sync.tu/pull! url v1)))
            (is (= "Renamed remotely" (t2/select-one-fn :name :model/Card :id (:id card))))
            (is (not (t2/exists? :model/Card :id (:id gone))))))))))

(deftest pull-keeps-local-changes-test
  (remote-sync.tu/with-repository [url]
    (remote-sync.tu/with-remote-sync [url :read-write]
      (mt/with-temp [:model/Collection synced {:name "Synced" :is_remote_synced true :location "/"}
                     :model/Card       card   {:name "Synced card" :collection_id (:id synced)}
                     :model/Card       other  {:name "Other card" :collection_id (:id synced)}]
        (let [{v1 :version} (remote-sync.tu/push! url nil)
              path          (remote-sync.tu/entity-path! url "main" other)]
          (remote-sync.tu/commit! url "main" {path (str/replace (remote-sync.tu/read-file! url "main" path)
                                                                "name: Other card" "name: Renamed remotely")})
          (t2/update! :model/Card :id (:id card) {:name "Renamed locally"})
          (testing "a pull keeps the local changes to other entities"
            (is (=? {:status :success} (remote-sync.tu/pull! url v1)))
            (is (= "Renamed locally" (t2/select-one-fn :name :model/Card :id (:id card))))
            (is (= "Renamed remotely" (t2/select-one-fn :name :model/Card :id (:id other)))))
          (testing "a forced pull discards them"
            (is (=? {:status :success} (remote-sync.tu/pull! url v1 {:force? true})))
            (is (= "Synced card" (t2/select-one-fn :name :model/Card :id (:id card))))))))))

(deftest pull-skips-unmoved-tip-test
  (remote-sync.tu/with-repository [url]
    (remote-sync.tu/with-remote-sync [url :read-write]
      (mt/with-temp [:model/Collection synced {:name "Synced" :is_remote_synced true :location "/"}
                     :model/Card       card   {:name "Synced card" :collection_id (:id synced)}]
        (let [{v1 :version} (remote-sync.tu/push! url nil)]
          (t2/update! :model/Card :id (:id card) {:name "Renamed locally"})
          (testing "pull of unmoved tip reads no local documents and keeps local changes"
            (mt/with-dynamic-fn-redefs [content/local-documents (fn [] (throw (ex-info "read local documents" {})))]
              (is (=? {:status :success :version v1 :outcome {:kind "pull-skipped"}}
                      (remote-sync.tu/pull! url v1))))
            (is (= "Renamed locally" (t2/select-one-fn :name :model/Card :id (:id card)))))
          (testing "forced pull of unmoved tip still discards local changes"
            (is (=? {:status :success :version v1 :outcome {:kind "pulled" :count 1}}
                    (remote-sync.tu/pull! url v1 {:force? true})))
            (is (= "Synced card" (t2/select-one-fn :name :model/Card :id (:id card))))))))))

(deftest pull-refuses-to-remove-what-local-changes-depend-on-test
  (remote-sync.tu/with-repository [url]
    (remote-sync.tu/with-remote-sync [url :read-write]
      (mt/with-model-cleanup [:model/Card :model/Collection]
        (mt/with-temp [:model/Collection synced {:name "Synced" :is_remote_synced true :location "/"}
                       :model/Collection child  {:name             "Child"
                                                 :is_remote_synced true
                                                 :location         (format "/%d/" (:id synced))}]
          (let [{v1 :version} (remote-sync.tu/push! url nil)
                child-path    (remote-sync.tu/entity-path! url "main" child)]
            (remote-sync.tu/commit! url "main" {child-path nil})
            (mt/with-temp [:model/Card card {:name "New card" :collection_id (:id child)}]
              (testing "a pull stops when it would remove what local changes depend on"
                (let [result (remote-sync.tu/pull! url v1)]
                  (is (= :error (:status result)))
                  (is (str/starts-with? (:message result) "New card uses Collection")))
                (is (t2/exists? :model/Card :id (:id card)))
                (is (t2/exists? :model/Collection :id (:id child)))))))))))

(deftest pull-conflict-test
  (remote-sync.tu/with-repository [url]
    (remote-sync.tu/with-remote-sync [url :read-write]
      (mt/with-temp [:model/Collection synced {:name "Synced" :is_remote_synced true :location "/"}
                     :model/Card       card   {:name "Synced card" :collection_id (:id synced)}]
        (let [{v1 :version} (remote-sync.tu/push! url nil)
              path          (remote-sync.tu/entity-path! url "main" card)]
          (remote-sync.tu/commit! url "main" {path (str/replace (remote-sync.tu/read-file! url "main" path)
                                                                "name: Synced card" "name: Renamed remotely")})
          (t2/update! :model/Card :id (:id card) {:name "Renamed locally"})
          (testing "a pull stops when both sides changed the same entity"
            (is (=? {:status :conflict :conflicts ["Renamed locally"]} (remote-sync.tu/pull! url v1)))
            (is (= "Renamed locally" (t2/select-one-fn :name :model/Card :id (:id card))))))))))

(deftest local-changes-test
  (remote-sync.tu/with-repository [url]
    (remote-sync.tu/with-remote-sync [url :read-write]
      (mt/with-temp [:model/Collection synced {:name "Synced" :is_remote_synced true :location "/"}
                     :model/Card       card   {:name "Synced card" :collection_id (:id synced)}]
        (let [{v1 :version} (remote-sync.tu/push! url nil)
              changes       #(set (map (juxt :status (comp :name :entity :doc))
                                       (remote-sync.tu/local-changes! url v1)))]
          (testing "nothing changed since the last sync"
            (is (= #{} (changes))))
          (mt/with-temp [:model/Card _ {:name "New card" :collection_id (:id synced)}]
            (t2/update! :model/Card :id (:id card) {:name "Renamed card"})
            (testing "a new entity is created and a changed one updated"
              (is (= #{["create" "New card"] ["update" "Renamed card"]} (changes))))))))))

(deftest push-refuses-unsynced-goal-sources-test
  (remote-sync.tu/with-repository [url]
    (remote-sync.tu/with-remote-sync [url :read-write]
      (mt/with-temp [:model/Collection synced   {:name "Synced" :is_remote_synced true :location "/"}
                     :model/Collection unsynced {:name "Unsynced" :location "/"}
                     :model/Card       source   {:name "Unsynced goal source" :collection_id (:id unsynced)}
                     :model/Card       _        {:name                   "Synced chart"
                                                 :collection_id          (:id synced)
                                                 :display                :line
                                                 :visualization_settings {:graph.show_goal  true
                                                                          :graph.goal_value {:id     (:id source)
                                                                                             :type   "card"
                                                                                             :column "total"}}}]
        (testing "a push fails, naming the goal source, when a synced chart's goal reads unsynced content"
          (is (=? {:status :error :message #"Synced chart uses Card .+, which isn't synced\..*"}
                  (remote-sync.tu/push! url nil))))))))

(deftest push-refuses-unsynced-measure-goal-test
  (remote-sync.tu/with-repository [url]
    (remote-sync.tu/with-remote-sync [url :read-write]
      (mt/with-temp [:model/Collection synced  {:name "Synced" :is_remote_synced true :location "/"}
                     :model/Measure    measure {:name "Unsynced measure"}
                     :model/Card       _       {:name                   "Synced chart"
                                                :collection_id          (:id synced)
                                                :display                :progress
                                                :visualization_settings {:progress.goal {:id     (:id measure)
                                                                                         :type   "measure"
                                                                                         :column "count"}}}]
        (testing "a push names a goal's measure that isn't synced"
          (is (=? {:status :error :message #"Synced chart uses Measure .+, which isn't synced\..*"}
                  (remote-sync.tu/push! url nil))))))))

(deftest pull-of-query-this-instance-rejects-names-no-import-option-test
  (remote-sync.tu/with-repository [url]
    (remote-sync.tu/with-remote-sync [url :read-write]
      (mt/with-temp [:model/Collection synced {:name "Synced" :is_remote_synced true :location "/"}
                     :model/Card       card   {:name          "Synced card"
                                               :collection_id (:id synced)
                                               :dataset_query (lib/native-query (mt/metadata-provider)
                                                                                "SELECT {{x}}")}]
        (let [{v1 :version} (remote-sync.tu/push! url nil)
              path          (remote-sync.tu/entity-path! url "main" card)]
          (remote-sync.tu/commit! url "main" {path (str/replace (remote-sync.tu/read-file! url "main" path)
                                                                "type: text" "type: tag-type-from-the-future")})
          (testing "a pull refuses a query this instance cannot represent without naming SerDes import options"
            (let [message (try
                            (:message (remote-sync.tu/pull! url v1))
                            (catch Exception e
                              (tasks/error-message e)))]
              (is (re-find #"does not match this Metabase's query schema" message))
              (is (not (re-find #"continue_on_error|MB_SERIALIZATION_SKIP_SCHEMA_VALIDATION" message))))))))))
