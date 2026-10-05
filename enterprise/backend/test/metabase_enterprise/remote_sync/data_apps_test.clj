(ns metabase-enterprise.remote-sync.data-apps-test
  "Data apps are serdes entities: remote sync imports and exports them like any other, with each app's bundle as a
   resource file next to its `data_app.yaml`."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.data-apps.test-util :as data-apps.tu]
   [metabase-enterprise.remote-sync.impl :as impl]
   [metabase-enterprise.remote-sync.models.remote-sync-task :as remote-sync.task]
   [metabase-enterprise.remote-sync.source.protocol :as source.p]
   [metabase-enterprise.remote-sync.test-helpers :as test-helpers]
   [metabase.actions.core :as actions]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
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
         ;; the cleanup deletes without hooks, so what a pull loads into an app's collection is listed too
         (mt/with-model-cleanup [:model/DataApp :model/Action :model/Card :model/Collection :model/PermissionsGroup]
           ~@body)))))

(deftest pull-imports-and-prunes-data-apps-test
  (with-data-apps-sync
    (let [src (test-helpers/versioned-source :trees {"v0" (app-tree sales-eid "sales" "BUNDLE-V1")
                                                     "v1" {"README.md" "x"}}
                                             :current "v0")]
      (testing "a pull imports the app and its bundle"
        (is (=? {:status :success :outcome {:kind "pulled" :count 1}} (import-at! src "v0" :force? true)))
        (is (=? {:entity_id sales-eid :display_name "Sales" :resource_collection_id pos-int?}
                (t2/select-one :model/DataApp :name "sales")))
        (is (= "BUNDLE-V1" (bundle-text "sales"))))
      (testing "a pull whose repo no longer has the app removes it"
        (is (= :success (:status (import-at! src "v1"))))
        (is (not (t2/exists? :model/DataApp :name "sales")))))))

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
        (is (= #{"data_apps/ops/data_app.yaml" "data_apps/ops/app.js" "data_apps/ops/resources/collection.yaml"}
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
          (is (= (into #{"data_apps/ops/data_app.yaml" "data_apps/ops/app.js" "data_apps/ops/resources/collection.yaml"}
                       (keys source))
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

;;; ------------------------------------------------- Resources -------------------------------------------------

(def ^:private shop-collection-eid (data-apps.tu/collection-entity-id "shop"))

(def ^:private question-eid "shopQuestionListVenue")

(defn- venues-query []
  {:stages [{:source {:type "table" :id (mt/id :venues)} :limit 5}]})

(defn- shop-tree
  "The repo files of the `shop` app with `resources` (see `data-apps.tu/build-resources`)."
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
                          shop-collection-eid
                          [{:entity_id question-eid :name "VenuesList" :query (venues-query)}
                           {:entity_id "shopQuestionMetricVen" :name "VenueCount"
                            :query {:stages [{:source       {:type "table" :id (mt/id :venues)}
                                              :aggregations [{:type "metric" :id metric-id}]}]}}]
                          [action-id])
               src       (test-helpers/versioned-source :trees {"v0" (shop-tree resources)} :current "v0")
               copy-eid  (fn [kind source-model source-id]
                           (data-apps.tu/copy-entity-id kind shop-collection-eid (t2/select-one-fn :entity_id source-model :id source-id)))]
           (let [result (import-at! src "v0" :force? true)]
             (is (= :success (:status result)) (:message result)))
           (let [collection-id (shop-collection-id)]
             (testing "the app is linked to the collection the files define"
               (is (= collection-id (t2/select-one-pk :model/Collection :entity_id shop-collection-eid))))
             (testing "each query is a saved question in the collection"
               (is (=? {:type :question :name "VenuesList" :collection_id collection-id}
                       (t2/select-one :model/Card :entity_id question-eid))))
             (testing "the metric a query uses is copied"
               (is (=? {:type :metric :collection_id collection-id}
                       (t2/select-one :model/Card :entity_id (copy-eid "metric" :model/Card metric-id)))))
             (testing "the action is copied into the collection, on no model"
               (is (=? {:type :query :collection_id collection-id :model_id nil}
                       (t2/select-one :model/Action :entity_id (copy-eid "action" :model/Action action-id)))))
             (testing "the source is untouched"
               (is (nil? (t2/select-one-fn :collection_id :model/Action :id action-id))))
             (testing "the app records the tables its resources read"
               (is (= [(mt/id :venues)] (t2/select-one-fn :table_ids :model/DataApp :name "shop")))))))))))

(deftest pull-updates-and-removes-resources-with-their-files-test
  (with-data-apps-sync
    (let [resources (data-apps.tu/build-resources shop-collection-eid
                                                  [{:entity_id question-eid :name "VenuesList" :query (venues-query)}
                                                   {:entity_id "shopQuestionOther0001" :name "Other" :query (venues-query)}]
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
  (testing "a resource file a load can't take as meant fails the pull, naming the file, before anything loads"
    (with-data-apps-sync
      (let [resources (data-apps.tu/build-resources shop-collection-eid
                                                    [{:entity_id question-eid :name "VenuesList" :query (venues-query)}]
                                                    [])
            card-file (some #(when (str/starts-with? % "cards/") %) (keys resources))
            archived  (update resources card-file #(yaml/generate-string (assoc (yaml/parse-string %) :archived true)))
            src       (test-helpers/versioned-source :trees {"v0" (shop-tree archived)} :current "v0")
            result    (import-at! src "v0" :force? true)]
        (is (= :error (:status result)))
        (is (str/includes? (:message result) (str "data_apps/shop/resources/" card-file)))
        (is (not (t2/exists? :model/DataApp :name "shop")) "nothing loaded")))))

(deftest pull-refuses-to-take-over-a-card-elsewhere-test
  (testing "a file naming the entity ID of a card outside the app can't move it into the app's collection"
    (with-data-apps-sync
      (mt/with-temp [:model/Card {foreign-id :id} {:name "Someone else's" :entity_id question-eid}]
        (let [src    (test-helpers/versioned-source
                      :trees {"v0" (shop-tree (data-apps.tu/build-resources shop-collection-eid
                                                                            [{:entity_id question-eid :name "VenuesList" :query (venues-query)}]
                                                                            []))}
                      :current "v0")
              result (import-at! src "v0" :force? true)]
          (is (= :error (:status result)))
          (is (str/includes? (:message result) "data_apps/shop/resources/cards/"))
          (is (= "Someone else's" (t2/select-one-fn :name :model/Card :id foreign-id))))))))

(deftest export-writes-an-apps-resources-beside-it-test
  (testing "what an app's collection holds is exported under data_apps/<slug>/resources/, not under collections/"
    (with-data-apps-sync
      (let [mock (test-helpers/create-mock-source :initial-files {"main" {}})
            repo #(get @(:files-atom mock) "main")]
        (mt/user-http-request :crowberto :post 200 "apps" {:name         "sales"
                                                           :display_name "Sales"
                                                           :bundle_path  "dist/index.js"
                                                           :bundle       "BUNDLE"})
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
                     "data_apps/sales/resources/collection.yaml"
                     "data_apps/sales/resources/cards/venues_list.yaml"
                     "data_apps/sales/resources/actions/rename_venue.yaml"}
                   (into #{} (filter #(re-find #"^data_apps/" %)) (keys (repo)))))
            (is (empty? (filter #(re-find #"^(collections|actions)/" %) (keys (repo))))
                "nothing of the app's lands in the shared directories")))))))
