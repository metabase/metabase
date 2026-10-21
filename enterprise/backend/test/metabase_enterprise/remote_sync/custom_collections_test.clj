(ns metabase-enterprise.remote-sync.custom-collections-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.remote-sync.impl :as impl]
   [metabase-enterprise.remote-sync.settings :as settings]
   [metabase-enterprise.remote-sync.source :as source]
   [metabase-enterprise.remote-sync.source.protocol :as source.p]
   [metabase-enterprise.remote-sync.test-helpers :as test-helpers]
   [metabase.collections.models.collection :as collection]
   [metabase.startup.core :as startup]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :each
  test-helpers/clean-remote-sync-state
  (fn [f]
    (mt/with-premium-features #{:remote-sync}
      (f))))

(defn- do-without-library
  [thunk]
  (let [library-ids (t2/select-pks-vec :model/Collection :type collection/library-collection-type)
        library     (when (seq library-ids)
                      (t2/select :model/Collection {:where [:or
                                                            [:in :id library-ids]
                                                            [:like :location (str "/" (first library-ids) "/%")]]}))]
    (t2/delete! :model/Collection :id [:in (map :id library)])
    (try
      (thunk)
      (finally
        (t2/delete! :model/Collection :type [:in (vec collection/library-collection-types)])
        (when (seq library)
          (t2/insert! :model/Collection library))))))

(deftest rejects-custom-synced-collection-test
  (mt/with-model-cleanup [:model/Collection]
    (mt/with-temporary-setting-values [remote-sync-url nil]
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"syncs only the Library"
                            (t2/insert! :model/Collection {:name "Custom" :location "/" :is_remote_synced true})))
      (mt/with-premium-features #{:remote-sync :tenants}
        (mt/with-temporary-setting-values [use-tenants true]
          (is (thrown-with-msg? clojure.lang.ExceptionInfo #"syncs only the Library"
                                (t2/insert! :model/Collection {:name "Tenant" :location "/" :namespace "shared-tenant-collection"
                                                               :is_remote_synced true})))))
      (mt/with-temp [:model/Collection {coll-id :id} {:location "/"}]
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"syncs only the Library"
                              (t2/update! :model/Collection coll-id {:type "remote-synced"})))))))

(deftest keeps-synced-collections-editable-test
  (mt/with-temp [:model/Collection {coll-id :id} {:location "/"}]
    (t2/query {:update :collection :set {:is_remote_synced true} :where [:= :id coll-id]})
    (t2/update! :model/Collection coll-id {:name "Renamed"})
    (is (= "Renamed" (t2/select-one-fn :name :model/Collection :id coll-id)))
    (t2/update! :model/Collection coll-id {:is_remote_synced false})
    (is (false? (t2/select-one-fn :is_remote_synced :model/Collection :id coll-id)))))

(deftest allows-library-and-other-namespaces-test
  (mt/with-temp [:model/Collection {snippets-id :id} {:location "/" :namespace "snippets" :is_remote_synced true}]
    (is (true? (t2/select-one-fn :is_remote_synced :model/Collection :id snippets-id))))
  (do-without-library
   (fn []
     (let [library (collection/create-library-collection!)
           data    (t2/select-one :model/Collection :type collection/library-data-collection-type)]
       (t2/update! :model/Collection (:id library) {:is_remote_synced true})
       (t2/update! :model/Collection (:id data) {:is_remote_synced true})
       (is (true? (t2/select-one-fn :is_remote_synced :model/Collection :id (:id data))))
       (mt/with-temp [:model/Collection {inner-id :id} {:location (str (:location data) (:id data) "/") :type nil :is_remote_synced true}]
         (is (true? (t2/select-one-fn :is_remote_synced :model/Collection :id inner-id))))))))

(deftest allows-custom-synced-collection-when-enabled-test
  (mt/with-temporary-setting-values [remote-sync-custom-collections-enabled true]
    (mt/with-temp [:model/Collection {coll-id :id} {:location "/" :is_remote_synced true}]
      (is (true? (t2/select-one-fn :is_remote_synced :model/Collection :id coll-id))))))

(deftest settings-reject-custom-collection-test
  (mt/with-dynamic-fn-redefs [settings/check-git-settings! (constantly nil)
                              source/source-from-settings  (constantly (test-helpers/create-mock-source))
                              impl/finish-remote-config!   (constantly nil)]
    (mt/with-temporary-setting-values [remote-sync-url "https://github.com/test/repo.git" remote-sync-type :read-write]
      (mt/with-temp [:model/Collection {coll-id :id} {:location "/"}]
        (mt/user-http-request :crowberto :put 400 "ee/remote-sync/settings" {:collections {coll-id true}})
        (is (false? (t2/select-one-fn :is_remote_synced :model/Collection :id coll-id)))))))

(deftest turning-off-requires-no-custom-synced-collections-test
  (mt/with-temporary-setting-values [remote-sync-custom-collections-enabled true]
    (mt/with-temp [:model/Collection {coll-id :id} {:location "/" :is_remote_synced true}]
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Stop syncing the collections"
                            (settings/remote-sync-custom-collections-enabled! false)))
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Stop syncing the collections"
                            (settings/remote-sync-custom-collections-enabled! "false")))
      (mt/user-http-request :crowberto :put 400 "setting/remote-sync-custom-collections-enabled" {:value false})
      (is (true? (settings/remote-sync-custom-collections-enabled)))
      (t2/update! :model/Collection coll-id {:is_remote_synced false})
      (settings/remote-sync-custom-collections-enabled! false)
      (is (false? (settings/remote-sync-custom-collections-enabled))))))

(deftest env-var-requires-no-custom-synced-collections-test
  (mt/with-temporary-setting-values [remote-sync-url "https://github.com/test/repo.git"
                                     remote-sync-custom-collections-enabled true]
    (mt/with-temp [:model/Collection _ {:location "/" :is_remote_synced true}]
      (mt/with-temp-env-var-value! [mb-remote-sync-custom-collections-enabled "false"]
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Stop syncing the collections"
                              (startup/def-startup-validation! ::settings/remote-sync-custom-collections-enabled)))))))

(deftest stored-value-requires-no-custom-synced-collections-test
  (mt/with-temporary-setting-values [remote-sync-url "https://github.com/test/repo.git"
                                     remote-sync-custom-collections-enabled true]
    (mt/with-temp [:model/Collection _ {:location "/" :is_remote_synced true}]
      (mt/with-temporary-raw-setting-values [remote-sync-custom-collections-enabled "false"]
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Stop syncing the collections"
                              (startup/def-startup-validation! ::settings/remote-sync-custom-collections-enabled)))))))

(deftest pull-rejects-custom-collection-test
  (mt/with-temporary-setting-values [remote-sync-url "https://github.com/test/repo.git" remote-sync-type :read-only
                                     remote-sync-branch "main"]
    (let [mock-source (test-helpers/create-mock-source
                       :initial-files {"main" {"collections/main/custom.yaml"
                                               (test-helpers/generate-collection-yaml "customCollectionxxxx1" "Custom"
                                                                                      :is-remote-synced true)}})
          task-id     (t2/insert-returning-pk! :model/RemoteSyncTask {:sync_task_type "import" :initiated_by (mt/user->id :rasta)})]
      (is (=? {:status :error :message #"Import failed: could not save Collection `Custom`.*syncs only the Library.*"}
              (impl/import! (source.p/snapshot mock-source) task-id)))
      (is (not (t2/exists? :model/Collection :entity_id "customCollectionxxxx1"))))))
