(ns metabase-enterprise.remote-sync.data-apps-test
  "Data apps are serdes entities: remote sync imports and exports them like any other, with each app's bundle as a
   resource file next to its `data_app.yaml`."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.remote-sync.impl :as impl]
   [metabase-enterprise.remote-sync.models.remote-sync-task :as remote-sync.task]
   [metabase-enterprise.remote-sync.source.protocol :as source.p]
   [metabase-enterprise.remote-sync.test-helpers :as test-helpers]
   [metabase.search.test-util :as search.tu]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util.yaml :as yaml]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))
(use-fixtures :each test-helpers/clean-remote-sync-state test-helpers/commit-with-temp)

(def ^:private sales-eid "w8YkMQBwU4kOD0-pZ1nJk")

(defn- app-tree
  "Repo files for the data app `slug` with entity id `eid`: its `data_app.yaml` and its bundle at `dist/index.js`."
  [eid slug bundle]
  {(str "data_apps/" slug "/data_app.yaml")
   (yaml/generate-string {:serdes/meta [{:model "DataApp" :id eid :label slug}]
                          :entity_id   eid
                          :slug        slug
                          :name        "Sales"
                          :path        "dist/index.js"})
   (str "data_apps/" slug "/dist/index.js") bundle})

(defn- new-task! [sync-task-type]
  (t2/insert-returning-pk! :model/RemoteSyncTask {:sync_task_type sync-task-type :initiated_by (mt/user->id :rasta)}))

(defn- import-at!
  "Run `import!` against the source's snapshot at `version`, complete the task (so `last-version` advances for the
   next pull), and return the result."
  [src version & {:keys [force?] :or {force? false}}]
  (let [task   (new-task! "import")
        result (impl/import! (source.p/snapshot-at src version) task :force? force?)]
    (impl/handle-task-result! result task)
    result))

(defn- export!
  "Export to `mock` under a fresh task, complete it, and return the result."
  [mock]
  (t2/delete! :model/RemoteSyncTask)
  (let [task   (new-task! "export")
        result (impl/export! (source.p/snapshot mock) task "export")]
    (impl/handle-task-result! result task)
    result))

(defn- bundle-text [slug]
  (when-let [^bytes bundle (t2/select-one-fn :bundle [:model/DataApp :bundle] :name slug)]
    (String. bundle "UTF-8")))

(defmacro ^:private with-data-apps-sync [& body]
  `(search.tu/with-index-disabled
     (mt/with-premium-features #{:data-apps}
       (mt/with-temporary-setting-values [remote-sync-type :read-write remote-sync-enabled true remote-sync-transforms false]
         (mt/with-model-cleanup [:model/DataApp :model/Collection :model/PermissionsGroup]
           ~@body)))))

(deftest pull-imports-and-prunes-data-apps-test
  (with-data-apps-sync
    (let [src (test-helpers/versioned-source :trees {"v0" (app-tree sales-eid "sales" "BUNDLE-V1")
                                                     "v1" {"README.md" "x"}}
                                             :current "v0")]
      (testing "a pull imports the app and its bundle"
        (is (=? {:status :success :outcome {:kind "pulled" :count 1}} (import-at! src "v0" :force? true)))
        (is (=? {:entity_id sales-eid :display_name "Sales" :draft false :resource_collection_id pos-int?}
                (t2/select-one :model/DataApp :name "sales")))
        (is (= "BUNDLE-V1" (bundle-text "sales"))))
      (testing "a pull whose repo no longer has the app removes it"
        (is (= :success (:status (import-at! src "v1"))))
        (is (not (t2/exists? :model/DataApp :name "sales")))))))

(def ^:private sales-collection-eid "salesCollectionEid001")

(defn- collection-file
  "The repo file of a data app's resource collection with entity id `eid`, as serialization writes it."
  [eid]
  {"collections/data_apps/data_app__sales.yaml"
   (yaml/generate-string {:serdes/meta [{:model "Collection" :id eid :label "data_app__sales"}]
                          :entity_id   eid
                          :name        "Data App: sales"
                          :namespace   "data-apps"
                          :archived    false})})

(deftest deleting-an-apps-directory-deletes-the-app-and-its-collection-test
  (testing "an author deletes an app by deleting its directory; the collection's files, written under
            collections/, are leftovers the next pull skips rather than content it loads back"
    (with-data-apps-sync
      (let [manifest   (update (app-tree sales-eid "sales" "BUNDLE") "data_apps/sales/data_app.yaml"
                               #(yaml/generate-string (assoc (yaml/parse-string %) :collection sales-collection-eid)))
            collection (collection-file sales-collection-eid)
            src        (test-helpers/versioned-source :trees {"v0" (merge manifest collection)
                                                              "v1" collection}
                                                      :current "v0")]
        (is (= :success (:status (import-at! src "v0" :force? true))))
        (let [app (t2/select-one :model/DataApp :name "sales")]
          (is (=? {:entity_id sales-collection-eid :namespace :data-apps}
                  (t2/select-one :model/Collection :id (:resource_collection_id app)))
              "the app links the collection its manifest names"))
        (testing "the pull after the directory is deleted"
          (is (= :success (:status (import-at! src "v1"))))
          (is (not (t2/exists? :model/DataApp :name "sales")) "deletes the app")
          (is (not (t2/exists? :model/Collection :entity_id sales-collection-eid))
              "and its collection, which the leftover file doesn't bring back"))))))

(deftest a-pull-keeps-the-collection-of-an-app-the-repository-does-not-mention-test
  (testing "a manifest that names no collection gets one created on import; a later pull must not prune it as
            content the repository lacks, since the repository never held it"
    (with-data-apps-sync
      (let [app (app-tree sales-eid "sales" "BUNDLE")
            src (test-helpers/versioned-source :trees {"v0" app "v1" (assoc app "README.md" "x")} :current "v0")]
        (is (= :success (:status (import-at! src "v0" :force? true))))
        (let [collection-id (t2/select-one-fn :resource_collection_id :model/DataApp :name "sales")]
          (is (pos-int? collection-id))
          (is (= :success (:status (import-at! src "v1"))))
          (is (= collection-id (t2/select-one-fn :resource_collection_id :model/DataApp :name "sales")))
          (is (=? {:namespace :data-apps} (t2/select-one :model/Collection :id collection-id))))))))

(deftest bundle-only-pull-updates-the-bundle-test
  (testing "a pull that changes only an app's bundle file falls back to a full import, so the new bundle lands"
    (with-data-apps-sync
      (let [src (test-helpers/versioned-source :trees {"v0" (app-tree sales-eid "sales" "BUNDLE-V1")
                                                       "v1" (app-tree sales-eid "sales" "BUNDLE-V2")}
                                               :current "v0")]
        (is (= :success (:status (import-at! src "v0" :force? true))))
        (is (=? {:status :success :outcome {:kind "pulled"}} (import-at! src "v1")))
        (is (= "v1" (remote-sync.task/last-version)))
        (is (= "BUNDLE-V2" (bundle-text "sales")))))))

(deftest export-writes-and-removes-data-app-files-test
  (with-data-apps-sync
    (let [mock (test-helpers/create-mock-source :initial-files {"main" {}})
          repo #(get @(:files-atom mock) "main")]
      (mt/user-http-request :crowberto :post 200 "apps" {:name         "sales"
                                                         :display_name "Sales"
                                                         :bundle_path  "dist/index.js"
                                                         :bundle       "BUNDLE"})
      (testing "a created app is exported as its manifest and its bundle file"
        (is (= :success (:status (export! mock))))
        (is (=? {:slug "sales" :name "Sales" :path "dist/index.js"}
                (yaml/parse-string (get (repo) "data_apps/sales/data_app.yaml"))))
        (is (= "BUNDLE" (get (repo) "data_apps/sales/dist/index.js"))))
      (testing "an updated bundle is exported"
        (mt/user-http-request :crowberto :put 200 "apps/sales" {:bundle "BUNDLE-V2"})
        (is (= :success (:status (export! mock))))
        (is (= "BUNDLE-V2" (get (repo) "data_apps/sales/dist/index.js"))))
      (testing "a deleted app's files are removed from the repo, and the other apps' files stay"
        (mt/user-http-request :crowberto :post 200 "apps" {:name         "ops"
                                                           :display_name "Ops"
                                                           :bundle_path  "app.js"
                                                           :bundle       "OPS"})
        (mt/user-http-request :crowberto :delete 204 "apps/sales")
        (is (= :success (:status (export! mock))))
        (is (= #{"data_apps/ops/data_app.yaml" "data_apps/ops/app.js"}
               (into #{} (filter #(re-find #"^data_apps/" %)) (keys (repo)))))))))

(deftest export-keeps-files-serialization-does-not-own-test
  (testing "an export rewrites an app's manifest and bundle but leaves the app's source next to them alone"
    (with-data-apps-sync
      (let [source {"data_apps/sales/src/App.tsx"    "export const App = () => null;"
                    "data_apps/sales/package.json"   "{}"
                    "data_apps/sales/pnpm-lock.yaml" "lockfileVersion: '9.0'\n"
                    "data_apps/sales/deploy/k8s.yaml" "a: 1\n---\nb: [unterminated\n"}
            mock   (test-helpers/create-mock-source
                    :initial-files {"main" (merge (app-tree sales-eid "sales" "BUNDLE-V1") source)})
            repo   #(get @(:files-atom mock) "main")]
        (is (= :success (:status (import-at! mock "main" :force? true))))
        (mt/user-http-request :crowberto :put 200 "apps/sales" {:bundle "BUNDLE-V2"})
        (mt/user-http-request :crowberto :post 200 "apps" {:name         "ops"
                                                           :display_name "Ops"
                                                           :bundle_path  "app.js"
                                                           :bundle       "OPS"})
        (is (= :success (:status (export! mock))))
        (is (= "BUNDLE-V2" (get (repo) "data_apps/sales/dist/index.js")))
        (is (= source (select-keys (repo) (keys source))))
        (testing "deleting the app removes only the files serialization owns"
          (mt/user-http-request :crowberto :delete 204 "apps/sales")
          (is (= :success (:status (export! mock))))
          (is (= (into #{"data_apps/ops/data_app.yaml" "data_apps/ops/app.js"} (keys source))
                 (into #{} (filter #(re-find #"^data_apps/" %)) (keys (repo))))))))))

(deftest pull-refuses-to-delete-an-unpushed-app-test
  (testing "a pull whose repo lacks an app created here but not pushed yet is a conflict, not a silent delete"
    (with-data-apps-sync
      (let [app (app-tree sales-eid "sales" "BUNDLE")
            src (test-helpers/versioned-source :trees {"v0" app "v1" (assoc app "README.md" "x")} :current "v0")]
        (is (= :success (:status (import-at! src "v0" :force? true))))
        (mt/user-http-request :crowberto :post 200 "apps" {:name         "ops"
                                                           :display_name "Ops"
                                                           :bundle_path  "app.js"
                                                           :bundle       "OPS"})
        (is (=? {:status :conflict} (import-at! src "v1")))
        (is (t2/exists? :model/DataApp :name "ops"))))))
