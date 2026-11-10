(ns metabase-enterprise.data-testing.remote-sync-test
  "Remote sync of card tests: a card test syncs exactly when its card does."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.remote-sync.content :as content]
   [metabase-enterprise.remote-sync.settings :as remote-sync.settings]
   [metabase-enterprise.remote-sync.stats :as remote-sync.stats]
   [metabase-enterprise.remote-sync.sync :as sync]
   [metabase-enterprise.remote-sync.test-util :as remote-sync.tu]
   [metabase.collections.test-utils :as collections.tu]
   [metabase.lib.core :as lib]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- synced-card-test-ids
  "The ids of the card tests whose documents a push would commit."
  []
  (into #{}
        (keep (fn [{[model id] :row}] (when (= :model/CardTest model) id)))
        (vals (content/local-documents))))

(defn- path!
  "The path of the YAML file of `entity` at the tip of `main` of the repository of `url`, or nil."
  [url entity]
  (some #(when (str/includes? (remote-sync.tu/read-file! url "main" %) (str "entity_id: " (:entity_id entity))) %)
        (remote-sync.tu/files! url "main")))

(defn- directory-of
  "The path of `yaml-path` without its `.yaml` extension, the directory the files of its children go in."
  [yaml-path]
  (str/replace yaml-path #"\.yaml$" ""))

(defn- push!
  "Pushes the synced content to `main` of the repository of `url`, since `base-version`."
  [url base-version]
  (sync/push! (remote-sync.tu/repository! url) "main" base-version {:message "Push"}))

(defn- pull!
  "Pulls `main` of the repository of `url` into the app DB, since `base-version`."
  ([url base-version]
   (pull! url base-version {}))
  ([url base-version opts]
   (sync/pull! (remote-sync.tu/repository! url) "main" base-version opts)))

(defn- local-changes!
  "The `[status model name]` of each local change since the tree of `version` of the repository of `url`."
  [url version]
  (into #{}
        (map (juxt :status (comp first :key) (comp :name :entity :doc)))
        (sync/local-changes (content/tree-documents (remote-sync.tu/repository! url) version)
                            (content/local-documents))))

;;; ------------------------------------------- Which card tests are synced -------------------------------------------

(deftest card-tests-follow-their-cards-test
  (mt/with-premium-features #{:remote-sync}
    (mt/with-temp [:model/Collection synced   {:name "Synced" :is_remote_synced true :location "/"}
                   :model/Collection child    {:name "Child" :is_remote_synced true :location (format "/%d/" (:id synced))}
                   :model/Collection unsynced {:name "Unsynced" :location "/"}
                   :model/Dashboard  dash     {:name "Dash" :collection_id (:id synced)}
                   :model/Document   doc      {:name "Doc" :collection_id (:id synced) :document {:type "doc" :content []}}
                   :model/Card       card     {:name "Card" :collection_id (:id synced)}
                   :model/Card       in-child {:name "Card in child" :collection_id (:id child)}
                   :model/Card       other    {:name "Unsynced card" :collection_id (:id unsynced)}
                   :model/Card       archived {:name "Archived card" :collection_id (:id synced) :archived true}
                   :model/Card       dq       {:name "Dashboard question" :collection_id (:id synced) :dashboard_id (:id dash)}
                   :model/Card       dc       {:name "Document card" :collection_id (:id synced) :document_id (:id doc)}
                   :model/CardTest   t-card   {:card_id (:id card)}
                   :model/CardTest   t-child  {:card_id (:id in-child)}
                   :model/CardTest   t-other  {:card_id (:id other)}
                   :model/CardTest   t-arch   {:card_id (:id archived)}
                   :model/CardTest   t-dq     {:card_id (:id dq)}
                   :model/CardTest   t-dc     {:card_id (:id dc)}]
      (let [synced-ids (synced-card-test-ids)]
        (testing "a test of a card in a synced collection, or in a child of one, is synced"
          (is (contains? synced-ids (:id t-card)))
          (is (contains? synced-ids (:id t-child))))
        (testing "a test of a dashboard question, or of a card in a document, of a synced collection is synced"
          (is (contains? synced-ids (:id t-dq)))
          (is (contains? synced-ids (:id t-dc))))
        (testing "a test of a card in an unsynced collection is not synced"
          (is (not (contains? synced-ids (:id t-other)))))
        (testing "a test of an archived card in a synced collection is not synced"
          (is (not (contains? synced-ids (:id t-arch)))))))))

(deftest card-tests-in-the-library-test
  (mt/with-premium-features #{:remote-sync}
    (collections.tu/with-library-synced
      (let [library (t2/select-one :model/Collection :type "library")]
        (mt/with-temp [:model/Collection child {:name "Library child" :location (format "/%d/" (:id library))
                                                :is_remote_synced true}
                       :model/Card       card  {:name "Library metric" :collection_id (:id child) :type :metric}
                       :model/CardTest   t     {:card_id (:id card)}]
          (testing "a test of a card in the Library is synced while the Library syncs"
            (is (contains? (synced-card-test-ids) (:id t)))))))))

;;; ------------------------------------------------------- Push -------------------------------------------------------

(deftest push-writes-card-tests-next-to-their-cards-test
  (remote-sync.tu/with-repository [url]
    (remote-sync.tu/with-remote-sync [url :read-write]
      (mt/with-temp [:model/Collection synced   {:name "Synced" :is_remote_synced true :location "/"}
                     :model/Collection unsynced {:name "Unsynced" :location "/"}
                     :model/Dashboard  dash     {:name "Dash" :collection_id (:id synced)}
                     :model/Card       card     {:name "Synced card" :collection_id (:id synced)}
                     :model/Card       dq       {:name "Dash question" :collection_id (:id synced) :dashboard_id (:id dash)}
                     :model/Card       other    {:name "Unsynced card" :collection_id (:id unsynced)}
                     :model/CardTest   t        {:card_id (:id card) :name "Row count"}
                     :model/CardTest   t-dq     {:card_id (:id dq) :name "Dash question test"}
                     :model/CardTest   t-other  {:card_id (:id other) :name "Unsynced test"}]
        (is (=? {:status :success} (push! url nil)))
        (testing "a test of a synced card is in the card's directory, under its own name"
          (is (= (str (directory-of (path! url card)) "/row_count.yaml")
                 (path! url t))))
        (testing "a test of a dashboard question is in the question's directory, inside the dashboard's directory"
          (is (= (str (directory-of (path! url dq)) "/dash_question_test.yaml")
                 (path! url t-dq)))
          (is (str/starts-with? (path! url t-dq) (str (directory-of (path! url dash)) "/"))))
        (testing "a test of an unsynced card has no file"
          (is (nil? (path! url other)))
          (is (nil? (path! url t-other))))))))

(deftest card-test-files-move-with-their-cards-test
  (remote-sync.tu/with-repository [url]
    (remote-sync.tu/with-remote-sync [url :read-write]
      (mt/with-temp [:model/Collection synced   {:name "Synced" :is_remote_synced true :location "/"}
                     :model/Collection other    {:name "Other synced" :is_remote_synced true :location "/"}
                     :model/Collection unsynced {:name "Unsynced" :location "/"}
                     :model/Card       card     {:name "Synced card" :collection_id (:id synced)}
                     :model/CardTest   t        {:card_id (:id card) :name "Row count"}]
        (let [{v1 :version} (push! url nil)
              old-path      (path! url t)]
          (testing "after the card moves to another synced collection, the test's file is only under its new path"
            (t2/update! :model/Card :id (:id card) {:collection_id (:id other)})
            (let [{v2 :version} (push! url v1)
                  moved-path    (path! url t)]
              (is (= (str (directory-of (path! url card)) "/row_count.yaml") moved-path))
              (is (not= old-path moved-path))
              (is (not (contains? (remote-sync.tu/files! url "main") old-path)))
              (testing "after the card is renamed, the test's file is only under the card's new path"
                (t2/update! :model/Card :id (:id card) {:name "Renamed card"})
                (let [{v3 :version} (push! url v2)
                      renamed-path  (path! url t)]
                  (is (str/ends-with? renamed-path "/renamed_card/row_count.yaml"))
                  (is (= (str (directory-of (path! url card)) "/row_count.yaml") renamed-path))
                  (is (not (contains? (remote-sync.tu/files! url "main") moved-path)))
                  (testing "after the card is archived, the test is a local delete and the next push removes its file"
                    (t2/update! :model/Card :id (:id card) {:archived true})
                    (is (contains? (local-changes! url v3) ["delete" :model/CardTest "Row count"]))
                    (let [{v4 :version} (push! url v3)]
                      (is (nil? (path! url t)))
                      (testing "after the card is unarchived, the test is a local create"
                        (t2/update! :model/Card :id (:id card) {:archived false})
                        (is (contains? (local-changes! url v4) ["create" :model/CardTest "Row count"]))
                        (let [{v5 :version} (push! url v4)]
                          (is (some? (path! url t)))
                          (testing "after the card moves to an unsynced collection, the next push removes both files"
                            (t2/update! :model/Card :id (:id card) {:collection_id (:id unsynced)})
                            (is (= #{["delete" :model/Card "Renamed card"] ["delete" :model/CardTest "Row count"]}
                                   (local-changes! url v5)))
                            (push! url v5)
                            (is (nil? (path! url card)))
                            (is (nil? (path! url t)))))))))))))))))

;;; ------------------------------------------------------- Pull -------------------------------------------------------

(deftest pull-card-tests-test
  (remote-sync.tu/with-repository [url]
    (remote-sync.tu/with-remote-sync [url :read-write]
      (mt/with-model-cleanup [:model/Card :model/CardTest]
        (mt/with-temp [:model/Collection synced {:name "Synced" :is_remote_synced true :location "/"}
                       :model/Card       card   {:name "Synced card" :collection_id (:id synced)}
                       :model/Card       card2  {:name "Second card" :collection_id (:id synced)}
                       :model/CardTest   t      {:card_id (:id card) :name "Row count"}
                       :model/CardTest   t2     {:card_id (:id card2) :name "Second test"}]
          (let [{v1 :version} (push! url nil)
                t-path        (path! url t)
                _             (is (some? t-path) "the push wrote the test's file")
                t-yaml        (some->> t-path (remote-sync.tu/read-file! url "main"))]
            (testing "a pull that removes a test's file deletes the test and keeps its card"
              (remote-sync.tu/commit! url "main" {t-path nil})
              (let [{v2 :version :as result} (pull! url v1)]
                (is (=? {:status :success :outcome {:kind "pulled" :count 1}} result))
                (is (not (t2/exists? :model/CardTest :entity_id (:entity_id t))))
                (is (t2/exists? :model/Card :id (:id card)))
                (testing "a pull that adds a test's file inserts the test, without the Transforms Testing feature"
                  (remote-sync.tu/commit! url "main" {t-path t-yaml})
                  (let [{v3 :version :as result} (mt/with-premium-features #{:remote-sync}
                                                   (pull! url v2))]
                    (is (=? {:status :success :outcome {:kind "pulled" :count 1}} result))
                    (is (=? {:name "Row count" :card_id (:id card)}
                            (t2/select-one :model/CardTest :entity_id (:entity_id t))))
                    (testing "a pull that removes a card's file and keeps its test's file deletes both rows"
                      (remote-sync.tu/commit! url "main" {(path! url card2) nil})
                      (let [{v4 :version :as result} (pull! url v3)]
                        (is (=? {:status :success :outcome {:kind "pulled" :count 1}} result))
                        (is (not (t2/exists? :model/Card :id (:id card2))))
                        (is (not (t2/exists? :model/CardTest :id (:id t2))))
                        (testing "and leaves the test as a local delete"
                          (is (= #{["delete" :model/CardTest "Second test"]} (local-changes! url v4))))))))))))))))

(deftest pull-card-and-its-test-test
  (remote-sync.tu/with-repository [url]
    (remote-sync.tu/with-remote-sync [url :read-write]
      (mt/with-model-cleanup [:model/Card :model/CardTest]
        (mt/with-temp [:model/Collection synced {:name "Synced" :is_remote_synced true :location "/"}
                       :model/Card       card   {:name "Synced card" :collection_id (:id synced)}
                       :model/CardTest   t      {:card_id (:id card) :name "Row count"}]
          (let [{v1 :version} (push! url nil)
                paths         [(path! url card) (path! url t)]
                _             (is (every? some? paths) "the push wrote the card's file and the test's file")
                files         (into {}
                                    (map (fn [path] [path (remote-sync.tu/read-file! url "main" path)]))
                                    (filter some? paths))]
            (t2/delete! :model/Card :id (:id card))
            (let [{v2 :version} (push! url v1)]
              (is (nil? (path! url t)))
              (testing "a pull that adds a card and its test inserts both"
                (remote-sync.tu/commit! url "main" files)
                (is (=? {:status :success :outcome {:kind "pulled" :count 2}} (pull! url v2)))
                (let [card-id (t2/select-one-pk :model/Card :entity_id (:entity_id card))]
                  (is (some? card-id))
                  (is (= card-id (t2/select-one-fn :card_id :model/CardTest :entity_id (:entity_id t)))))))))))))

(deftest pull-conflict-on-a-card-test-test
  (remote-sync.tu/with-repository [url]
    (remote-sync.tu/with-remote-sync [url :read-write]
      (mt/with-temp [:model/Collection synced {:name "Synced" :is_remote_synced true :location "/"}
                     :model/Card       card   {:name "Synced card" :collection_id (:id synced)}
                     :model/CardTest   t      {:card_id (:id card) :name "Row count"}]
        (let [{v1 :version} (push! url nil)
              t-path        (path! url t)]
          (is (some? t-path) "the push wrote the test's file")
          (when t-path
            (remote-sync.tu/commit! url "main" {t-path (str/replace (remote-sync.tu/read-file! url "main" t-path)
                                                                    "name: Row count" "name: Remote name")}))
          (t2/update! :model/CardTest :id (:id t) {:name "Local name"})
          (testing "a pull stops with a conflict that names the test when both sides change it"
            (is (=? {:status :conflict :conflicts ["Local name"]} (pull! url v1)))
            (is (= "Local name" (t2/select-one-fn :name :model/CardTest :id (:id t))))))))))

(deftest forced-pull-keeps-unsynced-card-tests-test
  (remote-sync.tu/with-repository [url]
    (remote-sync.tu/with-remote-sync [url :read-write]
      (mt/with-temp [:model/Collection synced   {:name "Synced" :is_remote_synced true :location "/"}
                     :model/Collection unsynced {:name "Unsynced" :location "/"}
                     :model/Card       card     {:name "Synced card" :collection_id (:id synced)}
                     :model/CardTest   t        {:card_id (:id card) :name "Synced test"}]
        (let [{v1 :version} (push! url nil)]
          (mt/with-temp [:model/Card     other   {:name "Unsynced card" :collection_id (:id unsynced)}
                         :model/CardTest t-other {:card_id (:id other) :name "Unsynced test"}]
            (testing "a forced pull keeps the tests of cards in unsynced collections"
              (is (=? {:status :success} (pull! url v1 {:force? true})))
              (is (t2/exists? :model/CardTest :id (:id t-other)))
              (is (t2/exists? :model/CardTest :id (:id t))))))))))

;;; ------------------------------------------- Settings, stats, read-only -------------------------------------------

(deftest stop-syncing-a-collection-with-card-tests-test
  "Stopping sync of a collection with card tests succeeds. This does not guard the card-test filter: the stop-sync
  check reads `serialization/export-dependencies`, which CardTest does not define, so it never sees a test's card."
  (remote-sync.tu/with-repository [url]
    (remote-sync.tu/with-remote-sync [url :read-write]
      (mt/with-temp [:model/Collection synced {:name "Synced" :is_remote_synced true :location "/"}
                     :model/Card       card   {:name "Synced card" :collection_id (:id synced)}
                     :model/CardTest   _t     {:card_id (:id card) :name "Row count"}]
        (testing "stopping sync of a collection that holds a card and its test succeeds"
          (remote-sync.settings/set-synced-collections! {(:id synced) false})
          (is (false? (t2/select-one-fn :is_remote_synced :model/Collection :id (:id synced)))))))))

(deftest content-count-counts-card-tests-test
  (remote-sync.tu/with-repository [url]
    (remote-sync.tu/with-remote-sync [url :read-write]
      (mt/with-temp [:model/Collection synced {:name "Synced" :is_remote_synced true :location "/"}
                     :model/Card       card   {:name "Synced card" :collection_id (:id synced)}]
        (let [content-count #(:remote-sync-content-count (remote-sync.stats/remote-sync-stats))
              before        (content-count)]
          (mt/with-temp [:model/CardTest _t {:card_id (:id card) :name "Row count"}]
            (testing "the content count counts a synced card test"
              (is (= (inc before) (content-count))))))))))

(def ^:private test-body
  {:name         "New test"
   :inputs       [{:table   {:schema "PUBLIC" :name "PEOPLE"}
                   :format  "rows"
                   :columns [{:name "ID" :cast_type "INTEGER"}]
                   :rows    [{"ID" 1}]}]
   :expectations [{:type "empty" :name "no other rows" :sql "SELECT * FROM {{output}} WHERE ID <> 1"}]})

(deftest read-only-card-test-writes-test
  (mt/with-premium-features #{:transforms-testing}
    (mt/with-model-cleanup [:model/CardTest]
      (mt/with-temp [:model/Collection synced   {:name "Synced" :is_remote_synced true :location "/"}
                     :model/Collection unsynced {:name "Unsynced" :location "/"}
                     :model/Card       card     {:name          "Synced card"
                                                 :collection_id (:id synced)
                                                 :dataset_query (lib/native-query (mt/metadata-provider) "SELECT ID FROM PUBLIC.PEOPLE")}
                     :model/Card       other    {:name          "Unsynced card"
                                                 :collection_id (:id unsynced)
                                                 :dataset_query (lib/native-query (mt/metadata-provider) "SELECT ID FROM PUBLIC.PEOPLE")}
                     :model/CardTest   t        {:card_id (:id card) :name "Synced test"}
                     :model/CardTest   t-other  {:card_id (:id other) :name "Unsynced test"}]
        (remote-sync.tu/with-remote-sync ["file:///nonexistent/remote-sync-card-test" :read-only]
          (testing "on a read-only instance, a superuser can't create, update or delete a test of a synced card"
            (mt/user-http-request :crowberto :post 403 "ee/card-test" (assoc test-body :card_id (:id card)))
            (mt/user-http-request :crowberto :put 403 (str "ee/card-test/" (:id t)) {:name "Renamed"})
            (mt/user-http-request :crowberto :delete 403 (str "ee/card-test/" (:id t)))
            (is (= "Synced test" (t2/select-one-fn :name :model/CardTest :id (:id t)))))
          (testing "on a read-only instance, a superuser can update a test of an unsynced card"
            (is (=? {:name "Renamed"}
                    (mt/user-http-request :crowberto :put 200 (str "ee/card-test/" (:id t-other)) {:name "Renamed"})))))
        (remote-sync.tu/with-remote-sync ["file:///nonexistent/remote-sync-card-test" :read-write]
          (testing "on a read-write instance, a superuser can update a test of a synced card"
            (is (=? {:name "Renamed"}
                    (mt/user-http-request :crowberto :put 200 (str "ee/card-test/" (:id t)) {:name "Renamed"})))))))))

(deftest dirty-list-shows-card-tests-under-their-cards-test
  (remote-sync.tu/with-repository [url]
    (remote-sync.tu/with-remote-sync [url :read-write]
      (mt/with-model-cleanup [:model/RemoteSyncTask :model/Card :model/CardTest]
        (mt/with-temp [:model/Collection synced {:name "Synced" :is_remote_synced true :location "/"}
                       :model/Card       card   {:name "Synced card" :collection_id (:id synced)}
                       :model/Card       gone   {:name "Gone card" :collection_id (:id synced)}
                       :model/CardTest   t      {:card_id (:id card) :name "Edited test"}
                       :model/CardTest   _t     {:card_id (:id gone) :name "Test of deleted card"}]
          (let [{:keys [task_id]} (mt/user-http-request :crowberto :post 200 "ee/remote-sync/export"
                                                        {:branch "main" :message "Push"})]
            (is (=? {:status "successful"} (remote-sync.tu/wait-for-task! task_id))))
          (t2/update! :model/CardTest :id (:id t) {:description "changed"})
          (t2/delete! :model/Card :id (:id gone))
          (let [by-name (into {}
                              (comp (filter (comp #{"cardtest"} :model)) (map (juxt :name identity)))
                              (:dirty (mt/user-http-request :crowberto :get 200 "ee/remote-sync/dirty")))]
            (testing "a changed card test is listed with its card as parent, under its card's collection"
              (is (=? {:id          (:id t)
                       :model       "cardtest"
                       :sync_status "update"
                       :parent      {:model "card" :id (:id card) :name "Synced card"}
                       :collection  {:id (:id synced) :name "Synced"}}
                      (by-name "Edited test"))))
            (testing "a test deleted with its card has no parent and no collection"
              (is (=? {:id 0 :model "cardtest" :sync_status "delete"} (by-name "Test of deleted card")))
              (is (not-any? #(contains? (by-name "Test of deleted card") %) [:parent :collection])))))))))
