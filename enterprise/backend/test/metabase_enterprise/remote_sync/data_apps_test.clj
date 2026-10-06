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
   [metabase.driver :as driver]
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

(defn- question-resources []
  (data-apps.tu/build-resources shop-collection-eid
                                [{:entity_id question-eid :name "VenuesList" :query (venues-query)}]
                                []))

(defn- resource-files
  "The resource files of the `shop` app in `mock`'s repository."
  [mock]
  (into #{} (filter #(re-find #"^data_apps/shop/resources/" %)) (keys (get @(:files-atom mock) "main"))))

(deftest export-keeps-the-file-of-a-resource-edited-here-test
  (testing "a card and an action edited in Metabase are exported as changed, not removed from the repository"
    (with-data-apps-sync
      (data-apps.tu/do-with-sources!
       (fn [{:keys [action-id]}]
         (let [resources (data-apps.tu/build-resources
                          shop-collection-eid
                          [{:entity_id question-eid :name "VenuesList" :query (venues-query)}]
                          [action-id])
               mock      (test-helpers/create-mock-source :initial-files {"main" (shop-tree resources)})]
           (is (= :success (:status (import-at! mock "main" :force? true))))
           (let [card-id (t2/select-one-pk :model/Card :entity_id question-eid)
                 copy-id (t2/select-one-pk :model/Action :collection_id (shop-collection-id))]
             (mt/user-http-request :crowberto :put 200 (str "card/" card-id) {:description "edited here"})
             (mt/with-actions-enabled
               (mt/user-http-request :crowberto :put 200 (str "action/" copy-id) {:name "Renamed venue"}))
             (is (= :success (:status (export! mock))))
             (is (some #(str/includes? % "/resources/cards/") (resource-files mock)))
             (is (some #(str/includes? % "/resources/actions/") (resource-files mock)))
             (is (some #(str/includes? (get-in @(:files-atom mock) ["main" %]) "edited here") (resource-files mock)))
             (testing "and a pull of what was exported keeps both"
               (is (= :success (:status (import-at! mock "main" :force? true))))
               (is (t2/exists? :model/Card :id card-id))
               (is (t2/exists? :model/Action :id copy-id))))))))))

(deftest a-read-only-instance-refuses-an-edit-to-a-resource-test
  (testing "with remote sync read-only, a card in an app's collection can't be edited here, like any synced card"
    (with-data-apps-sync
      (let [src (test-helpers/versioned-source :trees {"v0" (shop-tree (question-resources))} :current "v0")]
        (is (= :success (:status (import-at! src "v0" :force? true))))
        (let [card-id (t2/select-one-pk :model/Card :entity_id question-eid)]
          (testing "without remote sync the card is not synced, so it can be edited"
            (mt/with-temporary-setting-values [remote-sync-type :read-only remote-sync-url nil]
              (mt/user-http-request :crowberto :put 200 (str "card/" card-id) {:description "edited without sync"})))
          (mt/with-temporary-setting-values [remote-sync-type :read-only remote-sync-url "https://example.com/repo.git"]
            (mt/user-http-request :crowberto :put 403 (str "card/" card-id) {:description "edited here"})
            (testing "and the instance still pulls"
              (is (= :success (:status (import-at! src "v0" :force? true)))))))))))

(deftest an-apps-collection-holds-only-what-a-pull-accepts-test
  (testing "what the resource validator would refuse on a pull can't be saved into an app's collection"
    (with-data-apps-sync
      (let [src (test-helpers/versioned-source :trees {"v0" (shop-tree (question-resources))} :current "v0")
            mp  (mt/metadata-provider)
            q   (lib/->legacy-MBQL (lib/query mp (lib.metadata/table mp (mt/id :venues))))]
        (is (= :success (:status (import-at! src "v0" :force? true))))
        (let [collection-id (shop-collection-id)
              card          (fn [status card-type]
                              (mt/user-http-request :crowberto :post status "card"
                                                    {:name "Saved here" :type card-type :display "table"
                                                     :visualization_settings {} :collection_id collection-id
                                                     :dataset_query q}))]
          (mt/user-http-request :crowberto :post 400 "dashboard" {:name "Saved here" :collection_id collection-id})
          (card 400 "model")
          (card 200 "question")
          (testing "with the library feature too, whose check runs in the same place"
            (mt/with-additional-premium-features #{:library}
              (card 400 "model")))
          (mt/with-temp [:model/Dashboard {dashboard-id :id} {:name "Elsewhere"}]
            (mt/user-http-request :crowberto :put 400 (str "dashboard/" dashboard-id) {:collection_id collection-id})))))))

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
            (mt/user-http-request :crowberto :put 400 (str "card/" card-id) {:archived true})
            (mt/user-http-request :crowberto :put 400 (str "card/" card-id) {:type "model"})
            (is (=? {:archived false :public_uuid nil :type :question} (t2/select-one :model/Card :id card-id))))
          (testing "a card that is already public can't be moved in"
            (mt/with-temp [:model/Card {public-id :id} {:name              "Already public"
                                                        :dataset_query     q
                                                        :public_uuid       (str (random-uuid))
                                                        :made_public_by_id (mt/user->id :crowberto)}]
              (mt/user-http-request :crowberto :put 400 (str "card/" public-id) {:collection_id collection-id})))
          (testing "it can still be edited, and the export keeps its file"
            (mt/user-http-request :crowberto :put 200 (str "card/" card-id) {:description "still editable"})
            (is (= :success (:status (export! mock))))
            (is (some #(str/includes? % "/resources/cards/") (resource-files mock)))
            (is (= :success (:status (import-at! mock "main" :force? true)))))
          (testing "a card anywhere else still can be archived"
            (mt/with-temp [:model/Card {other-id :id} {:name "Elsewhere"}]
              (mt/user-http-request :crowberto :put 200 (str "card/" other-id) {:archived true}))))))))

(deftest a-pull-of-the-commit-already-imported-is-skipped-test
  (testing "a pull that would load nothing isn't failed by the state of the instance"
    (with-data-apps-sync
      (let [src (test-helpers/versioned-source :trees {"v0" (shop-tree (question-resources))} :current "v0")]
        (is (= :success (:status (import-at! src "v0" :force? true))))
        (t2/update! :model/Card :entity_id question-eid {:collection_id nil})
        (is (=? {:status :success :outcome {:kind "pull-skipped"}} (import-at! src "v0")))
        (testing "a pull that would load is still refused"
          (is (= :error (:status (import-at! src "v0" :force? true)))))))))

(deftest pull-refuses-two-apps-that-name-one-collection-test
  (with-data-apps-sync
    (let [shared (data-apps.tu/collection-entity-id "shared")
          app    (fn [slug] (data-apps.tu/app-files slug {:name slug :path "index.js" :bundle "B" :collection shared}))
          src    (test-helpers/versioned-source :trees {"v0" (merge (app "first") (app "second"))} :current "v0")
          result (import-at! src "v0" :force? true)]
      (is (= :error (:status result)))
      (is (str/includes? (:message result) "data_apps/first/data_app.yaml"))
      (is (str/includes? (:message result) "data_apps/second/data_app.yaml"))
      (is (not (t2/exists? :model/DataApp :name [:in ["first" "second"]])) "nothing loaded"))))

(deftest pull-refuses-two-apps-that-define-one-card-test
  (with-data-apps-sync
    (let [app    (fn [slug]
                   (let [collection (data-apps.tu/collection-entity-id slug)]
                     (data-apps.tu/app-files slug {:name slug :path "index.js" :bundle "B" :collection collection
                                                   :resources (data-apps.tu/build-resources
                                                               collection
                                                               [{:entity_id question-eid :name "VenuesList" :query (venues-query)}]
                                                               [])})))
          src    (test-helpers/versioned-source :trees {"v0" (merge (app "first") (app "second"))} :current "v0")
          result (import-at! src "v0" :force? true)]
      (is (= :error (:status result)))
      (is (str/includes? (:message result) "data_apps/first/resources/cards/"))
      (is (str/includes? (:message result) "data_apps/second/resources/cards/"))
      (is (not (t2/exists? :model/Card :entity_id question-eid)) "nothing loaded"))))

(deftest pull-survives-a-query-whose-tables-cant-be-read-test
  (testing "a native query on a driver that can't name its tables doesn't fail the pull; the app records the rest"
    (driver/register! ::no-table-refs)
    (with-data-apps-sync
      (mt/with-temp [:model/Database _ {:engine ::no-table-refs :name "no-table-refs"}]
        (let [resources (data-apps.tu/build-resources
                         shop-collection-eid
                         [{:entity_id question-eid :name "VenuesList" :query (venues-query)}
                          {:entity_id "shopQuestionNative000" :name "Native" :query (venues-query)}]
                         [])
              path      (some #(when (str/includes? % "shopQuestionNative000") %) (keys resources))
              native    (assoc (yaml/parse-string (get resources path))
                               :database_id "no-table-refs"
                               :dataset_query {:database "no-table-refs"
                                               :lib/type "mbql/query"
                                               :stages   [{:lib/type "mbql.stage/native" :native "{\"find\": \"orders\"}"}]})
              src       (test-helpers/versioned-source
                         :trees {"v0" (shop-tree (assoc resources path (yaml/generate-string native)))}
                         :current "v0")
              result    (import-at! src "v0" :force? true)]
          (is (= :success (:status result)) (:message result))
          (is (= "v0" (remote-sync.task/last-version)))
          (is (= [(mt/id :venues)] (t2/select-one-fn :table_ids :model/DataApp :name "shop"))))))))

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
          (is (str/includes? (:message result) "data_apps/shop/data_app.yaml"))
          (is (t2/exists? :model/Collection :id collection-id))
          (is (t2/exists? :model/Card :id card-id)))))))

(defn- export-merged!
  "Export to `src` with `merge`, as an instance whose last sync was `base-version` does once the remote has advanced."
  [src base-version]
  (t2/delete! :model/RemoteSyncTask :sync_task_type "export")
  (let [task   (new-task! "export")
        result (impl/export! (source.p/snapshot src) task "export"
                             :merge? true :source src :base-snapshot (source.p/snapshot-at src base-version))]
    (impl/handle-task-result! result task)
    result))

(deftest an-export-that-merges-checks-and-records-like-a-pull-test
  (with-data-apps-sync
    (testing "a remote file that a pull refuses is refused by an export that merges it in"
      (mt/with-temp [:model/Collection {elsewhere :id} {:name "Elsewhere"}
                     :model/Card       {foreign-id :id} {:name "Someone else's" :entity_id "foreignCardEntityId00"
                                                         :collection_id elsewhere}]
        (let [remote (data-apps.tu/build-resources
                      shop-collection-eid
                      [{:entity_id question-eid :name "VenuesList" :query (venues-query)}
                       {:entity_id "foreignCardEntityId00" :name "Taken" :query (venues-query)}]
                      [])
              src    (test-helpers/versioned-source
                      :trees {"v0" (shop-tree (question-resources)) "v1" (shop-tree remote)}
                      :current "v1")]
          (is (= :success (:status (import-at! src "v0" :force? true))))
          (is (= :error (:status (export-merged! src "v0"))))
          (is (=? {:name "Someone else's" :collection_id elsewhere}
                  (t2/select-one :model/Card :id foreign-id))))))))

(deftest an-export-that-merges-records-the-tables-test
  (with-data-apps-sync
    (let [remote (data-apps.tu/build-resources
                  shop-collection-eid
                  [{:entity_id question-eid :name "VenuesList" :query (venues-query)}
                   {:entity_id "shopQuestionCheckins0" :name "Checkins"
                    :query {:stages [{:source {:type "table" :id (mt/id :checkins)} :limit 5}]}}]
                  [])
          src    (test-helpers/versioned-source
                  :trees {"v0" (shop-tree (question-resources)) "v1" (shop-tree remote)}
                  :current "v1")]
      (is (= :success (:status (import-at! src "v0" :force? true))))
      (is (= :success (:status (export-merged! src "v0"))))
      (is (= (sort [(mt/id :venues) (mt/id :checkins)])
             (t2/select-one-fn :table_ids :model/DataApp :name "shop"))))))

(deftest pull-loads-a-snippet-with-the-card-that-uses-it-test
  (testing "a resource may use a snippet that the same pull brings"
    (with-data-apps-sync
      (mt/with-model-cleanup [:model/NativeQuerySnippet]
        (let [snippet-eid "appSnippetEntityId000"
              resources   (question-resources)
              path        (some #(when (str/starts-with? % "cards/") %) (keys resources))
              parsed      (yaml/parse-string (get resources path))
              native      (assoc parsed :dataset_query
                                 {:database (:database (:dataset_query parsed))
                                  :lib/type "mbql/query"
                                  :stages   [{:lib/type      "mbql.stage/native"
                                              :native        "SELECT * FROM venues {{snippet: Remote Snippet}}"
                                              :template-tags {"snippet: Remote Snippet"
                                                              {:type         "snippet"
                                                               :name         "snippet: Remote Snippet"
                                                               :id           "7f2c2a0e-6c1e-4b53-9d0a-0d5a3a1d1c11"
                                                               :display-name "Snippet: Remote Snippet"
                                                               :snippet-name "Remote Snippet"
                                                               :snippet-id   snippet-eid}}}]})
              tree        (merge (shop-tree (assoc resources path (yaml/generate-string native)))
                                 {"snippets/remote_snippet.yaml"
                                  (test-helpers/generate-snippet-yaml snippet-eid "Remote Snippet" "WHERE 1 = 1")})
              src         (test-helpers/versioned-source :trees {"v0" tree} :current "v0")
              result      (import-at! src "v0" :force? true)]
          (is (= :success (:status result)) (:message result))
          (is (t2/exists? :model/NativeQuerySnippet :entity_id snippet-eid))
          (is (=? {:query_type :native} (t2/select-one :model/Card :entity_id question-eid)))
          (testing "a snippet that nothing defines is still refused"
            (let [src (test-helpers/versioned-source
                       :trees {"v0" (shop-tree (assoc resources path
                                                      (yaml/generate-string
                                                       (assoc-in native [:dataset_query :stages 0 :template-tags
                                                                         "snippet: Remote Snippet" :snippet-id]
                                                                 "nowhereSnippetEid0000"))))}
                       :current "v0")]
              (is (= :error (:status (import-at! src "v0" :force? true)))))))))))

(deftest pull-records-the-table-a-native-query-names-test
  (testing "a native query's table is matched by name whatever its case"
    (with-data-apps-sync
      (let [resources (question-resources)
            path      (some #(when (str/starts-with? % "cards/") %) (keys resources))
            parsed    (yaml/parse-string (get resources path))
            native    (assoc parsed :dataset_query {:database (:database (:dataset_query parsed))
                                                    :lib/type "mbql/query"
                                                    :stages   [{:lib/type "mbql.stage/native"
                                                                :native   "select * from Venues"}]})
            src       (test-helpers/versioned-source
                       :trees {"v0" (shop-tree (assoc resources path (yaml/generate-string native)))}
                       :current "v0")
            result    (import-at! src "v0" :force? true)]
        (is (= :success (:status result)) (:message result))
        (is (= [(mt/id :venues)] (t2/select-one-fn :table_ids :model/DataApp :name "shop")))))))
