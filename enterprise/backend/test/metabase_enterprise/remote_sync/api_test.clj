(ns metabase-enterprise.remote-sync.api-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase-enterprise.remote-sync.test-util :as remote-sync.tu]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :each (fn [thunk] (mt/with-premium-features #{:remote-sync} (thunk))))

(defn- push!
  "Pushes the synced content to `main` through the API, returning the ended task."
  []
  (let [{:keys [task_id]} (mt/user-http-request :crowberto :post 200 "ee/remote-sync/export"
                                                {:branch "main" :message "Push synced content"})]
    (remote-sync.tu/wait-for-task! task_id)))

(defn- rename-remotely!
  "Renames `card` to `new-name` in its YAML file at the tip of `main` of the repository of `url`, as another instance
  would."
  [url card new-name]
  (let [path (remote-sync.tu/entity-path! url "main" card)]
    (remote-sync.tu/commit! url "main" {path (str/replace (remote-sync.tu/read-file! url "main" path)
                                                          (str "name: " (:name card))
                                                          (str "name: " new-name))})))

(deftest endpoints-require-superuser-test
  (doseq [path ["ee/remote-sync/is-dirty" "ee/remote-sync/dirty" "ee/remote-sync/current-task"
                "ee/remote-sync/branches" "ee/remote-sync/has-remote-changes"]]
    (testing path
      (mt/user-http-request :rasta :get 403 path)))
  (testing "ee/remote-sync/export-preflight"
    (mt/user-http-request :rasta :get 403 "ee/remote-sync/export-preflight" :branch "main"))
  (mt/with-temporary-setting-values [remote-sync-url nil]
    (let [task-count (t2/count :model/RemoteSyncTask)]
      (doseq [[method path body] [[:post "ee/remote-sync/import" {}]
                                  [:post "ee/remote-sync/export" {:branch "main"}]
                                  [:post "ee/remote-sync/stash" {:new_branch "stashed" :message "Stash"}]
                                  [:put "ee/remote-sync/settings" {:remote-sync-url "https://example.com/repo.git"}]
                                  [:post "ee/remote-sync/current-task/cancel" {}]
                                  [:post "ee/remote-sync/test-connection" {:remote-sync-url "https://example.com/repo.git"}]]]
        (testing path
          (mt/user-http-request :rasta method 403 path body)))
      (testing "a refused request changes nothing"
        (is (= task-count (t2/count :model/RemoteSyncTask)))
        (is (nil? (t2/select-one-fn :value :model/Setting :key "remote-sync-url")))))))

(deftest settings-test
  (remote-sync.tu/with-repository [url]
    (mt/with-temporary-setting-values [remote-sync-url    nil
                                       remote-sync-token  nil
                                       remote-sync-branch nil
                                       remote-sync-type   :read-write]
      (mt/with-temp [:model/Collection collection {:name "To sync" :location "/"}]
        (testing "saving the settings checks the repository, syncs the default branch, and the given collections"
          (is (= {:success true}
                 (mt/user-http-request :crowberto :put 200 "ee/remote-sync/settings"
                                       {:remote-sync-url  url
                                        :remote-sync-type "read-write"
                                        :collections      {(:id collection) true}})))
          (is (= "main" (mt/user-http-request :crowberto :get 200 "setting/remote-sync-branch")))
          (is (true? (t2/select-one-fn :is_remote_synced :model/Collection :id (:id collection)))))
        (testing "a repository URL with a scheme other than http, https or file is refused"
          (is (re-find #"Use an HTTP or HTTPS repository URL"
                       (mt/user-http-request :crowberto :put 400 "ee/remote-sync/settings"
                                             {:remote-sync-url "ftp://example.com/repo.git"}))))
        (testing "a branch the repository lacks is refused"
          (is (re-find #"The repository has no branch missing"
                       (mt/user-http-request :crowberto :put 400 "ee/remote-sync/settings"
                                             {:remote-sync-url url :remote-sync-branch "missing"}))))
        (testing "a blank URL turns remote sync off and stops syncing collections"
          (mt/user-http-request :crowberto :put 200 "ee/remote-sync/settings" {:remote-sync-url ""})
          (is (false? (mt/user-http-request :crowberto :get 200 "setting/remote-sync-enabled")))
          (is (false? (t2/select-one-fn :is_remote_synced :model/Collection :id (:id collection)))))))))

(deftest test-connection-test
  (remote-sync.tu/with-repository [url]
    (testing "a reachable repository passes"
      (is (= {:status "success"}
             (mt/user-http-request :crowberto :post 200 "ee/remote-sync/test-connection" {:remote-sync-url url}))))
    (testing "a repository that can't be reached fails"
      (mt/user-http-request :crowberto :post 400 "ee/remote-sync/test-connection"
                            {:remote-sync-url (str url "-missing")}))))

(deftest push-and-pull-test
  (remote-sync.tu/with-repository [url]
    (remote-sync.tu/with-remote-sync [url :read-write]
      (mt/with-model-cleanup [:model/RemoteSyncTask]
        (mt/with-temp [:model/Collection synced {:name "Synced" :is_remote_synced true :location "/"}
                       :model/Card       card   {:name "Synced card" :collection_id (:id synced)}]
          (testing "the synced content not pushed yet is dirty"
            (is (= {:is_dirty true} (mt/user-http-request :crowberto :get 200 "ee/remote-sync/is-dirty")))
            (is (=? {:dirty [{:id (:id card) :name "Synced card" :model "card" :sync_status "create"
                              :data {:collection {:id (:id synced) :name "Synced"}}}]}
                    (update (mt/user-http-request :crowberto :get 200 "ee/remote-sync/dirty")
                            :dirty #(filterv (comp #{"card"} :model) %)))))
          (testing "a push commits it, after which nothing is dirty and the remote has no changes"
            (let [{:keys [task_id]} (mt/user-http-request :crowberto :post 200 "ee/remote-sync/export"
                                                          {:branch "main" :message "Push synced content"})]
              (is (=? {:id task_id :status "successful" :outcome {:kind "pushed"}}
                      (remote-sync.tu/wait-for-task! task_id))))
            (is (some? (remote-sync.tu/entity-path! url "main" card)))
            (is (= {:is_dirty false} (mt/user-http-request :crowberto :get 200 "ee/remote-sync/is-dirty")))
            (is (=? {:has_changes false} (mt/user-http-request :crowberto :get 200 "ee/remote-sync/has-remote-changes"))))
          (testing "a pull loads the changes of the remote"
            (let [path (remote-sync.tu/entity-path! url "main" card)]
              (remote-sync.tu/commit! url "main" {path (str/replace (remote-sync.tu/read-file! url "main" path)
                                                                    "name: Synced card" "name: Renamed remotely")}))
            (is (=? {:has_changes true} (mt/user-http-request :crowberto :get 200 "ee/remote-sync/has-remote-changes")))
            (let [{:keys [task_id]} (mt/user-http-request :crowberto :post 200 "ee/remote-sync/import" {:branch "main"})]
              (is (=? {:id task_id :status "successful" :outcome {:kind "pulled"}}
                      (remote-sync.tu/wait-for-task! task_id))))
            (is (= "Renamed remotely" (t2/select-one-fn :name :model/Card :id (:id card))))))))))

(deftest dirty-parents-test
  (remote-sync.tu/with-repository [url]
    (remote-sync.tu/with-remote-sync [url :read-write]
      (mt/with-temp [:model/Collection        synced  {:name "Synced" :is_remote_synced true :location "/"}
                     :model/Table             table   {:db_id         (mt/id)
                                                       :name          "synced_table"
                                                       :is_published  true
                                                       :collection_id (:id synced)}
                     :model/Field             field   {:table_id (:id table) :name "id" :base_type :type/Integer}
                     :model/TableUserSettings _       {:table_id (:id table) :is_published true :collection_id (:id synced)}
                     :model/FieldUserSettings _       {:field_id (:id field) :description "Synced"}
                     :model/Segment           segment {:table_id   (:id table)
                                                       :name       "Synced segment"
                                                       :definition (let [mp (mt/metadata-provider)]
                                                                     (-> (lib/query mp (lib.metadata/table mp (:id table)))
                                                                         (lib/filter (lib/= (lib.metadata/field mp (:id field)) 1))))}]
        (testing "the changes of a table's segments and fields carry their table and its collection in their data"
          (is (=? [{:model "fieldusersettings"
                    :id    (:id field)
                    :data  {:field {:table {:id (:id table) :name "synced_table" :collection {:id (:id synced)}}}}}
                   {:model "segment"
                    :id    (:id segment)
                    :data  {:table {:id (:id table) :name "synced_table" :collection {:id (:id synced)}}}}]
                  (->> (:dirty (mt/user-http-request :crowberto :get 200 "ee/remote-sync/dirty"))
                       (filter (comp #{(:id field) (:id segment)} :id))
                       (filter (comp #{"fieldusersettings" "segment"} :model))
                       (sort-by :model)))))))))

(deftest dimension-push-and-pull-test
  (remote-sync.tu/with-repository [url]
    (remote-sync.tu/with-remote-sync [url :read-write]
      (mt/with-model-cleanup [:model/RemoteSyncTask]
        (mt/with-temp [:model/Collection        synced    {:name "Synced" :is_remote_synced true :location "/"}
                       :model/Table             table     {:db_id         (mt/id)
                                                           :name          "synced_table"
                                                           :is_published  true
                                                           :collection_id (:id synced)}
                       :model/Field             field     {:table_id (:id table) :name "user_id" :base_type :type/Integer}
                       :model/Field             target    {:table_id (:id table) :name "user_name" :base_type :type/Text}
                       :model/TableUserSettings _         {:table_id (:id table) :is_published true :collection_id (:id synced)}
                       :model/Dimension         dimension {:field_id                (:id field)
                                                           :name                    "User"
                                                           :type                    :external
                                                           :human_readable_field_id (:id target)}]
          (testing "a remapping of a synced table's field is dirty, with its field, table and collection in its data"
            (is (=? [{:model       "dimension"
                      :id          (:id dimension)
                      :name        "User"
                      :sync_status "create"
                      :data        {:field {:id    (:id field)
                                            :table {:id (:id table) :collection {:id (:id synced)}}}}}]
                    (filter (comp #{"dimension"} :model)
                            (:dirty (mt/user-http-request :crowberto :get 200 "ee/remote-sync/dirty"))))))
          (testing "a push commits the remapping with its human-readable field by name, after which nothing is dirty"
            (is (=? {:status "successful" :outcome {:kind "pushed"}} (push!)))
            (let [yaml (remote-sync.tu/read-file! url "main" (remote-sync.tu/entity-path! url "main" dimension))]
              (is (re-find #"(?s)human_readable_field_id:.*synced_table.*user_name" yaml))
              (is (not (re-find (re-pattern (str "human_readable_field_id: " (:id target) "\\b")) yaml))))
            (is (= {:is_dirty false} (mt/user-http-request :crowberto :get 200 "ee/remote-sync/is-dirty"))))
          (testing "a pull loads the remapping changed remotely, with its human-readable field by its local id"
            (rename-remotely! url dimension "Renamed remotely")
            (let [{:keys [task_id]} (mt/user-http-request :crowberto :post 200 "ee/remote-sync/import" {:branch "main"})]
              (is (=? {:status "successful" :outcome {:kind "pulled"}}
                      (remote-sync.tu/wait-for-task! task_id))))
            (is (=? {:name "Renamed remotely" :type :external :human_readable_field_id (:id target)}
                    (t2/select-one :model/Dimension :id (:id dimension)))))
          (testing "a remapping removed locally is dirty, and a push removes its file"
            (let [path (remote-sync.tu/entity-path! url "main" dimension)]
              (t2/delete! :model/Dimension :id (:id dimension))
              (is (=? [{:model "dimension" :sync_status "delete"}]
                      (filter (comp #{"dimension"} :model)
                              (:dirty (mt/user-http-request :crowberto :get 200 "ee/remote-sync/dirty")))))
              (is (=? {:status "successful" :outcome {:kind "pushed"}} (push!)))
              (is (not (contains? (set (remote-sync.tu/files! url "main")) path))))))))))

(deftest dimension-removed-remotely-test
  (remote-sync.tu/with-repository [url]
    (remote-sync.tu/with-remote-sync [url :read-write]
      (mt/with-model-cleanup [:model/RemoteSyncTask]
        (mt/with-temp [:model/Collection        synced    {:name "Synced" :is_remote_synced true :location "/"}
                       :model/Table             table     {:db_id         (mt/id)
                                                           :name          "synced_table"
                                                           :is_published  true
                                                           :collection_id (:id synced)}
                       :model/Field             field     {:table_id (:id table) :name "id" :base_type :type/Integer}
                       :model/TableUserSettings _         {:table_id (:id table) :is_published true :collection_id (:id synced)}
                       :model/Dimension         dimension {:field_id (:id field) :name "Remapped id" :type :internal}]
          (is (=? {:status "successful" :outcome {:kind "pushed"}} (push!)))
          (testing "a remapping whose file is removed remotely is deleted by a pull"
            (remote-sync.tu/commit! url "main" {(remote-sync.tu/entity-path! url "main" dimension) nil})
            (let [{:keys [task_id]} (mt/user-http-request :crowberto :post 200 "ee/remote-sync/import" {:branch "main"})]
              (is (=? {:status "successful" :outcome {:kind "pulled"}}
                      (remote-sync.tu/wait-for-task! task_id))))
            (is (not (t2/exists? :model/Dimension :id (:id dimension))))))))))

(deftest dimension-of-unsynced-table-test
  (remote-sync.tu/with-repository [url]
    (remote-sync.tu/with-remote-sync [url :read-write]
      (mt/with-temp [:model/Collection        synced      {:name "Synced" :is_remote_synced true :location "/"}
                     :model/Collection        unsynced    {:name "Unsynced" :location "/"}
                     :model/Table             unpublished {:db_id (mt/id) :name "unpublished_table"}
                     :model/Table             elsewhere   {:db_id         (mt/id)
                                                           :name          "elsewhere_table"
                                                           :is_published  true
                                                           :collection_id (:id unsynced)}
                     :model/Field             field-1     {:table_id (:id unpublished) :name "id" :base_type :type/Integer}
                     :model/Field             field-2     {:table_id (:id elsewhere) :name "id" :base_type :type/Integer}
                     :model/TableUserSettings _           {:table_id      (:id unpublished)
                                                           :is_published  false
                                                           :collection_id (:id synced)}
                     :model/TableUserSettings _           {:table_id      (:id elsewhere)
                                                           :is_published  true
                                                           :collection_id (:id unsynced)}
                     :model/Dimension         _           {:field_id (:id field-1) :name "Unpublished" :type :internal}
                     :model/Dimension         _           {:field_id (:id field-2) :name "Elsewhere" :type :internal}]
        (testing "remappings of unpublished tables and of tables published in unsynced collections are not dirty"
          (is (empty? (filter (comp #{"dimension"} :model)
                              (:dirty (mt/user-http-request :crowberto :get 200 "ee/remote-sync/dirty"))))))))))

(deftest data-app-bundle-test
  (remote-sync.tu/with-repository [url]
    (remote-sync.tu/with-remote-sync [url :read-write]
      (mt/with-additional-premium-features #{:data-apps}
        (mt/with-model-cleanup [:model/RemoteSyncTask]
          (mt/with-temp [:model/DataApp _ {:slug        "bundled-app"
                                           :bundle_path "dist/index.js"
                                           :bundle      (.getBytes "console.log(1);" "UTF-8")}]
            (testing "a changed data app is named by its slug, which its Data Studio URL takes"
              (is (=? [{:model "dataapp" :name "bundled-app"}]
                      (filter (comp #{"dataapp"} :model)
                              (:dirty (mt/user-http-request :crowberto :get 200 "ee/remote-sync/dirty"))))))
            (testing "a push writes the bundle of a data app, after which the app isn't changed"
              (push!)
              (is (= "console.log(1);"
                     (remote-sync.tu/read-file! url "main" "data_apps/bundled-app/dist/index.js")))
              (is (not-any? (comp #{"dataapp"} :model)
                            (:dirty (mt/user-http-request :crowberto :get 200 "ee/remote-sync/dirty")))))))))))

(deftest export-checks-branch-test
  (remote-sync.tu/with-repository [url]
    (remote-sync.tu/with-remote-sync [url :read-write]
      (testing "a push to a branch other than the synced one is refused"
        (is (=? {:branch_mismatch true :current_branch "main"}
                (mt/user-http-request :crowberto :post 409 "ee/remote-sync/export" {:branch "other"}))))
      (testing "a push is refused on a read-only instance"
        (mt/with-temporary-setting-values [remote-sync-type :read-only]
          (mt/user-http-request :crowberto :post 400 "ee/remote-sync/export" {:branch "main"}))))))

(deftest branches-test
  (remote-sync.tu/with-repository [url]
    (remote-sync.tu/with-remote-sync [url :read-write]
      (testing "the branches of the repository are listed"
        (is (= {:items ["main"]} (mt/user-http-request :crowberto :get 200 "ee/remote-sync/branches")))))))

(deftest stash-test
  (remote-sync.tu/with-repository [url]
    (remote-sync.tu/with-remote-sync [url :read-write]
      (mt/with-model-cleanup [:model/RemoteSyncTask]
        (mt/with-temp [:model/Collection synced {:name "Synced" :is_remote_synced true :location "/"}
                       :model/Card       card   {:name "Synced card" :collection_id (:id synced)}]
          (testing "stashing pushes the synced content to a new branch and syncs with it"
            (let [{:keys [task_id]} (mt/user-http-request :crowberto :post 200 "ee/remote-sync/stash"
                                                          {:new_branch "stashed" :message "Stash"})]
              (is (=? {:status "successful"} (remote-sync.tu/wait-for-task! task_id))))
            (is (some? (remote-sync.tu/entity-path! url "stashed" card)))
            (is (nil? (remote-sync.tu/entity-path! url "main" card)))
            (is (= "stashed" (mt/user-http-request :crowberto :get 200 "setting/remote-sync-branch")))))))))

(deftest cancel-without-task-test
  (testing "there is nothing to cancel when no task runs"
    (mt/with-model-cleanup [:model/RemoteSyncTask]
      (t2/delete! :model/RemoteSyncTask)
      (mt/user-http-request :crowberto :post 400 "ee/remote-sync/current-task/cancel"))))

(deftest dirty-with-unknown-base-version-test
  (remote-sync.tu/with-repository [url]
    (remote-sync.tu/with-remote-sync [url :read-write]
      (mt/with-model-cleanup [:model/RemoteSyncTask]
        (mt/with-temp [:model/Collection synced {:name "Synced" :is_remote_synced true :location "/"}
                       :model/Card       _      {:name "Synced card" :collection_id (:id synced)}
                       :model/RemoteSyncTask _  {:sync_task_type "export" :version "0000000000000000000000000000000000000000"
                                                 :started_at :%now :ended_at :%now}]
          (testing "all synced content is dirty when the repository lacks the version of the last sync"
            (is (= {:is_dirty true} (mt/user-http-request :crowberto :get 200 "ee/remote-sync/is-dirty")))
            (is (=? {:dirty [{:name "Synced card" :sync_status "create"}]}
                    (update (mt/user-http-request :crowberto :get 200 "ee/remote-sync/dirty")
                            :dirty #(filterv (comp #{"card"} :model) %))))))))))

(deftest settings-refuse-nested-collections-test
  (remote-sync.tu/with-repository [url]
    (remote-sync.tu/with-remote-sync [url :read-write]
      (mt/with-temp [:model/Collection parent {:name "Parent" :location "/"}
                     :model/Collection child  {:name "Child" :location (format "/%d/" (:id parent))}]
        (testing "only top-level collections can be synced"
          (mt/user-http-request :crowberto :put 400 "ee/remote-sync/settings" {:collections {(:id child) true}})
          (is (false? (t2/select-one-fn :is_remote_synced :model/Collection :id (:id child))))
          (mt/user-http-request :crowberto :put 200 "ee/remote-sync/settings" {:collections {(:id parent) true}})
          (is (true? (t2/select-one-fn :is_remote_synced :model/Collection :id (:id parent)))))))))

(deftest settings-refuse-unsyncing-library-test
  (remote-sync.tu/with-repository [url]
    (remote-sync.tu/with-remote-sync [url :read-write]
      (mt/with-temp [:model/Collection library {:name "Library" :location "/" :type "library" :is_remote_synced true}]
        (testing "the Library keeps syncing"
          (is (re-find #"The Library always syncs"
                       (mt/user-http-request :crowberto :put 400 "ee/remote-sync/settings"
                                             {:collections {(:id library) false}})))
          (is (true? (t2/select-one-fn :is_remote_synced :model/Collection :id (:id library)))))))))

(deftest settings-refuse-unsynced-dependencies-test
  (remote-sync.tu/with-repository [url]
    (remote-sync.tu/with-remote-sync [url :read-write]
      (mt/with-temp [:model/Collection    synced    {:name "Synced" :location "/"}
                     :model/Collection    unsynced  {:name "Unsynced" :location "/"}
                     :model/Card          card      {:name "Card in Unsynced" :collection_id (:id unsynced)}
                     :model/Dashboard     dashboard {:name "Dashboard in Synced" :collection_id (:id synced)}
                     :model/DashboardCard _         {:dashboard_id (:id dashboard) :card_id (:id card)}]
        (let [synced? #(t2/select-one-fn :is_remote_synced :model/Collection :id (:id %))
              listed  (fn [response]
                        (update response :unsynced_dependencies #(filterv (comp #{(:id card)} :id) %)))]
          (testing "syncing a collection whose content uses content that isn't synced is refused, naming it"
            (is (=? {:error-code            "unsynced-dependencies"
                     :unsynced_dependencies [{:id      (:id card)
                                              :model   "card"
                                              :data    {:name       "Card in Unsynced"
                                                        :collection {:id (:id unsynced) :name "Unsynced"}}
                                              :used_by [{:id    (:id dashboard)
                                                         :model "dashboard"
                                                         :data  {:name "Dashboard in Synced"}}]}]}
                    (listed (mt/user-http-request :crowberto :put 400 "ee/remote-sync/settings"
                                                  {:collections {(:id synced) true}}))))
            (is (false? (synced? synced))))
          (testing "syncing it together with the collection it depends on is saved"
            (mt/user-http-request :crowberto :put 200 "ee/remote-sync/settings"
                                  {:collections {(:id synced) true (:id unsynced) true}})
            (is (true? (synced? synced)))
            (is (true? (synced? unsynced))))
          (testing "no longer syncing the collection synced content depends on is refused"
            (is (=? {:unsynced_dependencies [{:id (:id card)}]}
                    (listed (mt/user-http-request :crowberto :put 400 "ee/remote-sync/settings"
                                                  {:collections {(:id unsynced) false}}))))
            (is (true? (synced? unsynced)))))))))

(deftest export-preflight-test
  (remote-sync.tu/with-repository [url]
    (remote-sync.tu/with-remote-sync [url :read-write]
      (mt/with-model-cleanup [:model/RemoteSyncTask]
        (mt/with-temp [:model/Collection synced {:name "Synced" :is_remote_synced true :location "/"}
                       :model/Card       card   {:name "Synced card" :collection_id (:id synced)}]
          (let [preflight #(mt/user-http-request :crowberto :get 200 "ee/remote-sync/export-preflight" :branch "main")]
            (push!)
            (testing "after a push the remote has no changes, and a push merges cleanly"
              (is (= {:has_changes           false
                      :clean                 true
                      :conflicts             []
                      :summary               {:added 0 :updated 0 :removed 0}
                      :force_push_casualties {:deleted [] :overwritten []}
                      :reason                nil}
                     (preflight))))
            (rename-remotely! url card "Renamed remotely")
            (testing "a remote change merges in, and a force push would overwrite it"
              (is (= {:has_changes           true
                      :clean                 true
                      :conflicts             []
                      :summary               {:added 0 :updated 1 :removed 0}
                      :force_push_casualties {:deleted [] :overwritten ["Renamed remotely"]}
                      :reason                nil}
                     (preflight))))
            (t2/update! :model/Card :id (:id card) {:name "Renamed locally"})
            (testing "a local change to the entity the remote changed conflicts"
              (is (=? {:has_changes true :clean false :conflicts ["Renamed locally"]}
                      (preflight))))
            (testing "a remote whose history lacks the version of the last sync was rewritten"
              (mt/with-temp [:model/RemoteSyncTask _ {:sync_task_type "export"
                                                      :version        "0000000000000000000000000000000000000000"
                                                      :started_at     (t/plus (t/offset-date-time) (t/hours 1))
                                                      :ended_at       (t/plus (t/offset-date-time) (t/hours 1))}]
                (is (=? {:has_changes true :reason "history-rewritten"}
                        (preflight)))))
            (testing "a branch other than the synced one is refused"
              (is (=? {:branch_mismatch true :current_branch "main"}
                      (mt/user-http-request :crowberto :get 409 "ee/remote-sync/export-preflight" :branch "other"))))))))))
