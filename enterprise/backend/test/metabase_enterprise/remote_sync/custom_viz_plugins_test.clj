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

(def ^:private icon-svg
  "The SVG icon; the text outside ASCII catches a wrong charset."
  "<svg xmlns=\"http://www.w3.org/2000/svg\"><title>Daumen hoch – 👍</title></svg>")

(defn- manifest [identifier]
  {:name identifier :icon "icon.svg" :metabase {:version ">=1.60"}})

(defn- plugin-files
  "The files of plugin `identifier`'s bundle as text, relative to its directory, with `js` as its script."
  [identifier js]
  {"metabase-plugin.json" (json/encode (manifest identifier))
   "dist/index.js"        js
   "dist/assets/icon.svg" icon-svg})

(defn- entity-id
  "A stable entity_id for plugin `identifier` in a repo: the identifier padded to the 21 characters of a NanoID."
  [identifier]
  (subs (str identifier "000000000000000000000") 0 21))

(defn- plugin-tree
  "Repo files for plugin `identifier`: its YAML, carrying its entity_id like a data app's, and the files of its
  bundle."
  [identifier js & {:keys [entity-id] :or {entity-id (entity-id identifier)}}]
  (let [dir   (str "custom_viz_plugins/" identifier "/")
        files (plugin-files identifier js)]
    (into {(str dir "custom_viz_plugin.yaml")
           (str "entity_id: " entity-id "\nidentifier: " identifier "\nfiles:\n"
                (apply str (map #(str "- " % "\n") (sort (keys files))))
                "serdes/meta:\n- model: CustomVizPlugin\n")}
          (map (fn [[path content]] [(str dir path) content]))
          files)))

(defn- plugin-files-in
  "The files of `repo` under `custom_viz_plugins/`."
  [repo]
  (into #{} (filter #(re-find #"^custom_viz_plugins/" %)) (keys repo)))

(defn- stored-files
  "The files of the bundle stored for plugin `identifier`, as text."
  [identifier]
  (update-vals (cache/bundle->files (t2/select-one-fn :bundle [:model/CustomVizPlugin :bundle] :identifier identifier))
               #(String. ^bytes % "UTF-8")))

(defn- new-task! [sync-task-type]
  (t2/insert-returning-pk! :model/RemoteSyncTask {:sync_task_type sync-task-type :initiated_by (mt/user->id :rasta)}))

(defn- import-at!
  "Run `import!` against the source's snapshot at `version`, complete the task, and return the result."
  [src version & {:keys [force?] :or {force? false}}]
  (let [task   (new-task! "import")
        result (impl/import! (source.p/snapshot-at src version) task :force? force?)]
    (impl/handle-task-result! result task)
    result))

(defn- import-ok!
  "[[import-at!]], asserting the import succeeded and showing its message when it did not."
  [src version & {:as opts}]
  (let [result (import-at! src version opts)]
    (is (= :success (:status result)) (:message result))
    result))

(defn- export!
  "Export to `mock` under a fresh task, complete it, and return the result."
  [mock & {:keys [force?] :or {force? false}}]
  (t2/delete! :model/RemoteSyncTask)
  (let [task   (new-task! "export")
        result (impl/export! (source.p/snapshot mock) task "export" :force? force?)]
    (impl/handle-task-result! result task)
    result))

(defn- upload!
  "Upload `files` as a new plugin through the API, expecting `status`."
  [status files]
  (mt/user-http-request :crowberto :post status "ee/custom-viz-plugin/"
                        {:request-options {:headers {"content-type" "multipart/form-data"}}}
                        {:file (cv.tu/make-tgz-bytes files)}))

(defn- export-ok!
  "[[export!]], asserting the export succeeded and showing its message when it did not."
  [mock & {:as opts}]
  (let [result (export! mock opts)]
    (is (= :success (:status result)) (:message result))
    result))

(defmacro ^:private with-plugin-sync [& body]
  `(search.tu/with-index-disabled
     (mt/with-premium-features #{:custom-viz}
       (mt/with-temporary-setting-values [remote-sync-type :read-write remote-sync-enabled true remote-sync-transforms false
                                          csp-img-enabled true custom-viz-enabled true]
         (mt/with-model-cleanup [:model/CustomVizPlugin]
           ~@body)))))

(deftest pull-imports-updates-and-prunes-plugins-test
  (with-plugin-sync
    (let [src (test-helpers/versioned-source :trees {"v0" (plugin-tree "thumbs" "v1();")
                                                     "v1" (plugin-tree "thumbs" "v2();")
                                                     "v1-renamed" (plugin-tree "Thumbs2" "v2();" :entity-id (entity-id "thumbs"))
                                                     "v2" {"README.md" "x"}}
                                             :current "v0")]
      (testing "a pull registers the plugin from its files, under the repo's entity_id, text intact"
        (import-ok! src "v0" :force? true)
        (is (=? {:status :active :enabled true :display_name "thumbs" :icon "icon.svg" :entity_id (entity-id "thumbs")}
                (t2/select-one :model/CustomVizPlugin :identifier "thumbs")))
        (is (= (plugin-files "thumbs" "v1();") (stored-files "thumbs")))
        (is (= "synced" (t2/select-one-fn :status :model/RemoteSyncObject :model_type "CustomVizPlugin"))))
      (testing "a changed bundle file updates the plugin in place"
        (let [id (t2/select-one-pk :model/CustomVizPlugin :identifier "thumbs")]
          (import-ok! src "v1")
          (is (= id (t2/select-one-pk :model/CustomVizPlugin :identifier "thumbs")))
          (is (= "v2();" (get (stored-files "thumbs") "dist/index.js")))))
      (testing "a renamed directory, manifest and identifier under the same entity_id rename the plugin in place"
        (let [id (t2/select-one-pk :model/CustomVizPlugin :identifier "thumbs")]
          (import-ok! src "v1-renamed")
          (is (=? {:id id :identifier "Thumbs2" :display_name "Thumbs2" :status :active}
                  (t2/select-one :model/CustomVizPlugin :entity_id (entity-id "thumbs"))))
          (is (= "Thumbs2" (t2/select-one-fn :model_name :model/RemoteSyncObject :model_type "CustomVizPlugin" :model_id id)))))
      (testing "a plugin whose directory is gone is deleted"
        (import-ok! src "v2")
        (is (not (t2/exists? :model/CustomVizPlugin :entity_id (entity-id "thumbs"))))
        (is (not (t2/exists? :model/RemoteSyncObject :model_type "CustomVizPlugin")))))))

(deftest pull-leaves-enabled-to-the-instance-test
  (with-plugin-sync
    (let [src (test-helpers/versioned-source :trees {"v0" (plugin-tree "thumbs" "v1();")
                                                     "v1" (plugin-tree "thumbs" "v2();")}
                                             :current "v0")]
      (import-ok! src "v0" :force? true)
      (let [id (t2/select-one-pk :model/CustomVizPlugin :identifier "thumbs")]
        (mt/user-http-request :crowberto :put 200 (str "ee/custom-viz-plugin/" id) {:enabled false})
        (import-ok! src "v1")
        (is (false? (t2/select-one-fn :enabled :model/CustomVizPlugin :id id)))))))

(deftest pull-refuses-to-delete-an-unpushed-plugin-test
  (testing "a pull whose repo lacks a plugin uploaded here but not pushed yet is a conflict, not a silent delete"
    (with-plugin-sync
      (let [tree (plugin-tree "thumbs" "v1();")
            src  (test-helpers/versioned-source :trees {"v0" tree "v1" (assoc tree "README.md" "x")} :current "v0")]
        (import-ok! src "v0" :force? true)
        (upload! 200 (plugin-files "ops" "ops();"))
        (is (=? {:status :conflict} (import-at! src "v1")))
        (is (t2/exists? :model/CustomVizPlugin :identifier "ops"))))))

(deftest pull-refuses-a-plugin-whose-identifier-is-taken-test
  (testing "a plugin uploaded here holds its identifier under another entity_id: the pull fails saying what to do"
    (with-plugin-sync
      (let [src (test-helpers/versioned-source :trees {"v0" (plugin-tree "thumbs" "v1();")} :current "v0")]
        (upload! 200 (plugin-files "thumbs" "local();"))
        (let [{:keys [id entity_id]} (t2/select-one :model/CustomVizPlugin :identifier "thumbs")
              ledger (t2/select :model/RemoteSyncObject :model_type "CustomVizPlugin")]
          (is (=? {:status  :error
                   :message #"(?s).*A custom viz plugin \"thumbs\" already exists on this instance\. Delete it and pull again.*"}
                  (import-at! src "v0" :force? true)))
          (testing "the local plugin and the ledger are untouched"
            (is (= [id entity_id "local();"]
                   [(t2/select-one-pk :model/CustomVizPlugin :identifier "thumbs")
                    (t2/select-one-fn :entity_id :model/CustomVizPlugin :identifier "thumbs")
                    (get (stored-files "thumbs") "dist/index.js")]))
            (is (= ledger (t2/select :model/RemoteSyncObject :model_type "CustomVizPlugin"))))
          (testing "once the local plugin is deleted, the pull lands the repo's"
            (mt/user-http-request :crowberto :delete 204 (str "ee/custom-viz-plugin/" id))
            (import-ok! src "v0" :force? true)
            (is (=? {:entity_id (entity-id "thumbs") :status :active}
                    (t2/select-one :model/CustomVizPlugin :identifier "thumbs")))
            (is (= "v1();" (get (stored-files "thumbs") "dist/index.js")))))))))

(deftest export-writes-and-removes-plugin-files-test
  (with-plugin-sync
    (let [mock (test-helpers/create-mock-source :initial-files {"main" {}})
          repo #(get @(:files-atom mock) "main")]
      (mt/with-temp [:model/Collection _ {:name "Synced" :is_remote_synced true :location "/"}]
        (upload! 200 (plugin-files "thumbs" "v1();"))
        (testing "an uploaded plugin is exported as its YAML and the files of its bundle, text intact"
          (is (=? {:status :success :outcome {:kind "pushed"}} (export! mock)))
          (is (= #{"custom_viz_plugins/thumbs/custom_viz_plugin.yaml"
                   "custom_viz_plugins/thumbs/metabase-plugin.json"
                   "custom_viz_plugins/thumbs/dist/index.js"
                   "custom_viz_plugins/thumbs/dist/assets/icon.svg"}
                 (plugin-files-in (repo))))
          (is (= icon-svg (get (repo) "custom_viz_plugins/thumbs/dist/assets/icon.svg")))
          (is (= "synced" (t2/select-one-fn :status :model/RemoteSyncObject :model_type "CustomVizPlugin"))))
        (testing "a replaced bundle is exported"
          (let [id (t2/select-one-pk :model/CustomVizPlugin :identifier "thumbs")]
            (mt/user-http-request :crowberto :put 200 (str "ee/custom-viz-plugin/" id "/bundle")
                                  {:request-options {:headers {"content-type" "multipart/form-data"}}}
                                  {:file (cv.tu/make-tgz-bytes (plugin-files "thumbs" "v2();"))})
            (is (=? {:status :success :outcome {:kind "pushed"}} (export! mock)))
            (is (= "v2();" (get (repo) "custom_viz_plugins/thumbs/dist/index.js")))))
        (testing "a deleted plugin's files are removed from the repo, and the other plugins' files stay"
          (upload! 200 (plugin-files "ops" "ops();"))
          (mt/user-http-request :crowberto :delete 204
                                (str "ee/custom-viz-plugin/" (t2/select-one-pk :model/CustomVizPlugin :identifier "thumbs")))
          (is (=? {:status :success :outcome {:kind "pushed"}} (export! mock)))
          (is (= #{"custom_viz_plugins/ops/custom_viz_plugin.yaml"
                   "custom_viz_plugins/ops/metabase-plugin.json"
                   "custom_viz_plugins/ops/dist/index.js"
                   "custom_viz_plugins/ops/dist/assets/icon.svg"}
                 (plugin-files-in (repo)))))))))

(deftest export-keeps-files-serialization-does-not-own-test
  (testing "an export rewrites a plugin's YAML and bundle files but leaves the plugin's source next to them alone"
    (with-plugin-sync
      (let [source {"custom_viz_plugins/thumbs/src/index.tsx"  "export default null;"
                    "custom_viz_plugins/thumbs/package.json"   "{}"
                    "custom_viz_plugins/thumbs/deploy/k8s.yaml" "a: 1\n---\nb: [unterminated\n"
                    "custom_viz_plugins/README.md"             "# plugins"}
            mock   (test-helpers/create-mock-source :initial-files {"main" (merge (plugin-tree "thumbs" "v1();") source)})
            repo   #(get @(:files-atom mock) "main")]
        (mt/with-temp [:model/Collection _ {:name "Synced" :is_remote_synced true :location "/"}]
          (import-ok! mock "main" :force? true)
          (let [id (t2/select-one-pk :model/CustomVizPlugin :identifier "thumbs")]
            (mt/user-http-request :crowberto :put 200 (str "ee/custom-viz-plugin/" id "/bundle")
                                  {:request-options {:headers {"content-type" "multipart/form-data"}}}
                                  {:file (cv.tu/make-tgz-bytes (plugin-files "thumbs" "v2();"))}))
          (export-ok! mock :force? true)
          (is (= "v2();" (get (repo) "custom_viz_plugins/thumbs/dist/index.js")))
          (is (= source (select-keys (repo) (keys source))))
          (testing "deleting the plugin removes only the files serialization owns"
            (upload! 200 (plugin-files "ops" "ops();"))
            (mt/user-http-request :crowberto :delete 204
                                  (str "ee/custom-viz-plugin/" (t2/select-one-pk :model/CustomVizPlugin :identifier "thumbs")))
            (export-ok! mock)
            (is (= (into #{"custom_viz_plugins/ops/custom_viz_plugin.yaml"
                           "custom_viz_plugins/ops/metabase-plugin.json"
                           "custom_viz_plugins/ops/dist/index.js"
                           "custom_viz_plugins/ops/dist/assets/icon.svg"}
                         (keys source))
                   (plugin-files-in (repo))))))))))

(defn- register-dev-plugin!
  "Register a dev-only plugin `identifier` through the API, with the dev server stubbed out."
  [identifier]
  (mt/with-dynamic-fn-redefs [custom-viz.settings/custom-viz-plugin-dev-mode-enabled (constantly true)
                              cache/fetch-dev-manifest                                (constantly {:name identifier})
                              cache/set-or-clear-dev-bundle!                          (constantly nil)]
    (mt/user-http-request :crowberto :post 200 "ee/custom-viz-plugin/dev"
                          {:identifier identifier :dev_bundle_url "http://localhost:5173"})))

(deftest dev-only-plugins-are-not-synced-test
  (testing "a dev-only plugin is this instance's: never tracked, never exported, and not removed by a pull"
    (with-plugin-sync
      (mt/with-temp [:model/Collection _ {:name "Synced" :is_remote_synced true :location "/"}]
        (let [mock (test-helpers/create-mock-source :initial-files {"main" (plugin-tree "thumbs" "v1();")})
              repo #(get @(:files-atom mock) "main")]
          (import-ok! mock "main" :force? true)
          (let [{dev-id :id} (register-dev-plugin! "dev-only")]
            (is (not (t2/exists? :model/RemoteSyncObject :model_type "CustomVizPlugin" :model_id dev-id)))
            (export-ok! mock :force? true)
            (is (not-any? #(re-find #"^custom_viz_plugins/dev_only/" %) (keys (repo))))
            (import-ok! mock "main")
            (is (t2/exists? :model/CustomVizPlugin :id dev-id))))))))

(deftest read-only-instance-refuses-plugin-changes-test
  (testing "with remote sync read-only, bundled plugins come from the repository and cannot be changed here"
    (with-plugin-sync
      (let [mock (test-helpers/create-mock-source :initial-files {"main" (plugin-tree "thumbs" "v1();")})]
        (import-ok! mock "main" :force? true)
        (let [id (t2/select-one-pk :model/CustomVizPlugin :identifier "thumbs")]
          (mt/with-temporary-setting-values [remote-sync-type :read-only remote-sync-url "https://example.com/repo.git"]
            (upload! 403 (plugin-files "ops" "ops();"))
            (mt/user-http-request :crowberto :put 403 (str "ee/custom-viz-plugin/" id "/bundle")
                                  {:request-options {:headers {"content-type" "multipart/form-data"}}}
                                  {:file (cv.tu/make-tgz-bytes (plugin-files "thumbs" "v2();"))})
            (mt/user-http-request :crowberto :delete 403 (str "ee/custom-viz-plugin/" id))
            (testing "whether a plugin is enabled is still this instance's choice"
              (is (false? (:enabled (mt/user-http-request :crowberto :put 200 (str "ee/custom-viz-plugin/" id) {:enabled false})))))
            (testing "dev-only plugins are never synced, so they stay editable"
              (let [{dev-id :id} (register-dev-plugin! "dev-only")]
                (mt/user-http-request :crowberto :delete 204 (str "ee/custom-viz-plugin/" dev-id))))))))))
