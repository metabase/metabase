(ns metabase-enterprise.remote-sync.data-apps-test
  "Data apps are serdes entities: remote sync imports and exports them like any other, with each app's bundle as a
   resource file next to its `data_app.yaml`, and its collection under `collections/data_apps/` like any collection
   of a namespace."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.data-apps.group-access :as group-access]
   [metabase-enterprise.data-apps.test-util :as data-apps.tu]
   [metabase-enterprise.dependencies.test-util :as deps.test]
   [metabase-enterprise.remote-sync.impl :as impl]
   [metabase-enterprise.remote-sync.models.remote-sync-task :as remote-sync.task]
   [metabase-enterprise.remote-sync.source.protocol :as source.p]
   [metabase-enterprise.remote-sync.test-helpers :as test-helpers]
   [metabase.actions.core :as actions]
   [metabase.collections.models.collection :as collection]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.permissions.core :as perms]
   [metabase.remote-sync.test-util :as remote-sync.tu]
   [metabase.search.test-util :as search.tu]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util.yaml :as yaml]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))
(use-fixtures :each
  remote-sync.tu/allow-remote-synced-collections test-helpers/clean-remote-sync-state test-helpers/commit-with-temp)

(def ^:private sales-eid "w8YkMQBwU4kOD0-pZ1nJk")

(defn- app-tree
  "Repo files for the data app `slug` with entity id `eid`: its `data_app.yaml`, its bundle at `dist/index.js`, and
  its collection's file under `collections/data_apps/`."
  [eid slug bundle]
  (data-apps.tu/app-files slug {:name "Sales" :path "dist/index.js" :bundle bundle :entity_id eid}))

(defn- app-files-in
  "The files of `repo` that serialization writes for data apps: under `data_apps/` and `collections/data_apps/`."
  [repo]
  (into #{} (filter #(re-find #"^(data_apps|collections/data_apps)/" %)) (keys repo)))

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
         ;; the cleanup deletes without hooks, so what a pull loads into an app's collection is listed too
         (mt/with-model-cleanup [:model/DataApp :model/Action :model/Card :model/Collection :model/PermissionsGroup]
           ;; a card in an app's collection reads only tables published to the Library
           (data-apps.tu/with-published-tables! [(mt/id :venues) (mt/id :checkins)]
             ~@body))))))

(deftest pull-imports-and-prunes-data-apps-test
  (with-data-apps-sync
    (let [src (test-helpers/versioned-source :trees {"v0" (app-tree sales-eid "sales" "BUNDLE-V1")
                                                     "v1" {"README.md" "x"}}
                                             :current "v0")]
      (testing "a pull imports the app, its collection and its bundle"
        (is (=? {:status :success :outcome {:kind "pulled" :count 2}} (import-at! src "v0" :force? true)))
        (is (=? {:entity_id sales-eid :display_name "Sales" :resource_collection_id pos-int?}
                (t2/select-one :model/DataApp :name "sales")))
        (is (= "BUNDLE-V1" (bundle-text "sales"))))
      (testing "a pull whose repo no longer has the app's files removes it, and the hook removes its collection"
        (let [collection-id (t2/select-one-fn :resource_collection_id :model/DataApp :name "sales")]
          (is (= :success (:status (import-at! src "v1"))))
          (is (not (t2/exists? :model/DataApp :name "sales")))
          (is (not (t2/exists? :model/Collection :id collection-id))))))))

(deftest bundle-only-pull-updates-the-bundle-test
  (testing "a pull that changes only an app's bundle file lands the new bundle"
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
      (mt/user-http-request :crowberto :post 200 "ee/apps" {:name         "sales"
                                                            :display_name "Sales"
                                                            :bundle_path  "dist/index.js"})
      (mt/user-http-request :crowberto :put 200 "ee/apps/sales/bundle" {:bundle "BUNDLE"})
      (testing "a created app is exported as its manifest, its bundle file, and its collection's file"
        (is (= :success (:status (export! mock))))
        (is (=? {:slug "sales" :name "Sales" :path "dist/index.js" :collection string?}
                (yaml/parse-string (get (repo) "data_apps/sales/data_app.yaml"))))
        (is (= "BUNDLE" (get (repo) "data_apps/sales/dist/index.js")))
        (is (=? {:name "Data App: sales" :namespace "data-apps"}
                (yaml/parse-string (get (repo) "collections/data_apps/data_app__sales.yaml")))))
      (testing "an updated bundle is exported"
        (mt/user-http-request :crowberto :put 200 "ee/apps/sales/bundle" {:bundle "BUNDLE-V2"})
        (is (= :success (:status (export! mock))))
        (is (= "BUNDLE-V2" (get (repo) "data_apps/sales/dist/index.js"))))
      (testing "a deleted app's files are removed from the repo, and the other apps' files stay"
        (mt/user-http-request :crowberto :post 200 "ee/apps" {:name         "ops"
                                                              :display_name "Ops"
                                                              :bundle_path  "app.js"})
        (mt/user-http-request :crowberto :put 200 "ee/apps/ops/bundle" {:bundle "OPS"})
        (mt/user-http-request :crowberto :delete 204 "ee/apps/sales")
        (is (= :success (:status (export! mock))))
        (is (= #{"data_apps/ops/data_app.yaml" "data_apps/ops/app.js" "collections/data_apps/data_app__ops.yaml"}
               (app-files-in (repo))))))))

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
        (mt/user-http-request :crowberto :put 200 "ee/apps/sales/bundle" {:bundle "BUNDLE-V2"})
        (mt/user-http-request :crowberto :post 200 "ee/apps" {:name         "ops"
                                                              :display_name "Ops"
                                                              :bundle_path  "app.js"})
        (mt/user-http-request :crowberto :put 200 "ee/apps/ops/bundle" {:bundle "OPS"})
        (is (= :success (:status (export! mock))))
        (is (= "BUNDLE-V2" (get (repo) "data_apps/sales/dist/index.js")))
        (is (= source (select-keys (repo) (keys source))))
        (testing "deleting the app removes only the files serialization owns"
          (mt/user-http-request :crowberto :delete 204 "ee/apps/sales")
          (is (= :success (:status (export! mock))))
          (is (= (into #{"data_apps/ops/data_app.yaml" "data_apps/ops/app.js" "collections/data_apps/data_app__ops.yaml"}
                       (keys source))
                 (app-files-in (repo)))))))))

(deftest pull-refuses-to-delete-an-unpushed-app-test
  (testing "a pull whose repo lacks an app created here but not pushed yet is a conflict, not a silent delete"
    (with-data-apps-sync
      (let [app (app-tree sales-eid "sales" "BUNDLE")
            src (test-helpers/versioned-source :trees {"v0" app "v1" (assoc app "README.md" "x")} :current "v0")]
        (is (= :success (:status (import-at! src "v0" :force? true))))
        (mt/user-http-request :crowberto :post 200 "ee/apps" {:name         "ops"
                                                              :display_name "Ops"
                                                              :bundle_path  "app.js"})
        (mt/user-http-request :crowberto :put 200 "ee/apps/ops/bundle" {:bundle "OPS"})
        (is (=? {:status :conflict} (import-at! src "v1")))
        (is (t2/exists? :model/DataApp :name "ops"))))))

;;; ------------------------------------------------- Resources -------------------------------------------------

(def ^:private shop-collection-eid (data-apps.tu/collection-entity-id "shop"))

(def ^:private question-eid "shopQuestionListVenue")

(defn- venues-stages []
  {:stages [{:source {:type "table" :id (mt/id :venues)} :limit 5}]})

(def ^:private shop-collection-name "Data App: shop")

(defn- shop-tree
  "The repo files of the `shop` app with `resources` (see `data-apps.tu/build-resources`), the resources under
  `collections/data_apps/data_app__shop/`."
  [resources]
  (data-apps.tu/app-files "shop" {:name "Shop" :path "index.js" :bundle "B"
                                  :collection shop-collection-eid :resources resources}))

(defn- shop-collection-id []
  (t2/select-one-fn :resource_collection_id :model/DataApp :name "shop"))

(deftest pull-loads-an-apps-resources-test
  (testing "a pull loads an app's resource files as the entities they are, into the collection the manifest names"
    (with-data-apps-sync
      (data-apps.tu/do-with-sources!
       (fn [{:keys [metric-id action-id]}]
         (let [resources (data-apps.tu/build-resources
                          shop-collection-name shop-collection-eid
                          [{:entity_id question-eid :name "VenuesList" :query (venues-stages)}
                           {:entity_id "shopQuestionMetricVen" :name "VenueCount"
                            :query {:stages [{:source       {:type "table" :id (mt/id :venues)}
                                              :aggregations [{:type "metric" :id metric-id}]}]}}]
                          [action-id])
               src       (test-helpers/versioned-source :trees {"v0" (shop-tree resources)} :current "v0")
               copy-eid  (fn [action-id]
                           (data-apps.tu/copy-entity-id "action" shop-collection-eid (t2/select-one-fn :entity_id :model/Action :id action-id)))]
           (let [result (import-at! src "v0" :force? true)]
             (is (= :success (:status result)) (:message result)))
           (let [collection-id (shop-collection-id)]
             (testing "the app is linked to the collection the files define"
               (is (= collection-id (t2/select-one-pk :model/Collection :entity_id shop-collection-eid))))
             (testing "each query is a saved question in the collection"
               (is (=? {:type :question :name "VenuesList" :collection_id collection-id}
                       (t2/select-one :model/Card :entity_id question-eid))))
             (testing "a query aggregates the Library metric itself, which stays in the Library"
               (let [card (t2/select-one :model/Card :entity_id "shopQuestionMetricVen")]
                 (is (= [metric-id] (vec (lib/all-metric-ids (lib/query (mt/metadata-provider) (:dataset_query card)))))))
               (is (not= collection-id (t2/select-one-fn :collection_id :model/Card :id metric-id)))
               (is (not (t2/exists? :model/Card :collection_id collection-id :type :metric))))
             (testing "the action is copied into the collection, on no model"
               (is (=? {:type :query :collection_id collection-id :model_id nil}
                       (t2/select-one :model/Action :entity_id (copy-eid action-id)))))
             (testing "the source is untouched"
               (is (nil? (t2/select-one-fn :collection_id :model/Action :id action-id)))))))))))

(deftest pull-updates-and-removes-resources-with-their-files-test
  (with-data-apps-sync
    (let [resources (data-apps.tu/build-resources shop-collection-name shop-collection-eid
                                                  [{:entity_id question-eid :name "VenuesList" :query (venues-stages)}
                                                   {:entity_id "shopQuestionOther0001" :name "Other" :query (venues-stages)}]
                                                  [])
          file-of   (fn [eid] (some #(when (str/includes? % eid) %) (keys resources)))
          renamed   (update resources (file-of question-eid) #(yaml/generate-string (assoc (yaml/parse-string %) :name "Renamed")))
          src       (test-helpers/versioned-source :trees {"v0" (shop-tree resources)
                                                           "v1" (shop-tree renamed)
                                                           "v2" (shop-tree (dissoc renamed (file-of "shopQuestionOther0001")))}
                                                   :current "v0")]
      (let [result (import-at! src "v0" :force? true)]
        (is (= :success (:status result)) (:message result)))
      (let [card-id (t2/select-one-pk :model/Card :entity_id question-eid)]
        (testing "a changed file updates the card in place"
          (is (= :success (:status (import-at! src "v1"))))
          (is (= "Renamed" (t2/select-one-fn :name :model/Card :id card-id))))
        (testing "a card whose file is gone is removed"
          (is (= :success (:status (import-at! src "v2"))))
          (is (t2/exists? :model/Card :id card-id))
          (is (not (t2/exists? :model/Card :entity_id "shopQuestionOther0001"))))))))

(deftest pull-refuses-resources-an-app-may-not-hold-test
  (testing "a resource the Card hook refuses fails the pull"
    (with-data-apps-sync
      (let [resources (data-apps.tu/build-resources shop-collection-name shop-collection-eid
                                                    [{:entity_id question-eid :name "VenuesList" :query (venues-stages)}]
                                                    [])
            card-file (some #(when (str/includes? % question-eid) %) (keys resources))
            archived  (update resources card-file #(yaml/generate-string (assoc (yaml/parse-string %) :archived true)))
            src       (test-helpers/versioned-source :trees {"v0" (shop-tree archived)} :current "v0")
            result    (import-at! src "v0" :force? true)]
        (is (= :error (:status result)))
        (is (str/includes? (:message result) "not archived"))
        (is (not (t2/exists? :model/Card :entity_id question-eid)))))))

(deftest export-writes-an-apps-resources-under-its-collection-test
  (testing "what an app's collection holds is exported under collections/data_apps/, like any namespace's content"
    (with-data-apps-sync
      (let [mock (test-helpers/create-mock-source :initial-files {"main" {}})
            repo #(get @(:files-atom mock) "main")]
        (mt/user-http-request :crowberto :post 200 "ee/apps" {:name         "sales"
                                                              :display_name "Sales"
                                                              :bundle_path  "dist/index.js"})
        (mt/user-http-request :crowberto :put 200 "ee/apps/sales/bundle" {:bundle "BUNDLE"})
        (let [collection-id (t2/select-one-fn :resource_collection_id :model/DataApp :name "sales")
              mp            (mt/metadata-provider)]
          (mt/with-temp [:model/Card _ {:name          "Venues list"
                                        :type          :question
                                        :collection_id collection-id
                                        :dataset_query (lib/query mp (lib.metadata/table mp (mt/id :venues)))}]
            (actions/insert! {:name          "Rename venue"
                              :type          :query
                              :collection_id collection-id
                              :database_id   (mt/id)
                              :dataset_query (lib/native-query mp "UPDATE venues SET name = 'x'")})
            (is (= :success (:status (export! mock))))
            (is (= #{"data_apps/sales/data_app.yaml"
                     "data_apps/sales/dist/index.js"
                     "collections/data_apps/data_app__sales.yaml"
                     "collections/data_apps/data_app__sales/venues_list.yaml"
                     "collections/data_apps/data_app__sales/rename_venue.yaml"}
                   (app-files-in (repo))))
            (is (empty? (filter #(re-find #"^(collections/main|actions)/" %) (keys (repo))))
                "nothing of the app's lands in the default namespace's directories")))))))

(defn- question-resources []
  (data-apps.tu/build-resources shop-collection-name shop-collection-eid
                                [{:entity_id question-eid :name "VenuesList" :query (venues-stages)}]
                                []))

(defn- resource-files
  "The files of data apps' collections in `mock`'s repository."
  [mock]
  (into #{} (filter #(re-find #"^collections/data_apps/" %)) (keys (get @(:files-atom mock) "main"))))

(defn- file-named
  "Whether a file of `mock`'s repository under `collections/data_apps/` has a name starting with `stem`."
  [mock stem]
  (some #(str/starts-with? (last (str/split % #"/")) stem) (resource-files mock)))

(deftest pull-reaches-permission-warnings-test
  (testing "once the jobs run after a pull, the warnings list the tables the app's question and action name"
    (with-data-apps-sync
      (mt/with-premium-features #{:data-apps :advanced-permissions :dependencies}
        (mt/with-no-data-perms-for-all-users!
          (mt/with-model-cleanup [:model/Dependency :model/DependencyStatus]
            (let [action-id (actions/insert! {:name          "Clear checkins"
                                              :type          :query
                                              :database_id   (mt/id)
                                              :dataset_query (lib/native-query (mt/metadata-provider)
                                                                               "DELETE FROM checkins WHERE id = {{id}}")
                                              :parameters    [{:id "id" :slug "id" :type :number/=}]})
                  resources (data-apps.tu/build-resources
                             shop-collection-name shop-collection-eid
                             [{:entity_id question-eid :name "VenuesList" :query (venues-stages)}]
                             [action-id])
                  src       (test-helpers/versioned-source :trees {"v0" (shop-tree resources)} :current "v0")
                  result    (import-at! src "v0" :force? true)]
              (is (= :success (:status result)) (:message result))
              (mt/with-temp [:model/PermissionsGroup group {}]
                (let [app (t2/select-one :model/DataApp :name "shop")]
                  (perms/set-database-permission! (:id group) (mt/id) :perms/view-data :blocked)
                  (group-access/add-groups! app [(:id group)])
                  (deps.test/synchronously-run-dependency-job!)
                  (is (=? [{:group_id (:id group) :missing_tables [{:id (mt/id :checkins)} {:id (mt/id :venues)}]}]
                          (group-access/permission-warnings app))))))))))))

(deftest an-apps-collection-is-written-by-admins-test
  (testing "an admin can write an app's collection, its cards and its actions, unless the instance is read-only"
    (with-data-apps-sync
      (data-apps.tu/do-with-sources!
       (fn [{:keys [action-id]}]
         (let [resources (data-apps.tu/build-resources
                          shop-collection-name shop-collection-eid
                          [{:entity_id question-eid :name "VenuesList" :query (venues-stages)}]
                          [action-id])
               src       (test-helpers/versioned-source :trees {"v0" (shop-tree resources)} :current "v0")]
           (is (= :success (:status (import-at! src "v0" :force? true))))
           (let [collection-id (shop-collection-id)
                 card-id       (t2/select-one-pk :model/Card :entity_id question-eid)
                 copy-id       (t2/select-one-pk :model/Action :collection_id collection-id)
                 writes!       (fn [status can-write?]
                                 (is (=? {:can_write can-write?}
                                         (mt/user-http-request :crowberto :get 200 (str "collection/" collection-id))))
                                 (is (=? {:can_write can-write?}
                                         (mt/user-http-request :crowberto :get 200 (str "card/" card-id))))
                                 (mt/user-http-request :crowberto :put status (str "card/" card-id) {:description "edited here"})
                                 (mt/with-actions-enabled
                                   (mt/user-http-request :crowberto :put status (str "action/" copy-id) {:name "Renamed"}))
                                 (mt/user-http-request :rasta :put 403 (str "card/" card-id) {:description "mine"}))]
             (testing "on a read-write instance"
               (mt/with-temporary-setting-values [remote-sync-type :read-write remote-sync-url "https://example.com/repo.git"]
                 (writes! 200 true)))
             (testing "without remote sync"
               (mt/with-temporary-setting-values [remote-sync-url nil]
                 (writes! 200 true)))
             (testing "on a read-only instance"
               (mt/with-temporary-setting-values [remote-sync-type :read-only remote-sync-url "https://example.com/repo.git"]
                 (writes! 403 false))))))))))

(deftest a-copy-of-an-apps-card-elsewhere-is-a-card-like-any-other-test
  (testing "copying a card out of an app's collection needs only read access to it"
    (with-data-apps-sync
      (let [src (test-helpers/versioned-source :trees {"v0" (shop-tree (question-resources))} :current "v0")
            mp  (mt/metadata-provider)]
        (is (= :success (:status (import-at! src "v0" :force? true))))
        (is (=? {:collection_id nil}
                (mt/user-http-request :crowberto :post 200 "card"
                                      {:name                   "Copy"
                                       :display                "table"
                                       :visualization_settings {}
                                       :dataset_query          (lib/->legacy-MBQL
                                                                (lib/query mp (lib.metadata/table mp (mt/id :venues))))
                                       :source_card_id         (t2/select-one-pk :model/Card :entity_id question-eid)})))))))

(deftest a-pull-changes-a-card-in-an-apps-collection-test
  (testing "the permissions that refuse every write to an app's collection don't stop a pull"
    (with-data-apps-sync
      (let [resources (fn [card-name]
                        (data-apps.tu/build-resources shop-collection-name shop-collection-eid
                                                      [{:entity_id question-eid :name card-name :query (venues-stages)}]
                                                      []))
            src       (test-helpers/versioned-source :trees {"v0" (shop-tree (resources "VenuesList"))
                                                             "v1" (shop-tree (resources "Renamed on read-write"))
                                                             "v2" (shop-tree (resources "Renamed on read-only"))}
                                                     :current "v0")
            card-name #(t2/select-one-fn :name :model/Card :entity_id question-eid)]
        (is (= :success (:status (import-at! src "v0" :force? true))))
        (testing "on a read-write instance"
          (is (= :success (:status (import-at! src "v1"))))
          (is (= "Renamed on read-write" (card-name))))
        (testing "on a read-only instance"
          (mt/with-temporary-setting-values [remote-sync-type :read-only remote-sync-url "https://example.com/repo.git"]
            (is (= :success (:status (import-at! src "v2"))))
            (is (= "Renamed on read-only" (card-name)))))))))

(deftest an-apps-collection-holds-only-what-a-pull-accepts-test
  (testing "what the resource validator would refuse on a pull can't be saved into an app's collection, by a write the
            permissions don't cover"
    (with-data-apps-sync
      (let [src (test-helpers/versioned-source :trees {"v0" (shop-tree (question-resources))} :current "v0")]
        (is (= :success (:status (import-at! src "v0" :force? true))))
        (let [collection-id (shop-collection-id)
              card!         (fn [card-type]
                              (mt/with-temp [:model/Card {card-id :id} {:name          "Saved here"
                                                                        :type          card-type
                                                                        :collection_id collection-id
                                                                        :dataset_query (data-apps.tu/venues-query)}]
                                (t2/select-one :model/Card :id card-id)))]
          (is (thrown-with-msg? clojure.lang.ExceptionInfo #"can hold only questions, metrics, and query actions"
                                (mt/with-temp [:model/Dashboard _ {:name "Saved here" :collection_id collection-id}])))
          (is (thrown-with-msg? clojure.lang.ExceptionInfo #"can hold only questions, metrics, and query actions"
                                (mt/with-temp [:model/Collection _ {:name      "Inside"
                                                                    :location  (collection/children-location
                                                                                (t2/select-one :model/Collection :id collection-id))
                                                                    :namespace "data-apps"}])))
          (is (thrown-with-msg? clojure.lang.ExceptionInfo #"data app's collection" (card! :model)))
          (is (=? {:collection_id collection-id :type :question} (card! :question)))
          (testing "a bookmark is not content"
            (mt/user-http-request :crowberto :post 200 (str "bookmark/collection/" collection-id)))
          (testing "with the library feature too, whose check runs in the same place"
            (mt/with-additional-premium-features #{:library}
              (is (thrown-with-msg? clojure.lang.ExceptionInfo #"data app's collection" (card! :model)))))
          (testing "a question a load checks as a possible dashboard question, before its dashboard is known, is a question here"
            (is (= (collection/check-allowed-content :question collection-id)
                   (collection/check-allowed-content :dashboard-question collection-id))))
          (mt/with-temp [:model/Dashboard {dashboard-id :id} {:name "Elsewhere"}]
            (is (thrown-with-msg? clojure.lang.ExceptionInfo #"can hold only questions, metrics, and query actions"
                                  (t2/update! :model/Dashboard dashboard-id {:collection_id collection-id})))
            (is (nil? (t2/select-one-fn :collection_id :model/Dashboard :id dashboard-id)))))))))

(deftest a-card-in-an-apps-collection-stays-what-a-pull-accepts-test
  (testing "a card there can't become what the resource validator refuses, since the next export would write it"
    (with-data-apps-sync
      (let [mock (test-helpers/create-mock-source :initial-files {"main" (shop-tree (question-resources))})
            mp   (mt/metadata-provider)
            q    (lib/->legacy-MBQL (lib/query mp (lib.metadata/table mp (mt/id :venues))))]
        (is (= :success (:status (import-at! mock "main" :force? true))))
        (let [card-id       (t2/select-one-pk :model/Card :entity_id question-eid)
              collection-id (shop-collection-id)]
          (testing "archived, public, or a model"
            (mt/with-temporary-setting-values [enable-public-sharing true]
              (mt/user-http-request :crowberto :post 400 (str "card/" card-id "/public_link")))
            (is (thrown-with-msg? clojure.lang.ExceptionInfo #"must be a question or metric"
                                  (t2/update! :model/Card card-id {:archived true})))
            (is (thrown-with-msg? clojure.lang.ExceptionInfo #"must be a question or metric"
                                  (t2/update! :model/Card card-id {:type :model})))
            (is (=? {:archived false :public_uuid nil :type :question} (t2/select-one :model/Card :id card-id))))
          (testing "a card that is already public can't be moved in"
            (mt/with-temp [:model/Card {public-id :id} {:name              "Already public"
                                                        :dataset_query     q
                                                        :public_uuid       (str (random-uuid))
                                                        :made_public_by_id (mt/user->id :crowberto)}]
              (is (thrown-with-msg? clojure.lang.ExceptionInfo #"must be a question or metric"
                                    (t2/update! :model/Card public-id {:collection_id collection-id})))
              (is (nil? (t2/select-one-fn :collection_id :model/Card :id public-id)))))
          (testing "the export keeps its file"
            (is (= :success (:status (export! mock))))
            (is (file-named mock "venueslist"))
            (is (= :success (:status (import-at! mock "main" :force? true)))))
          (testing "a card anywhere else still can be archived"
            (mt/with-temp [:model/Card {other-id :id} {:name "Elsewhere"}]
              (mt/user-http-request :crowberto :put 200 (str "card/" other-id) {:archived true}))))))))

(deftest pull-moves-card-out-of-apps-collection-test
  (testing "a pull whose commit moves a card out of an app's collection, into an ordinary synced collection, succeeds"
    (with-data-apps-sync
      (let [mock (test-helpers/create-mock-source :initial-files {"main" (shop-tree (question-resources))})]
        (is (= :success (:status (import-at! mock "main" :force? true))))
        (let [synced-eid "shopCardsMovedOutColl"
              synced-dir (str "collections/" synced-eid "_moved_out/")
              ;; the commit an author pushes: the card's file in an ordinary synced collection
              moved-out  (reduce-kv (fn [tree path content]
                                      (let [entity (yaml/parse-string content)]
                                        (if (= question-eid (:entity_id entity))
                                          (assoc tree
                                                 (str synced-dir "cards/" (last (str/split path #"/")))
                                                 (yaml/generate-string (assoc entity :collection_id synced-eid)))
                                          (assoc tree path content))))
                                    {(str synced-dir synced-eid "_moved_out.yaml")
                                     (test-helpers/generate-collection-yaml synced-eid "Moved out" :is-remote-synced true)}
                                    (get @(:files-atom mock) "main"))
              src        (test-helpers/versioned-source :trees {"v1" moved-out} :current "v1")]
          (let [result (import-at! src "v1" :force? true)]
            (is (= :success (:status result)) (:message result)))
          (is (= (t2/select-one-pk :model/Collection :entity_id synced-eid)
                 (t2/select-one-fn :collection_id :model/Card :entity_id question-eid))))))))

(deftest pull-refuses-two-apps-that-name-one-collection-test
  (with-data-apps-sync
    (let [shared (data-apps.tu/collection-entity-id "shared")
          app    (fn [slug] (data-apps.tu/app-files slug {:name slug :path "index.js" :bundle "B" :collection shared}))
          src    (test-helpers/versioned-source :trees {"v0" (merge (app "first") (app "second"))} :current "v0")
          result (import-at! src "v0" :force? true)]
      (testing "the database refuses the second app on the collection the first owns"
        (is (= :error (:status result)))
        (is (str/includes? (:message result) "already belongs to another data app"))
        (is (= 1 (t2/count :model/DataApp :name [:in ["first" "second"]])))))))

(deftest pull-refuses-a-manifest-that-names-a-collection-it-doesnt-define-test
  (testing "a manifest with no resource files can't claim a collection that is already here"
    (with-data-apps-sync
      (mt/with-temp [:model/Collection {collection-id :id, collection-eid :entity_id} {:name "Finance"}
                     :model/Card       {card-id :id} {:name "Finance card" :collection_id collection-id}]
        (let [src    (test-helpers/versioned-source
                      :trees {"v0" (data-apps.tu/app-files "shop" {:name "Shop" :path "index.js" :bundle "B"
                                                                   :collection collection-eid :resources nil})}
                      :current "v0")
              result (import-at! src "v0" :force? true)]
          (is (= :error (:status result)))
          (is (str/includes? (:message result) "must be a top-level collection of data apps"))
          (is (not (t2/exists? :model/DataApp :name "shop")))
          (is (t2/exists? :model/Collection :id collection-id))
          (is (t2/exists? :model/Card :id card-id)))))))

(deftest pull-refuses-native-question-in-apps-collection-test
  (testing "a question in an app's collection is built with the query builder, so a pull refuses one in SQL"
    (with-data-apps-sync
      (let [resources (question-resources)
            path      (some #(when (str/includes? % question-eid) %) (keys resources))
            parsed    (yaml/parse-string (get resources path))
            native    (assoc parsed :dataset_query {:database (:database (:dataset_query parsed))
                                                    :lib/type "mbql/query"
                                                    :stages   [{:lib/type "mbql.stage/native"
                                                                :native   "SELECT * FROM venues"}]})
            src       (test-helpers/versioned-source
                       :trees {"v0" (shop-tree (assoc resources path (yaml/generate-string native)))}
                       :current "v0")
            result    (import-at! src "v0" :force? true)]
        (is (= :error (:status result)))
        (is (str/includes? (:message result) "must be built with the query builder"))
        (is (not (t2/exists? :model/Card :entity_id question-eid)))))))

(deftest pull-loads-a-resource-on-a-database-not-connected-yet-test
  (testing "a resource whose database isn't connected yet loads as a card's does, against a stub database and an
            inactive table that a later connection and sync fill in"
    (with-data-apps-sync
      (mt/with-model-cleanup [:model/Database]
        (let [db-name   "Data app warehouse not connected yet"
              resources (question-resources)
              path      (some #(when (str/includes? % question-eid) %) (keys resources))
              elsewhere (-> (yaml/parse-string (get resources path))
                            (assoc :database_id db-name)
                            (dissoc :result_metadata)
                            (assoc-in [:dataset_query :database] db-name)
                            (assoc-in [:dataset_query :stages 0 :source-table] [db-name "analytics" "accounts"]))
              src       (test-helpers/versioned-source
                         :trees {"v0" (shop-tree (assoc resources path (yaml/generate-string elsewhere)))}
                         :current "v0")
              result    (import-at! src "v0" :force? true)
              db-id     (t2/select-one-pk :model/Database :name db-name)
              table-id  (t2/select-one-pk :model/Table :db_id db-id :schema "analytics" :name "accounts")]
          (is (= :success (:status result)) (:message result))
          (is (=? {:is_stub true} (t2/select-one :model/Database :id db-id)))
          (is (=? {:active false} (t2/select-one :model/Table :id table-id)))
          (is (=? {:database_id db-id :collection_id (shop-collection-id)}
                  (t2/select-one :model/Card :entity_id question-eid))))))))

(deftest an-apps-collection-cant-be-moved-to-the-trash-test
  (testing "trashing it would drop the app's resource files on the next export"
    (with-data-apps-sync
      (let [mock (test-helpers/create-mock-source :initial-files {"main" (shop-tree (question-resources))})]
        (is (= :success (:status (import-at! mock "main" :force? true))))
        (let [before (resource-files mock)]
          (is (thrown-with-msg? clojure.lang.ExceptionInfo #"stays a top-level collection of data apps"
                                (t2/update! :model/Collection (shop-collection-id) {:archived true})))
          (is (= :success (:status (export! mock))))
          (is (= before (resource-files mock)))
          (testing "deleting the app still deletes its collection"
            (let [collection-id (shop-collection-id)]
              (mt/user-http-request :crowberto :delete 204 "ee/apps/shop")
              (is (not (t2/exists? :model/Collection :id collection-id))))))))))

(deftest an-apps-own-yaml-is-left-alone-test
  (testing "a YAML file in the app's directory that isn't its manifest is the app's own: not loaded, not removed"
    (with-data-apps-sync
      (let [own  "data_apps/shop/i18n/en.yaml"
            mock (test-helpers/create-mock-source
                  :initial-files {"main" (assoc (shop-tree (question-resources)) own "greeting: hello\n")})]
        (let [result (import-at! mock "main" :force? true)]
          (is (= :success (:status result)) (:message result)))
        (mt/user-http-request :crowberto :put 200 "ee/apps/shop/bundle" {:bundle "B2"})
        (is (= :success (:status (export! mock))))
        (is (= "greeting: hello\n" (get-in @(:files-atom mock) ["main" own])))))))

(deftest deleting-an-apps-files-deletes-the-app-and-its-collection-test
  (testing "an author deletes an app by deleting its directory and its collection's files under collections/data_apps/"
    (with-data-apps-sync
      (let [resources (data-apps.tu/build-resources shop-collection-name shop-collection-eid
                                                    [{:entity_id question-eid :name "VenuesList" :query (venues-stages)}]
                                                    [])
            src       (test-helpers/versioned-source :trees {"v0" (shop-tree resources) "v1" {"README.md" "x"}}
                                                     :current "v0")]
        (is (= :success (:status (import-at! src "v0" :force? true))))
        (let [collection-id (shop-collection-id)]
          (is (t2/exists? :model/Card :entity_id question-eid :collection_id collection-id))
          (is (= :success (:status (import-at! src "v1"))))
          (is (not (t2/exists? :model/DataApp :name "shop")))
          (testing "the hook deletes the collection and what it held"
            (is (not (t2/exists? :model/Collection :id collection-id)))
            (is (not (t2/exists? :model/Card :entity_id question-eid)))))))))

(deftest deleting-an-apps-directory-without-its-collection-files-still-deletes-the-app-test
  (testing "an author deletes an app's directory but leaves its collection's files: the pull doesn't fail, it deletes
            the app, and with it its collection and what it held"
    (with-data-apps-sync
      (let [resources (data-apps.tu/build-resources shop-collection-name shop-collection-eid
                                                    [{:entity_id question-eid :name "VenuesList" :query (venues-stages)}]
                                                    [])
            v0        (shop-tree resources)
            v1        (dissoc v0 "data_apps/shop/data_app.yaml" "data_apps/shop/index.js")
            src       (test-helpers/versioned-source :trees {"v0" v0 "v1" v1} :current "v0")]
        (is (= :success (:status (import-at! src "v0" :force? true))))
        (let [collection-id (shop-collection-id)]
          (is (t2/exists? :model/Card :entity_id question-eid :collection_id collection-id))
          (let [result (import-at! src "v1")]
            (is (= :success (:status result)) (:message result)))
          (is (not (t2/exists? :model/DataApp :name "shop")))
          (is (not (t2/exists? :model/Collection :id collection-id)))
          (is (not (t2/exists? :model/Card :entity_id question-eid))))))))

(deftest a-read-only-instance-still-serves-the-root-collection-test
  (testing "with remote sync read-only, a card in no collection is read and edited as before: nothing there is synced"
    (with-data-apps-sync
      (mt/with-temp [:model/Card {card-id :id} {:name "In the root" :collection_id nil}]
        (mt/with-temporary-setting-values [remote-sync-type :read-only remote-sync-url "https://example.com/repo.git"]
          (mt/user-http-request :crowberto :get 200 (str "card/" card-id))
          (mt/user-http-request :crowberto :put 200 (str "card/" card-id) {:description "edited in the root"}))))))

(deftest card-in-apps-collection-reads-only-library-test
  (testing "a card there is a query builder question on tables published to the Library, aggregating only Library
            metrics, and based on no other card, whether it is saved or changed"
    (with-data-apps-sync
      (data-apps.tu/do-with-sources!
       (fn [{library-metric-id :metric-id}]
         (let [src (test-helpers/versioned-source :trees {"v0" (shop-tree (question-resources))} :current "v0")
               mp  (mt/metadata-provider)]
           (is (= :success (:status (import-at! src "v0" :force? true))))
           (mt/with-temp [:model/Card {other-metric-id :id} {:name          "Venue count elsewhere"
                                                             :type          :metric
                                                             :dataset_query (-> (lib/query mp (lib.metadata/table mp (mt/id :venues)))
                                                                                (lib/aggregate (lib/count)))}]
             (let [card-id       (t2/select-one-pk :model/Card :entity_id question-eid)
                   collection-id (shop-collection-id)
                   mp            (mt/metadata-provider)
                   venues        (lib/query mp (lib.metadata/table mp (mt/id :venues)))
                   save!         (fn [query]
                                   (mt/with-temp [:model/Card _ {:name "Saved" :collection_id collection-id :dataset_query query}]))
                   refused?      (fn [message query]
                                   (let [query-before (t2/select-one-fn :dataset_query :model/Card :id card-id)]
                                     (and (is (thrown-with-msg? clojure.lang.ExceptionInfo message (save! query)))
                                          (is (thrown-with-msg? clojure.lang.ExceptionInfo message
                                                                (t2/update! :model/Card card-id {:dataset_query query})))
                                          (is (= query-before (t2/select-one-fn :dataset_query :model/Card :id card-id))))))]
               (testing "a table published to the Library, and a Library metric, are fine"
                 (save! venues)
                 (save! (lib/aggregate venues (lib.metadata/metric mp library-metric-id)))
                 (t2/update! :model/Card card-id {:dataset_query (lib/aggregate venues (lib/count))}))
               (testing "a table that isn't published is refused"
                 (refused? #"can read only tables published to the Library, not USERS"
                           (lib/query mp (lib.metadata/table mp (mt/id :users)))))
               (testing "so is one joined explicitly"
                 (refused? #"can read only tables published to the Library, not CATEGORIES"
                           (lib/join venues (lib.metadata/table mp (mt/id :categories)))))
               (testing "or through a foreign key"
                 (refused? #"can read only tables published to the Library, not CATEGORIES"
                           (lib/breakout venues (some #(when (= (mt/id :categories :name) (:id %)) %)
                                                      (lib/breakoutable-columns venues)))))
               (testing "as is SQL"
                 (refused? #"must be built with the query builder"
                           (lib/native-query mp "SELECT * FROM venues")))
               (testing "a card as the source, even the app's own"
                 (refused? #"not the card"
                           (lib/query mp (lib.metadata/card mp card-id))))
               (testing "and a metric outside the Library"
                 (refused? #"can use only metrics from the Library"
                           (lib/aggregate venues (lib.metadata/metric mp other-metric-id))))
               (testing "a card elsewhere can still read the app's card"
                 (mt/user-http-request :crowberto :post 200 "card"
                                       {:name "Saved" :type "question" :display "table" :visualization_settings {}
                                        :dataset_query (lib/->legacy-MBQL (lib/query mp (lib.metadata/card mp card-id)))}))))))))))

(deftest a-card-in-an-apps-collection-cant-take-embedding-settings-test
  (testing "embedding parameters would make the export write a file every pull refuses, with embedding itself left off"
    (with-data-apps-sync
      (let [mock (test-helpers/create-mock-source :initial-files {"main" (shop-tree (question-resources))})]
        (is (= :success (:status (import-at! mock "main" :force? true))))
        (let [card-id (t2/select-one-pk :model/Card :entity_id question-eid)]
          (mt/with-temporary-setting-values [enable-embedding-modular true]
            (is (thrown-with-msg? clojure.lang.ExceptionInfo #"must be a question or metric"
                                  (t2/update! :model/Card card-id {:embedding_params {}})))
            (testing "a card elsewhere takes them"
              (mt/with-temp [:model/Card {other-id :id} {:name "Elsewhere"}]
                (mt/user-http-request :crowberto :put 200 (str "card/" other-id) {:embedding_params {}}))))
          (is (= :success (:status (export! mock))))
          (is (= :success (:status (import-at! mock "main" :force? true)))))))))

(deftest an-apps-collection-cant-be-made-official-or-moved-test
  (testing "either would make the export write a file every pull refuses"
    (with-data-apps-sync
      (let [mock (test-helpers/create-mock-source :initial-files {"main" (shop-tree (question-resources))})]
        (is (= :success (:status (import-at! mock "main" :force? true))))
        (let [collection-id (shop-collection-id)
              before        (resource-files mock)]
          (is (thrown-with-msg? clojure.lang.ExceptionInfo #"stays a top-level collection of data apps"
                                (t2/update! :model/Collection collection-id {:authority_level "official"})))
          (mt/with-temp [:model/Collection other {:name "Other root" :namespace :data-apps}]
            (is (thrown-with-msg? clojure.lang.ExceptionInfo #"You cannot move a data app's collection"
                                  (collection/move-collection! (t2/select-one :model/Collection :id collection-id)
                                                               (collection/children-location other)))))
          (is (=? {:authority_level nil :location "/"} (t2/select-one :model/Collection :id collection-id)))
          (is (= :success (:status (export! mock))))
          (testing "and the export keeps the collection's files"
            (is (= before (resource-files mock))))
          (is (= :success (:status (import-at! mock "main" :force? true)))))))))

(deftest an-action-in-an-apps-collection-cant-be-archived-test
  (testing "an export leaves out an archived action, and the next pull would then delete it from every instance"
    (with-data-apps-sync
      (data-apps.tu/do-with-sources!
       (fn [{:keys [action-id]}]
         (let [resources (data-apps.tu/build-resources shop-collection-name shop-collection-eid
                                                       [{:entity_id question-eid :name "VenuesList" :query (venues-stages)}]
                                                       [action-id])
               mock      (test-helpers/create-mock-source :initial-files {"main" (shop-tree resources)})]
           (is (= :success (:status (import-at! mock "main" :force? true))))
           (let [copy-id (t2/select-one-pk :model/Action :collection_id (shop-collection-id))
                 before  (resource-files mock)]
             (is (thrown-with-msg? clojure.lang.ExceptionInfo #"can't be archived"
                                   (t2/update! :model/Action copy-id {:archived true})))
             (testing "the source can still be archived"
               (mt/with-actions-enabled
                 (mt/user-http-request :crowberto :put 200 (str "action/" action-id) {:archived true})))
             (is (false? (t2/select-one-fn :archived :model/Action :id copy-id)))
             (is (= :success (:status (export! mock))))
             (testing "and the export keeps the action's file"
               (is (= before (resource-files mock)))))))))))

(deftest an-apps-collection-cant-be-marked-remote-synced-test
  (testing "an app's collection is synced with its app, and a pull refuses its file once it says remote-synced"
    (with-data-apps-sync
      (mt/with-additional-premium-features #{:remote-sync}
        (let [mock (test-helpers/create-mock-source :initial-files {"main" (shop-tree (question-resources))})]
          (is (= :success (:status (import-at! mock "main" :force? true))))
          (let [collection-id (shop-collection-id)]
            (mt/with-dynamic-fn-redefs [impl/finish-remote-config! (constantly nil)]
              (mt/user-http-request :crowberto :put 400 "ee/remote-sync/settings" {:collections {collection-id true}})
              (is (false? (t2/select-one-fn :is_remote_synced :model/Collection :id collection-id)))
              (testing "an ordinary collection still can be"
                (mt/with-temp [:model/Collection {other-id :id} {:name "Ordinary"}]
                  (mt/user-http-request :crowberto :put 200 "ee/remote-sync/settings" {:collections {other-id true}})
                  (is (true? (t2/select-one-fn :is_remote_synced :model/Collection :id other-id))))))))))))

(deftest an-action-in-an-apps-collection-stays-what-a-pull-accepts-test
  (testing "an action there can't be made public or read a card outside the collection: the next export would write it
            into a file every pull refuses"
    (with-data-apps-sync
      (data-apps.tu/do-with-sources!
       (fn [{:keys [action-id]}]
         (let [resources (data-apps.tu/build-resources shop-collection-name shop-collection-eid
                                                       [{:entity_id question-eid :name "VenuesList" :query (venues-stages)}]
                                                       [action-id])
               mock      (test-helpers/create-mock-source :initial-files {"main" (shop-tree resources)})]
           (is (= :success (:status (import-at! mock "main" :force? true))))
           (let [copy-id (t2/select-one-pk :model/Action :collection_id (shop-collection-id))
                 card-id (t2/select-one-pk :model/Card :entity_id question-eid)
                 reads   (fn [id]
                           (let [tag (str "#" id)]
                             (lib/query (mt/metadata-provider)
                                        {:database (mt/id)
                                         :type     :native
                                         :native   {:query         (str "SELECT * FROM {{" tag "}}")
                                                    :template-tags {tag {:type         :card
                                                                         :card-id      id
                                                                         :name         tag
                                                                         :display-name tag
                                                                         :id           (str (random-uuid))}}}})))]
             (mt/with-actions-enabled
               (mt/with-temporary-setting-values [enable-public-sharing true]
                 (mt/user-http-request :crowberto :post 400 (str "action/" copy-id "/public_link"))
                 (is (nil? (t2/select-one-fn :public_uuid :model/Action :id copy-id)))
                 (testing "the source action still can be"
                   (mt/user-http-request :crowberto :post 200 (str "action/" action-id "/public_link"))))
               (mt/with-temp [:model/Card {outside-id :id} {:name "Outside"}]
                 (let [query-before (t2/select-one-fn :dataset_query :model/QueryAction :action_id copy-id)]
                   (is (thrown-with-msg? clojure.lang.ExceptionInfo #"can read only the app's own cards"
                                         (actions/update! {:id copy-id :dataset_query (reads outside-id)}
                                                          (actions/select-action :id copy-id))))
                   (is (= query-before (t2/select-one-fn :dataset_query :model/QueryAction :action_id copy-id)))))
               (testing "it can read the app's own card"
                 (actions/update! {:id copy-id :dataset_query (reads card-id)} (actions/select-action :id copy-id))
                 (is (= #{card-id}
                        (into #{} (keep :card-id)
                              (filter map? (tree-seq coll? seq (t2/select-one-fn :dataset_query :model/QueryAction :action_id copy-id))))))))
             (is (= :success (:status (export! mock))))
             (is (= :success (:status (import-at! mock "main" :force? true)))))))))))

(deftest pull-loads-app-whose-collection-is-remote-synced-test
  (testing "an app's collection may be remote-synced, as remote sync marks it once it syncs the collection, so a pull
            that says so loads the app, and the next pull too"
    (with-data-apps-sync
      (let [tree      (shop-tree (question-resources))
            coll-file (data-apps.tu/collection-path shop-collection-name)
            synced    (update tree coll-file #(yaml/generate-string (assoc (yaml/parse-string %) :is_remote_synced true)))
            src       (test-helpers/versioned-source :trees {"v0" synced "v1" (assoc synced "README.md" "x")} :current "v0")]
        (is (contains? tree coll-file) "the fixture writes the collection's file where the test changes it")
        (let [result (import-at! src "v0" :force? true)]
          (is (= :success (:status result)) (:message result)))
        (is (= (shop-collection-id) (t2/select-one-pk :model/Collection :entity_id shop-collection-eid)))
        (is (true? (t2/select-one-fn :is_remote_synced :model/Collection :entity_id shop-collection-eid)))
        (is (t2/exists? :model/Card :entity_id question-eid :collection_id (shop-collection-id)))
        (let [result (import-at! src "v1" :force? true)]
          (is (= :success (:status result)) (:message result)))))))
