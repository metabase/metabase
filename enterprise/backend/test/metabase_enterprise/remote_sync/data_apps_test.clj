(ns metabase-enterprise.remote-sync.data-apps-test
  "Data apps are serdes entities: remote sync imports and exports them like any other, with each app's bundle as a
   resource file next to its `data_app.yaml`, and its collection under `collections/data_apps/` like any collection
   of a namespace."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.data-apps.test-util :as data-apps.tu]
   [metabase-enterprise.remote-sync.impl :as impl]
   [metabase-enterprise.remote-sync.models.remote-sync-task :as remote-sync.task]
   [metabase-enterprise.remote-sync.source.protocol :as source.p]
   [metabase-enterprise.remote-sync.test-helpers :as test-helpers]
   [metabase.lib.core :as lib]
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
               (is (=? {:type :implicit :collection_id collection-id :model_id nil}
                       (t2/select-one :model/Action :entity_id (copy-eid action-id)))))
             (testing "the source is untouched"
               (is (nil? (t2/select-one-fn :collection_id :model/Action :id action-id)))))))))))

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
