(ns metabase-enterprise.remote-sync.sync-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.remote-sync.content :as content]
   [metabase-enterprise.remote-sync.sync :as sync]
   [metabase-enterprise.remote-sync.test-util :as remote-sync.tu]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(defn- card-path!
  "The path of the YAML file of `card` at the tip of `main` of the repository of `url`, or nil."
  [url card]
  (some #(when (str/includes? (remote-sync.tu/read-file! url "main" %) (str "entity_id: " (:entity_id card))) %)
        (remote-sync.tu/files! url "main")))

(defn- push!
  "Pushes the synced content to `main` of the repository of `url`, since `base-version`."
  ([url base-version]
   (push! url base-version {}))
  ([url base-version opts]
   (sync/push! (remote-sync.tu/repository! url) "main" base-version
               (merge {:message "Push"} opts))))

(defn- pull!
  "Pulls `main` of the repository of `url` into the app DB, since `base-version`."
  ([url base-version]
   (pull! url base-version {}))
  ([url base-version opts]
   (sync/pull! (remote-sync.tu/repository! url) "main" base-version opts)))

(deftest push-test
  (remote-sync.tu/with-repository [url]
    (remote-sync.tu/with-remote-sync [url :read-write]
      (mt/with-temp [:model/Collection synced   {:name "Synced" :is_remote_synced true :location "/"}
                     :model/Collection unsynced {:name "Unsynced" :location "/"}
                     :model/Card       card     {:name "Synced card" :collection_id (:id synced)}
                     :model/Card       other    {:name "Unsynced card" :collection_id (:id unsynced)}]
        (let [result (push! url nil)]
          (testing "a push commits the synced content, and only it"
            (is (=? {:status :success :outcome {:kind "pushed"}} result))
            (is (= (:version result) (remote-sync.tu/tip! url "main")))
            (is (some? (card-path! url card)))
            (is (nil? (card-path! url other))))
          (testing "a push with no change commits nothing"
            (is (=? {:status :success :version (:version result) :outcome {:kind "push-skipped"}}
                    (push! url (:version result))))))))))

(deftest push-stops-when-remote-changed-test
  (remote-sync.tu/with-repository [url]
    (remote-sync.tu/with-remote-sync [url :read-write]
      (mt/with-temp [:model/Collection synced {:name "Synced" :is_remote_synced true :location "/"}
                     :model/Card       card   {:name "Synced card" :collection_id (:id synced)}
                     :model/Card       other  {:name "Other card" :collection_id (:id synced)}]
        (let [{v1 :version} (push! url nil)
              path          (card-path! url card)]
          (remote-sync.tu/commit! url "main" {path (str/replace (remote-sync.tu/read-file! url "main" path)
                                                                "name: Synced card" "name: Renamed remotely")})
          (t2/update! :model/Card :id (:id other) {:name "Renamed locally"})
          (testing "a push stops when the remote changed since the last sync"
            (is (=? {:status :conflict :outcome {:kind "remote-changed"}} (push! url v1))))
          (testing "a merging push takes both changes, in git and in the app DB"
            (is (=? {:status :success} (push! url v1 {:merge? true})))
            (is (str/includes? (remote-sync.tu/read-file! url "main" path) "Renamed remotely"))
            (is (str/includes? (remote-sync.tu/read-file! url "main" (card-path! url other)) "Renamed locally"))
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
              (is (=? {:status :error :message #"Synced card uses Card .+, which isn't synced\. Sync it too, or remove the reference\."} (push! url nil)))
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
            (is (=? {:status :success} (push! url nil)))
            (is (not-any? #(str/includes? (remote-sync.tu/read-file! url "main" %)
                                          (str "entity_id: " (:entity_id daily)))
                          (remote-sync.tu/files! url "main")))))))))

(deftest pull-test
  (remote-sync.tu/with-repository [url]
    (remote-sync.tu/with-remote-sync [url :read-write]
      (mt/with-temp [:model/Collection synced {:name "Synced" :is_remote_synced true :location "/"}
                     :model/Card       card   {:name "Synced card" :collection_id (:id synced)}
                     :model/Card       gone   {:name "Removed card" :collection_id (:id synced)}]
        (let [{v1 :version} (push! url nil)
              path          (card-path! url card)]
          (remote-sync.tu/commit! url "main" {path                 (str/replace (remote-sync.tu/read-file! url "main" path)
                                                                                "name: Synced card" "name: Renamed remotely")
                                              (card-path! url gone) nil})
          (testing "a pull loads the changes of the remote and deletes the synced rows it removed"
            (is (=? {:status :success :version (remote-sync.tu/tip! url "main") :outcome {:kind "pulled" :count 2}}
                    (pull! url v1)))
            (is (= "Renamed remotely" (t2/select-one-fn :name :model/Card :id (:id card))))
            (is (not (t2/exists? :model/Card :id (:id gone))))))))))

(deftest pull-keeps-local-changes-test
  (remote-sync.tu/with-repository [url]
    (remote-sync.tu/with-remote-sync [url :read-write]
      (mt/with-temp [:model/Collection synced {:name "Synced" :is_remote_synced true :location "/"}
                     :model/Card       card   {:name "Synced card" :collection_id (:id synced)}
                     :model/Card       other  {:name "Other card" :collection_id (:id synced)}]
        (let [{v1 :version} (push! url nil)
              path          (card-path! url other)]
          (remote-sync.tu/commit! url "main" {path (str/replace (remote-sync.tu/read-file! url "main" path)
                                                                "name: Other card" "name: Renamed remotely")})
          (t2/update! :model/Card :id (:id card) {:name "Renamed locally"})
          (testing "a pull keeps the local changes to other entities"
            (is (=? {:status :success} (pull! url v1)))
            (is (= "Renamed locally" (t2/select-one-fn :name :model/Card :id (:id card))))
            (is (= "Renamed remotely" (t2/select-one-fn :name :model/Card :id (:id other)))))
          (testing "a forced pull discards them"
            (is (=? {:status :success} (pull! url v1 {:force? true})))
            (is (= "Synced card" (t2/select-one-fn :name :model/Card :id (:id card))))))))))

(deftest pull-refuses-to-remove-what-local-changes-depend-on-test
  (remote-sync.tu/with-repository [url]
    (remote-sync.tu/with-remote-sync [url :read-write]
      (mt/with-model-cleanup [:model/Card :model/Collection]
        (mt/with-temp [:model/Collection synced {:name "Synced" :is_remote_synced true :location "/"}
                       :model/Collection child  {:name             "Child"
                                                 :is_remote_synced true
                                                 :location         (format "/%d/" (:id synced))}]
          (let [{v1 :version} (push! url nil)
                child-path    (some #(when (str/includes? (remote-sync.tu/read-file! url "main" %)
                                                          (str "entity_id: " (:entity_id child)))
                                       %)
                                    (remote-sync.tu/files! url "main"))]
            (remote-sync.tu/commit! url "main" {child-path nil})
            (mt/with-temp [:model/Card card {:name "New card" :collection_id (:id child)}]
              (testing "a pull stops when it would remove what local changes depend on"
                (let [result (pull! url v1)]
                  (is (= :error (:status result)))
                  (is (str/starts-with? (:message result) "New card uses Collection")))
                (is (t2/exists? :model/Card :id (:id card)))
                (is (t2/exists? :model/Collection :id (:id child)))))))))))

(deftest pull-conflict-test
  (remote-sync.tu/with-repository [url]
    (remote-sync.tu/with-remote-sync [url :read-write]
      (mt/with-temp [:model/Collection synced {:name "Synced" :is_remote_synced true :location "/"}
                     :model/Card       card   {:name "Synced card" :collection_id (:id synced)}]
        (let [{v1 :version} (push! url nil)
              path          (card-path! url card)]
          (remote-sync.tu/commit! url "main" {path (str/replace (remote-sync.tu/read-file! url "main" path)
                                                                "name: Synced card" "name: Renamed remotely")})
          (t2/update! :model/Card :id (:id card) {:name "Renamed locally"})
          (testing "a pull stops when both sides changed the same entity"
            (is (=? {:status :conflict :conflicts ["Renamed locally"]} (pull! url v1)))
            (is (= "Renamed locally" (t2/select-one-fn :name :model/Card :id (:id card))))))))))

(deftest local-changes-test
  (remote-sync.tu/with-repository [url]
    (remote-sync.tu/with-remote-sync [url :read-write]
      (mt/with-temp [:model/Collection synced {:name "Synced" :is_remote_synced true :location "/"}
                     :model/Card       card   {:name "Synced card" :collection_id (:id synced)}]
        (let [{v1 :version} (push! url nil)
              changes       #(set (map (juxt :status (comp :name :entity :doc))
                                       (sync/local-changes (content/tree-documents (remote-sync.tu/repository! url) v1)
                                                           (content/local-documents))))]
          (testing "nothing changed since the last sync"
            (is (= #{} (changes))))
          (mt/with-temp [:model/Card _ {:name "New card" :collection_id (:id synced)}]
            (t2/update! :model/Card :id (:id card) {:name "Renamed card"})
            (testing "a new entity is created and a changed one updated"
              (is (= #{["create" "New card"] ["update" "Renamed card"]} (changes))))))))))
