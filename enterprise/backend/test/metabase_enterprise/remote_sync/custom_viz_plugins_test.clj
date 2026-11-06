(ns metabase-enterprise.remote-sync.custom-viz-plugins-test
  "Custom viz plugins are serdes entities: remote sync imports and exports them like data apps, with each plugin's
   bundle unpacked beside its `custom_viz_plugin.yaml` under `custom_viz_plugins/<slug>/`."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.custom-viz-plugin.cache :as cache]
   [metabase-enterprise.custom-viz-plugin.settings :as custom-viz.settings]
   [metabase-enterprise.custom-viz-plugin.test-util :as cv.tu]
   [metabase-enterprise.remote-sync.impl :as impl]
   [metabase-enterprise.remote-sync.source.protocol :as source.p]
   [metabase-enterprise.remote-sync.test-helpers :as test-helpers]
   [metabase.search.test-util :as search.tu]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util.json :as json]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))
(use-fixtures :each
  test-helpers/clean-remote-sync-state test-helpers/commit-with-temp)

(defn- plugin-files [identifier js]
  {"metabase-plugin.json" (json/encode {:name identifier :icon "icon.svg" :metabase {:version ">=1.60"}})
   "dist/index.js"        js
   "dist/assets/icon.svg" "<svg xmlns=\"http://www.w3.org/2000/svg\"/>"})

(defn- repo-paths
  "The paths plugin `identifier`'s files have in a repo."
  [identifier]
  (into #{(str "custom_viz_plugins/" identifier "/custom_viz_plugin.yaml")}
        (map #(str "custom_viz_plugins/" identifier "/" %))
        (keys (plugin-files identifier ""))))

(defn- entity-id
  "A stable entity_id for plugin `identifier`: the identifier padded to the 21 characters of a NanoID."
  [identifier]
  (subs (str identifier "000000000000000000000") 0 21))

(defn- plugin-tree
  "Repo files for plugin `identifier`: its YAML and the files of its bundle."
  [identifier js & {:keys [entity-id] :or {entity-id (entity-id identifier)}}]
  (let [dir   (str "custom_viz_plugins/" identifier "/")
        files (plugin-files identifier js)]
    (into {(str dir "custom_viz_plugin.yaml")
           (str "entity_id: " entity-id "\nidentifier: " identifier "\nfiles:\n"
                (apply str (map #(str "- " % "\n") (sort (keys files))))
                "serdes/meta:\n- model: CustomVizPlugin\n")}
          (map (fn [[path content]] [(str dir path) content]))
          files)))

(defn- plugin-id [identifier]
  (t2/select-one-pk :model/CustomVizPlugin :identifier identifier))

(defn- stored-js [identifier]
  (-> (t2/select-one-fn :bundle [:model/CustomVizPlugin :bundle] :identifier identifier)
      cache/bundle->files
      (get "dist/index.js")
      (String. "UTF-8")))

(defn- new-task! [sync-task-type]
  (t2/insert-returning-pk! :model/RemoteSyncTask {:sync_task_type sync-task-type :initiated_by (mt/user->id :rasta)}))

(defn- import-at!
  [src version & {:keys [force?] :or {force? false}}]
  (let [task   (new-task! "import")
        result (impl/import! (source.p/snapshot-at src version) task :force? force?)]
    (impl/handle-task-result! result task)
    result))

(defn- import-ok! [src version & {:as opts}]
  (let [result (import-at! src version opts)]
    (is (= :success (:status result)) (:message result))))

(defn- export-ok! [mock]
  (t2/delete! :model/RemoteSyncTask)
  (let [task   (new-task! "export")
        result (impl/export! (source.p/snapshot mock) task "export" :force? true)]
    (impl/handle-task-result! result task)
    (is (= :success (:status result)) (:message result))))

(defn- upload! [status files]
  (mt/user-http-request :crowberto :post status "ee/custom-viz-plugin/"
                        {:request-options {:headers {"content-type" "multipart/form-data"}}}
                        {:file (cv.tu/make-tgz-bytes files)}))

(defn- replace-bundle! [status id files]
  (mt/user-http-request :crowberto :put status (str "ee/custom-viz-plugin/" id "/bundle")
                        {:request-options {:headers {"content-type" "multipart/form-data"}}}
                        {:file (cv.tu/make-tgz-bytes files)}))

(defn- delete-plugin! [status id]
  (mt/user-http-request :crowberto :delete status (str "ee/custom-viz-plugin/" id)))

(defn- register-dev-plugin!
  "Register a dev-only plugin `identifier` through the API, with the dev server stubbed out."
  [identifier]
  (mt/with-dynamic-fn-redefs [custom-viz.settings/custom-viz-plugin-dev-mode-enabled (constantly true)
                              cache/fetch-dev-manifest                                (constantly {:name identifier})
                              cache/set-or-clear-dev-bundle!                          (constantly nil)]
    (mt/user-http-request :crowberto :post 200 "ee/custom-viz-plugin/dev"
                          {:identifier identifier :dev_bundle_url "http://localhost:5173"})))

(defmacro ^:private with-plugin-sync [& body]
  `(search.tu/with-index-disabled
     (mt/with-premium-features #{:custom-viz}
       (mt/with-temporary-setting-values [remote-sync-type :read-write remote-sync-enabled true remote-sync-transforms false
                                          csp-img-enabled true custom-viz-enabled true]
         (mt/with-model-cleanup [:model/CustomVizPlugin]
           ~@body)))))

(deftest pull-imports-updates-renames-and-prunes-plugins-test
  (with-plugin-sync
    (let [src (test-helpers/versioned-source :trees {"v0"         (plugin-tree "thumbs" "v1();")
                                                     "v1"         (plugin-tree "thumbs" "v2();")
                                                     "v1-renamed" (plugin-tree "Thumbs2" "v2();" :entity-id (entity-id "thumbs"))
                                                     "v2"         {"README.md" "x"}}
                                             :current "v0")]
      (testing "a pull registers the plugin under the repo's entity_id"
        (import-ok! src "v0" :force? true)
        (is (=? {:status :active :enabled true :entity_id (entity-id "thumbs")}
                (t2/select-one :model/CustomVizPlugin :identifier "thumbs")))
        (is (= "synced" (t2/select-one-fn :status :model/RemoteSyncObject :model_type "CustomVizPlugin"))))
      (let [id (plugin-id "thumbs")]
        (testing "a changed bundle updates the plugin in place, leaving `enabled` to the instance"
          (mt/user-http-request :crowberto :put 200 (str "ee/custom-viz-plugin/" id) {:enabled false})
          (import-ok! src "v1")
          (is (=? {:id id :enabled false} (t2/select-one :model/CustomVizPlugin :identifier "thumbs")))
          (is (= "v2();" (stored-js "thumbs"))))
        (testing "a new identifier under the same entity_id renames the plugin in place"
          (import-ok! src "v1-renamed")
          (is (= id (plugin-id "Thumbs2"))))
        (testing "a plugin whose directory is gone is deleted"
          (import-ok! src "v2")
          (is (not (t2/exists? :model/CustomVizPlugin :id id)))
          (is (not (t2/exists? :model/RemoteSyncObject :model_type "CustomVizPlugin"))))))))

(deftest pull-refuses-to-delete-an-unpushed-plugin-test
  (with-plugin-sync
    (let [tree (plugin-tree "thumbs" "v1();")
          src  (test-helpers/versioned-source :trees {"v0" tree "v1" (assoc tree "README.md" "x")} :current "v0")]
      (import-ok! src "v0" :force? true)
      (upload! 200 (plugin-files "ops" "ops();"))
      (is (=? {:status :conflict} (import-at! src "v1")))
      (is (t2/exists? :model/CustomVizPlugin :identifier "ops")))))

(deftest pull-refuses-a-plugin-whose-identifier-is-taken-test
  (with-plugin-sync
    (let [src (test-helpers/versioned-source :trees {"v0" (plugin-tree "thumbs" "v1();")} :current "v0")]
      (upload! 200 (plugin-files "thumbs" "local();"))
      (is (=? {:status  :error
               :message #"(?s).*A custom viz plugin \"thumbs\" already exists on this instance\. Delete it and pull again.*"}
              (import-at! src "v0" :force? true)))
      (is (= "local();" (stored-js "thumbs")))
      (testing "once the local plugin is deleted, the pull lands the repo's"
        (delete-plugin! 204 (plugin-id "thumbs"))
        (import-ok! src "v0" :force? true)
        (is (= "v1();" (stored-js "thumbs")))))))

(deftest export-writes-and-removes-only-plugin-files-test
  (with-plugin-sync
    (let [source {"custom_viz_plugins/thumbs/src/index.tsx" "export default null;"
                  "custom_viz_plugins/README.md"            "# plugins"}
          mock   (test-helpers/create-mock-source :initial-files {"main" source})
          repo   #(get @(:files-atom mock) "main")
          paths  #(set (filter (partial re-find #"^custom_viz_plugins/") (keys (repo))))]
      (mt/with-temp [:model/Collection _ {:name "Synced" :is_remote_synced true :location "/"}]
        (upload! 200 (plugin-files "thumbs" "v1();"))
        (testing "an uploaded plugin is exported as its YAML and bundle files, beside the files it does not own"
          (export-ok! mock)
          (is (= (into (repo-paths "thumbs") (keys source)) (paths))))
        (testing "a replaced bundle is exported"
          (replace-bundle! 200 (plugin-id "thumbs") (plugin-files "thumbs" "v2();"))
          (export-ok! mock)
          (is (= "v2();" (get (repo) "custom_viz_plugins/thumbs/dist/index.js"))))
        (testing "a deleted plugin's files are removed; other plugins' and unowned files stay"
          (upload! 200 (plugin-files "ops" "ops();"))
          (delete-plugin! 204 (plugin-id "thumbs"))
          (export-ok! mock)
          (is (= (into (repo-paths "ops") (keys source)) (paths))))))))

(deftest dev-only-plugins-are-not-synced-test
  (with-plugin-sync
    (mt/with-temp [:model/Collection _ {:name "Synced" :is_remote_synced true :location "/"}]
      (let [mock (test-helpers/create-mock-source :initial-files {"main" (plugin-tree "thumbs" "v1();")})]
        (import-ok! mock "main" :force? true)
        (let [{dev-id :id} (register-dev-plugin! "dev-only")]
          (is (not (t2/exists? :model/RemoteSyncObject :model_type "CustomVizPlugin" :model_id dev-id)))
          (export-ok! mock)
          (is (not-any? #(re-find #"dev_only" %) (keys (get @(:files-atom mock) "main"))))
          (import-ok! mock "main")
          (is (t2/exists? :model/CustomVizPlugin :id dev-id)))))))

(deftest read-only-instance-refuses-plugin-changes-test
  (with-plugin-sync
    (import-ok! (test-helpers/create-mock-source :initial-files {"main" (plugin-tree "thumbs" "v1();")}) "main" :force? true)
    (let [id (plugin-id "thumbs")]
      (mt/with-temporary-setting-values [remote-sync-type :read-only remote-sync-url "https://example.com/repo.git"]
        (upload! 403 (plugin-files "ops" "ops();"))
        (replace-bundle! 403 id (plugin-files "thumbs" "v2();"))
        (delete-plugin! 403 id)
        (testing "`enabled` and dev-only plugins stay this instance's"
          (mt/user-http-request :crowberto :put 200 (str "ee/custom-viz-plugin/" id) {:enabled false})
          (delete-plugin! 204 (:id (register-dev-plugin! "dev-only"))))))))
