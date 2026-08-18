(ns metabase-enterprise.data-apps.sync-test
  "Unit coverage for the materialization edge cases not exercised through the API
   suite: the `:changed` accounting (content vs. sha/timestamp bumps) and the
   oversized-bundle guard (rejected with a sync_error, previously cached bundle
   retained)."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.data-apps.resources :as data-app.resources]
   [metabase-enterprise.data-apps.sync :as data-app.sync]
   [metabase-enterprise.data-apps.test-util :as data-app.test-util]
   [metabase-enterprise.remote-sync.source :as source]
   [metabase.permissions.core :as perms]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private fake-sha "0123456789abcdef0123456789abcdef01234567")

(defn- snapshot
  [path->content & {:keys [sha] :or {sha fake-sha}}]
  {:sha       sha
   :list-dir  (fn [dir] (source/paths->children (keys path->content) dir))
   :read-file (fn [p] (get path->content p))})

(defn- app-files!
  "The repo files for one app in `data_apps/<dir>`. `dir` is the app's slug — the
   config declares no slug, it is the directory's name."
  [dir {:keys [name path bundle description resource_collection_entity_id permission_group_entity_id]}]
  (let [resource-ids (when-not (and resource_collection_entity_id permission_group_entity_id)
                       (data-app.test-util/ensure-manifest-resources! dir))
        resource_collection_entity_id (or resource_collection_entity_id
                                          (:resource_collection_entity_id resource-ids))
        permission_group_entity_id (or permission_group_entity_id
                                       (:permission_group_entity_id resource-ids))]
    {(format "data_apps/%s/data_app.yaml" dir)
     (format (str "name: %s\npath: %s\n%s"
                  "resource_collection_entity_id: %s\n"
                  "permission_group_entity_id: %s\n")
             name path
             (if description (format "description: %s\n" description) "")
             resource_collection_entity_id permission_group_entity_id)
     (format "data_apps/%s/%s" dir path) bundle}))

(deftest resource-provisioning-failures-are-isolated-test
  (mt/with-model-cleanup [:model/DataApp]
    (let [files (merge (app-files! "broken" {:name "Broken" :path "index.js" :bundle "BROKEN"})
                       (app-files! "working" {:name "Working" :path "index.js" :bundle "WORKING"}))]
      (with-redefs [data-app.resources/reconcile-resources!
                    (fn [app _manifest-resource-ids _app-changes]
                      (when (= "broken" (:name app))
                        (throw (ex-info "Resource provisioning failed." {})))
                      {:changed? false})]
        (is (=? {:synced 2 :changed 2}
                (data-app.sync/import-from-snapshot! (snapshot files))))
        (is (= "Resource provisioning failed."
               (t2/select-one-fn :sync_error :model/DataApp :name "broken")))
        (is (nil? (t2/select-one-fn :sync_error :model/DataApp :name "working")))))))

(deftest sync-creates-stable-permission-resources-test
  (mt/with-model-cleanup [:model/DataApp :model/Collection :model/PermissionsGroup]
    (let [files (app-files! "sales" {:name "Sales" :path "index.js" :bundle "V1"})]
      (data-app.sync/import-from-snapshot! (snapshot files))
      (let [{:keys [resource_collection_id permission_group_id]}
            (t2/select-one :model/DataApp :name "sales")]
        (testing "the first sync creates a dedicated group and collection"
          (is (pos-int? resource_collection_id))
          (is (pos-int? permission_group_id))
          (is (= "Data App: sales"
                 (t2/select-one-fn :name :model/Collection :id resource_collection_id)))
          (is (= "Data App: sales"
                 (t2/select-one-fn :name :model/PermissionsGroup :id permission_group_id)))
          (is (t2/exists? :model/Permissions
                          :group_id permission_group_id
                          :object (perms/collection-read-path resource_collection_id)))
          (is (not (t2/exists? :model/Permissions
                               :group_id permission_group_id
                               :object (perms/collection-readwrite-path resource_collection_id))))
          (let [permissions (t2/select-fn-vec :perm_value :model/DataPermissions
                                              :group_id permission_group_id
                                              :perm_type :perms/create-queries)]
            (is (every? #(= :no %) permissions))))
        (testing "removing the app deletes its resources"
          (data-app.sync/import-from-snapshot! (snapshot {}))
          (is (not (t2/exists? :model/Collection :id resource_collection_id)))
          (is (not (t2/exists? :model/PermissionsGroup :id permission_group_id))))))))

(deftest sync-binds-resources-with-manifest-entity-ids-test
  (mt/with-model-cleanup [:model/DataApp :model/Collection :model/PermissionsGroup]
    (t2/insert! :model/Collection
                {:name "Sales resources" :location "/" :entity_id "resourcecollectionid1"})
    (t2/insert! :model/PermissionsGroup
                {:name "Sales users" :entity_id "permissiongroupid0001"})
    (let [files {"data_apps/sales/data_app.yaml"
                 "name: Sales\npath: index.js\nresource_collection_entity_id: resourcecollectionid1\npermission_group_entity_id: permissiongroupid0001\n"
                 "data_apps/sales/index.js" "V1"}]
      (data-app.sync/import-from-snapshot! (snapshot files))
      (let [app (t2/select-one :model/DataApp :name "sales")]
        (is (= "resourcecollectionid1"
               (t2/select-one-fn :entity_id :model/Collection :id (:resource_collection_id app))))
        (is (= "permissiongroupid0001"
               (t2/select-one-fn :entity_id :model/PermissionsGroup :id (:permission_group_id app)))))
      (is (=? {:changed 0}
              (data-app.sync/import-from-snapshot! (snapshot files)))))))

(deftest sync-rebinds-resources-when-the-manifest-entity-ids-change-test
  (mt/with-model-cleanup [:model/DataApp :model/Collection :model/PermissionsGroup]
    (let [initial-files (app-files! "sales" {:name "Sales" :path "index.js" :bundle "V1"})]
      (data-app.sync/import-from-snapshot! (snapshot initial-files))
      (let [old-links             (select-keys (t2/select-one :model/DataApp :name "sales")
                                               [:resource_collection_id :permission_group_id])
            collection-entity-id  (data-app.test-util/test-entity-id "replacementcollection" "sales")
            group-entity-id       (data-app.test-util/test-entity-id "replacementgroup" "sales")
            {collection-id :id}   (t2/insert-returning-instance!
                                   :model/Collection
                                   {:name "Replacement collection"
                                    :location "/"
                                    :entity_id collection-entity-id})
            {group-id :id}        (t2/insert-returning-instance!
                                   :model/PermissionsGroup
                                   {:name "Replacement group"
                                    :entity_id group-entity-id})
            replacement-files     (app-files! "sales"
                                              {:name "Sales"
                                               :path "index.js"
                                               :bundle "V2"
                                               :resource_collection_entity_id collection-entity-id
                                               :permission_group_entity_id group-entity-id})]
        (data-app.sync/import-from-snapshot! (snapshot replacement-files))
        (let [app (t2/select-one :model/DataApp :name "sales")]
          (is (= {:resource_collection_id collection-id
                  :permission_group_id     group-id}
                 (select-keys app (keys old-links))))
          (is (= "V2" (String. ^bytes (:bundle app) "UTF-8")))
          (is (t2/exists? :model/Collection :id (:resource_collection_id old-links)))
          (is (t2/exists? :model/PermissionsGroup :id (:permission_group_id old-links))))))))

(deftest sync-keeps-last-good-state-when-a-manifest-resource-does-not-exist-test
  (mt/with-model-cleanup [:model/DataApp :model/Collection :model/PermissionsGroup]
    (let [initial-files (app-files! "sales" {:name "Sales" :path "index.js" :bundle "V1"})]
      (data-app.sync/import-from-snapshot! (snapshot initial-files))
      (let [before        (t2/select-one :model/DataApp :name "sales")
            invalid-files (app-files! "sales"
                                      {:name "Sales"
                                       :path "index.js"
                                       :bundle "V2"
                                       :resource_collection_entity_id
                                       (t2/select-one-fn :entity_id :model/Collection
                                                         :id (:resource_collection_id before))
                                       :permission_group_entity_id (data-app.test-util/test-entity-id "missinggroup" "sales")})]
        (data-app.sync/import-from-snapshot! (snapshot invalid-files))
        (let [after (t2/select-one :model/DataApp :name "sales")]
          (is (= (select-keys before [:resource_collection_id :permission_group_id])
                 (select-keys after [:resource_collection_id :permission_group_id])))
          (is (= "V1" (String. ^bytes (:bundle after) "UTF-8")))
          (is (str/includes? (:sync_error after) "does not identify an existing resource")))))))

(deftest sync-rejects-deleted-manifest-resources-test
  (mt/with-model-cleanup [:model/DataApp :model/Collection :model/PermissionsGroup]
    (let [files (app-files! "sales" {:name "Sales" :path "index.js" :bundle "V1"})]
      (data-app.sync/import-from-snapshot! (snapshot files))
      (let [before (select-keys (t2/select-one :model/DataApp :name "sales")
                                [:resource_collection_id :permission_group_id])]
        (t2/delete! :model/Collection :id (:resource_collection_id before))
        (t2/delete! :model/PermissionsGroup :id (:permission_group_id before))
        (data-app.sync/import-from-snapshot! (snapshot files))
        (let [app (t2/select-one :model/DataApp :name "sales")]
          (is (nil? (:resource_collection_id app)))
          (is (nil? (:permission_group_id app)))
          (is (str/includes? (:sync_error app) "does not identify an existing resource")))))))

(deftest changed-count-tracks-content-not-sha-bumps-test
  (mt/with-model-cleanup [:model/DataApp :model/Collection :model/PermissionsGroup]
    (let [files (app-files! "a" {:name "A" :path "index.js" :bundle "V1"})]
      (testing "the first sync counts the new app"
        (is (=? {:synced 1 :changed 1}
                (data-app.sync/import-from-snapshot! (snapshot files)))))
      (testing "re-syncing identical content at a new sha is not a change"
        (is (=? {:synced 1 :changed 0}
                (data-app.sync/import-from-snapshot!
                 (snapshot files :sha "ffffffffffffffffffffffffffffffffffffffff")))))
      (testing "a metadata-only change counts"
        (is (=? {:changed 1}
                (data-app.sync/import-from-snapshot!
                 (snapshot (app-files! "a" {:name "A renamed" :path "index.js" :bundle "V1"}))))))
      (testing "a bundle content change counts"
        (is (=? {:changed 1}
                (data-app.sync/import-from-snapshot!
                 (snapshot (app-files! "a" {:name "A renamed" :path "index.js" :bundle "V2"})))))))))

(deftest description-is-optional-and-tracked-like-other-metadata-test
  (mt/with-model-cleanup [:model/DataApp :model/Collection :model/PermissionsGroup]
    (let [sync-app (fn [& {:as app}]
                     (data-app.sync/import-from-snapshot!
                      (snapshot (app-files! "a" (merge {:name "A" :path "index.js" :bundle "V1"} app)))))]
      (testing "an app that declares no description syncs with a nil one"
        (sync-app)
        (is (nil? (t2/select-one-fn :description :model/DataApp :name "a"))))
      (testing "adding one counts as a change and is materialized"
        (is (=? {:changed 1} (sync-app :description "What this app does")))
        (is (= "What this app does" (t2/select-one-fn :description :model/DataApp :name "a"))))
      (testing "re-syncing the same description is not a change"
        (is (=? {:changed 0} (sync-app :description "What this app does"))))
      (testing "dropping it from the config clears the column"
        (is (=? {:changed 1} (sync-app)))
        (is (nil? (t2/select-one-fn :description :model/DataApp :name "a")))))))

(deftest metadata-edits-count-while-an-app-keeps-failing-test
  (testing "an app whose bundle is missing still stores metadata edits, so they count as changes"
    (mt/with-model-cleanup [:model/DataApp :model/Collection :model/PermissionsGroup]
      (let [resource-ids (data-app.test-util/ensure-manifest-resources! "a")
            sync-app    (fn [& {:as app}]
                          (let [files (app-files! "a" (merge {:name "A" :path "index.js" :bundle "unused"}
                                                             resource-ids app))]
                            (data-app.sync/import-from-snapshot!
                             (snapshot (dissoc files "data_apps/a/index.js")))))]
        (is (=? {:changed 1} (sync-app :description "First")) "the first failure is a change")
        (is (some? (t2/select-one-fn :sync_error :model/DataApp :name "a")))
        (testing "re-syncing the same failing app unchanged is not a change"
          (is (=? {:changed 0} (sync-app :description "First"))))
        (testing "editing the description is a change even though the bundle still fails"
          (is (=? {:changed 1} (sync-app :description "Second")))
          (is (= "Second" (t2/select-one-fn :description :model/DataApp :name "a"))
              "the edit is stored, which is why the pull cannot report it as a no-op"))))))

(deftest switching-repos-prunes-old-apps-overrides-shared-adds-new-test
  (testing "syncing a different repo: drop apps only the old repo had, override shared slugs, add new ones"
    (mt/with-model-cleanup [:model/DataApp :model/Collection :model/PermissionsGroup]
      ;; Repo A: Foo + Bar
      (data-app.sync/import-from-snapshot!
       (snapshot (merge (app-files! "foo" {:name "Foo" :path "index.js" :bundle "FOO"})
                        (app-files! "bar" {:name "Bar A" :path "index.js" :bundle "BAR-A"}))))
      (is (= #{"foo" "bar"} (t2/select-fn-set :name :model/DataApp)))
      ;; Repo B (Bar + Baz): the repo is the source of truth, so Foo (absent from B)
      ;; is pruned, Bar is overridden by slug, and Baz is added.
      (is (=? {:synced 2 :removed 1}
              (data-app.sync/import-from-snapshot!
               (snapshot (merge (app-files! "bar" {:name "Bar B" :path "index.js" :bundle "BAR-B"})
                                (app-files! "baz" {:name "Baz" :path "index.js" :bundle "BAZ"}))))))
      (is (= #{"bar" "baz"} (t2/select-fn-set :name :model/DataApp))
          "Foo (only in repo A) is dropped; Baz (from repo B) is added")
      (let [bar (t2/select-one :model/DataApp :name "bar")]
        (is (= "Bar B" (:display_name bar))
            "Bar is overridden in place by repo B (shared slug)")
        (is (= "BAR-B" (String. ^bytes (:bundle bar) "UTF-8"))
            "Bar's cached bundle is repo B's")))))

(deftest an-empty-repo-prunes-all-apps-test
  (testing "syncing a repo with no data_apps/ removes every app (the repo has none)"
    (mt/with-model-cleanup [:model/DataApp :model/Collection :model/PermissionsGroup]
      (data-app.sync/import-from-snapshot!
       (snapshot (app-files! "solo" {:name "Solo" :path "index.js" :bundle "S"})))
      (is (= #{"solo"} (t2/select-fn-set :name :model/DataApp)))
      (is (=? {:synced 0 :removed 1}
              (data-app.sync/import-from-snapshot! (snapshot {}))))
      (is (empty? (t2/select-fn-set :name :model/DataApp))))))

(deftest remote-sync-preserves-unpublished-data-app-drafts-test
  (mt/with-model-cleanup [:model/DataApp :model/Collection :model/PermissionsGroup]
    (data-app.sync/ensure-draft! "draft-app")
    (is (=? {:removed 0}
            (data-app.sync/import-from-snapshot! (snapshot {}))))
    (is (true? (t2/select-one-fn :draft :model/DataApp :name "draft-app")))
    (data-app.sync/import-from-snapshot!
     (snapshot (app-files! "draft-app" {:name "Draft" :path "index.js" :bundle "BUNDLE"})))
    (is (false? (t2/select-one-fn :draft :model/DataApp :name "draft-app")))
    (is (=? {:removed 1}
            (data-app.sync/import-from-snapshot! (snapshot {}))))
    (is (not (t2/exists? :model/DataApp :name "draft-app")))))

(deftest invalid-repository-config-does-not-claim-a-draft-test
  (mt/with-model-cleanup [:model/DataApp :model/Collection :model/PermissionsGroup]
    (data-app.sync/ensure-draft! "draft-app")
    (data-app.sync/import-from-snapshot!
     (snapshot {"data_apps/draft-app/data_app.yaml" "name: Draft\n"}))
    (is (true? (t2/select-one-fn :draft :model/DataApp :name "draft-app")))
    (is (=? {:removed 0}
            (data-app.sync/import-from-snapshot! (snapshot {}))))
    (is (t2/exists? :model/DataApp :name "draft-app"))))

(deftest concurrent-draft-creation-is-safe-test
  (mt/with-model-cleanup [:model/DataApp :model/Collection :model/PermissionsGroup]
    (let [drafts (doall (repeatedly 2 #(future (data-app.sync/ensure-draft! "draft-app"))))]
      (doseq [draft drafts]
        @draft)
      (is (= 1 (t2/count :model/DataApp :name "draft-app"))))))

(deftest remote-sync-prunes-never-successful-repository-apps-test
  (mt/with-model-cleanup [:model/DataApp :model/Collection :model/PermissionsGroup]
    (let [files (app-files! "broken" {:name "Broken" :path "missing.js" :bundle "unused"})]
      (data-app.sync/import-from-snapshot!
       (snapshot (dissoc files "data_apps/broken/missing.js"))))
    (is (false? (t2/select-one-fn :draft :model/DataApp :name "broken")))
    (is (=? {:removed 1}
            (data-app.sync/import-from-snapshot! (snapshot {}))))
    (is (not (t2/exists? :model/DataApp :name "broken")))))

(deftest a-broken-config-does-not-prune-the-existing-app-test
  (testing "a directory that still exists but whose data_app.yaml is now broken keeps the app (as a sync_error), it is not pruned"
    (mt/with-model-cleanup [:model/DataApp :model/Collection :model/PermissionsGroup]
      (data-app.sync/import-from-snapshot!
       (snapshot (app-files! "app" {:name "App" :path "index.js" :bundle "GOOD"})))
      (is (= "GOOD" (String. ^bytes (:bundle (t2/select-one :model/DataApp :name "app")) "UTF-8")))
      (let [{:keys [resource_collection_entity_id permission_group_entity_id]}
            (data-app.resources/resource-entity-ids (t2/select-one :model/DataApp :name "app"))
            config (format (str "name: App\n"
                                "resource_collection_entity_id: %s\n"
                                "permission_group_entity_id: %s\n")
                           resource_collection_entity_id permission_group_entity_id)
            result (data-app.sync/import-from-snapshot!
                    (snapshot {"data_apps/app/data_app.yaml" config
                               "data_apps/app/index.js"       "GOOD"}))]
        (is (=? {:removed 0} result) "the app is not pruned")
        (is (= 1 (count (:config-errors result))))
        (is (=? {:changed 1} result)
            "marking the app failed counts as a change, so the pull isn't reported as a no-op"))
      (let [app (t2/select-one :model/DataApp :name "app")]
        (is (some? app) "the app survives a transiently broken config")
        (is (= "GOOD" (String. ^bytes (:bundle app) "UTF-8"))
            "its last-good cached bundle is retained")
        (is (str/includes? (:sync_error app) "path")
            "the parse failure is recorded on the row, so the UI shows it as failed rather than freshly synced")))))

(deftest a-broken-config-for-a-brand-new-app-materializes-nothing-test
  (testing "an app whose config never parsed has no row to mark — it simply isn't materialized"
    (mt/with-model-cleanup [:model/DataApp :model/Collection :model/PermissionsGroup]
      (let [result (data-app.sync/import-from-snapshot!
                    (snapshot {"data_apps/newbie/data_app.yaml" "name: Newbie\n" ; missing required "path"
                               "data_apps/newbie/index.js"      "X"}))]
        (is (= 1 (count (:config-errors result))))
        (is (=? {:synced 0 :changed 0 :removed 0} result))
        (is (empty? (t2/select-fn-set :name :model/DataApp)))))))

(defn- oversized-bundle ^String []
  (.repeat "a" (int (inc data-app.sync/max-bundle-bytes))))

(deftest oversized-bundle-is-rejected-test
  (testing "a bundle over the size cap is rejected with a sync_error, no bundle cached"
    (mt/with-model-cleanup [:model/DataApp :model/Collection :model/PermissionsGroup]
      (data-app.sync/import-from-snapshot!
       (snapshot (app-files! "big" {:name "Big" :path "index.js"
                                    :bundle (oversized-bundle)})))
      (let [app (t2/select-one :model/DataApp :name "big")]
        (is (some? app) "the app still appears in the list")
        (is (nil? (:bundle app)) "no oversized bundle was cached")
        (is (str/includes? (:sync_error app) "MiB"))))))

(deftest oversized-resync-keeps-the-previous-bundle-test
  (testing "an oversized re-sync sets sync_error but keeps the last good bundle"
    (mt/with-model-cleanup [:model/DataApp :model/Collection :model/PermissionsGroup]
      (data-app.sync/import-from-snapshot!
       (snapshot (app-files! "app" {:name "App" :path "index.js" :bundle "GOOD"})))
      (data-app.sync/import-from-snapshot!
       (snapshot (app-files! "app" {:name "App" :path "index.js"
                                    :bundle (oversized-bundle)})))
      (let [app (t2/select-one :model/DataApp :name "app")]
        (is (= "GOOD" (String. ^bytes (:bundle app) "UTF-8"))
            "the previously cached bundle is retained")
        (is (str/includes? (:sync_error app) "MiB"))))))

(deftest a-directory-without-a-config-is-not-an-app-test
  (testing "a data_apps/<dir> that ships a bundle but no data_app.yaml is not discovered — no app, no error"
    (mt/with-model-cleanup [:model/DataApp :model/Collection :model/PermissionsGroup]
      (let [result (data-app.sync/import-from-snapshot!
                    (snapshot {"data_apps/orphan/index.js" "BUNDLE"}))]
        (is (=? {:synced 0 :changed 0 :config-errors []} result))
        (is (empty? (t2/select-fn-set :name :model/DataApp)))))))

(deftest an-unreadable-config-is-a-config-error-test
  (testing "a data_app.yaml the snapshot lists but can't read is isolated as a config-error, not a crash"
    (mt/with-model-cleanup [:model/DataApp :model/Collection :model/PermissionsGroup]
      ;; the config is listed in the tree, but reading its blob yields nothing
      (let [result (data-app.sync/import-from-snapshot!
                    (snapshot {"data_apps/ghost/data_app.yaml" nil}))]
        (is (= 1 (count (:config-errors result))))
        (is (str/includes? (first (:config-errors result)) "data_apps/ghost/data_app.yaml"))
        (is (empty? (t2/select-fn-set :name :model/DataApp)))))))
