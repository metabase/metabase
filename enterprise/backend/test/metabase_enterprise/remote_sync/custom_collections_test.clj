(ns metabase-enterprise.remote-sync.custom-collections-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.remote-sync.impl :as impl]
   [metabase-enterprise.remote-sync.settings :as settings]
   [metabase-enterprise.remote-sync.source :as source]
   [metabase-enterprise.remote-sync.source.protocol :as source.p]
   [metabase-enterprise.remote-sync.test-helpers :as test-helpers]
   [metabase.collections.models.collection :as collection]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :each test-helpers/clean-remote-sync-state)

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
        (t2/delete! :model/Collection :type [:in [collection/library-collection-type
                                                  collection/library-data-collection-type
                                                  collection/library-metrics-collection-type
                                                  collection/library-dashboards-collection-type]])
        (when (seq library)
          (t2/insert! :model/Collection library))))))

(defmacro ^:private with-git-sync
  [& body]
  `(let [mock-source# (test-helpers/create-mock-source)]
     (mt/with-premium-features #{:remote-sync :library :transforms-basic}
       (mt/with-dynamic-fn-redefs [settings/check-git-settings! (constantly nil)
                                   source/source-from-settings  (constantly mock-source#)
                                   impl/finish-remote-config!   (constantly nil)]
         ~@body))))

(defn- library []
  (t2/select-one :model/Collection :type collection/library-collection-type))

(deftest read-write-setup-syncs-library-test
  (do-without-library
   (fn []
     (with-git-sync
       (mt/with-temporary-setting-values [remote-sync-url nil remote-sync-type :read-write]
         (mt/user-http-request :crowberto :put 200 "ee/remote-sync/settings"
                               {:remote-sync-url "https://github.com/test/repo.git" :remote-sync-branch "main"})
         (is (=? {:is_remote_synced true} (library)))
         (is (true? (settings/remote-sync-transforms))))))))

(deftest read-only-setup-leaves-library-to-pull-test
  (do-without-library
   (fn []
     (with-git-sync
       (mt/with-temporary-setting-values [remote-sync-url nil remote-sync-type :read-only remote-sync-branch "main"]
         (mt/user-http-request :crowberto :put 200 "ee/remote-sync/settings"
                               {:remote-sync-url "https://github.com/test/repo.git" :remote-sync-type :read-only})
         (is (nil? (library)))
         (is (false? (settings/remote-sync-transforms))))))))

(deftest setup-with-custom-collections-keeps-choices-test
  (do-without-library
   (fn []
     (with-git-sync
       (mt/with-temporary-setting-values [remote-sync-url nil remote-sync-type :read-write
                                          remote-sync-collections-enabled true]
         (mt/user-http-request :crowberto :put 200 "ee/remote-sync/settings"
                               {:remote-sync-url "https://github.com/test/repo.git" :remote-sync-branch "main"})
         (is (nil? (library)))
         (is (false? (settings/remote-sync-transforms))))))))

(deftest setup-without-library-feature-test
  (do-without-library
   (fn []
     (with-git-sync
       (mt/with-temporary-setting-values [remote-sync-url nil remote-sync-type :read-write]
         (mt/with-premium-features #{:remote-sync}
           (mt/user-http-request :crowberto :put 200 "ee/remote-sync/settings"
                                 {:remote-sync-url "https://github.com/test/repo.git" :remote-sync-branch "main"}))
         (is (nil? (library))))))))

(deftest settings-reject-custom-collection-test
  (with-git-sync
    (mt/with-temporary-setting-values [remote-sync-url "https://github.com/test/repo.git" remote-sync-type :read-write]
      (mt/with-temp [:model/Collection {coll-id :id} {:location "/"}]
        (mt/user-http-request :crowberto :put 400 "ee/remote-sync/settings" {:collections {coll-id true}})
        (is (false? (t2/select-one-fn :is_remote_synced :model/Collection :id coll-id)))))))

(deftest turning-custom-collections-off-unsyncs-them-test
  (with-git-sync
    (mt/with-temporary-setting-values [remote-sync-url "https://github.com/test/repo.git" remote-sync-type :read-write
                                       remote-sync-collections-enabled true]
      (mt/with-temp [:model/Collection {custom-id :id} {:location "/" :is_remote_synced true}
                     :model/Collection {child-id :id}  {:location (str "/" custom-id "/") :is_remote_synced true}
                     :model/Collection {other-id :id}  {:location "/" :namespace "transforms"}]
        (mt/user-http-request :crowberto :put 200 "ee/remote-sync/settings" {:remote-sync-collections-enabled false})
        (is (false? (settings/remote-sync-collections-enabled)))
        (is (= {custom-id false child-id false}
               (t2/select-pk->fn :is_remote_synced :model/Collection :id [:in [custom-id child-id]])))
        (is (t2/exists? :model/Collection :id other-id))))))

(deftest model-rejects-custom-synced-collection-test
  (with-git-sync
    (mt/with-temporary-setting-values [remote-sync-url "https://github.com/test/repo.git"]
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"can only sync the Library"
                            (t2/insert! :model/Collection {:name "Custom" :location "/" :is_remote_synced true})))
      (mt/with-temp [:model/Collection {coll-id :id} {:location "/"}]
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"can only sync the Library"
                              (t2/update! :model/Collection coll-id {:type "remote-synced"}))))
      (mt/with-temp [:model/Collection {snippets-id :id} {:location "/" :namespace "snippets" :is_remote_synced true}]
        (is (true? (t2/select-one-fn :is_remote_synced :model/Collection :id snippets-id))))
      (do-without-library
       (fn []
         (let [library (collection/create-library-collection!)
               data    (t2/select-one :model/Collection :type collection/library-data-collection-type)]
           (t2/update! :model/Collection (:id library) {:is_remote_synced true})
           (t2/update! :model/Collection (:id data) {:is_remote_synced true})
           (is (true? (t2/select-one-fn :is_remote_synced :model/Collection :id (:id data))))))))))

(deftest pull-rejects-custom-collection-test
  (with-git-sync
    (mt/with-temporary-setting-values [remote-sync-url "https://github.com/test/repo.git" remote-sync-type :read-only
                                       remote-sync-branch "main"]
      (let [mock-source (test-helpers/create-mock-source
                         :initial-files {"main" {"collections/main/custom.yaml"
                                                 (test-helpers/generate-collection-yaml "customCollectionxxxx1" "Custom"
                                                                                        :is-remote-synced true)}})
            task-id     (t2/insert-returning-pk! :model/RemoteSyncTask {:sync_task_type "import" :initiated_by (mt/user->id :rasta)})]
        (is (=? {:status :error :message #"Import failed: could not save Collection `Custom`.*can only sync the Library.*"}
                (impl/import! (source.p/snapshot mock-source) task-id)))
        (is (not (t2/exists? :model/Collection :entity_id "customCollectionxxxx1")))))))
