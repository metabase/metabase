(ns metabase-enterprise.remote-sync.custom-viz-plugins-test
  "Custom viz plugins are serdes entities: remote sync pulls and pushes them like data apps, with each plugin's
   bundle unpacked beside its `custom_viz_plugin.yaml` under `custom_viz_plugins/<slug>/`."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.custom-viz-plugin.cache :as cache]
   [metabase-enterprise.custom-viz-plugin.settings :as custom-viz.settings]
   [metabase-enterprise.custom-viz-plugin.test-util :as cv.tu]
   [metabase-enterprise.remote-sync.test-util :as remote-sync.tu]
   [metabase-enterprise.serialization.core :as ee.serialization]
   [metabase.test :as mt]
   [metabase.util.json :as json]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- plugin-files [identifier js]
  {"metabase-plugin.json" (json/encode {:name identifier :icon "icon.svg" :metabase {:version ">=1.60"}})
   "dist/index.js"        js
   "dist/assets/icon.svg" "<svg xmlns=\"http://www.w3.org/2000/svg\"/>"})

(defn- repo-paths
  "The paths plugin `identifier`'s files have in a repository."
  [identifier]
  (into #{(str "custom_viz_plugins/" identifier "/custom_viz_plugin.yaml")}
        (map #(str "custom_viz_plugins/" identifier "/" %))
        (keys (plugin-files identifier ""))))

(defn- entity-id
  "A stable entity_id for plugin `identifier`: the identifier padded to the 21 characters of a NanoID."
  [identifier]
  (subs (str identifier "000000000000000000000") 0 21))

(defn- plugin-tree
  "Repository files for plugin `identifier`: its YAML, as an export writes it so that a pulled plugin counts as
  unchanged, and the files of its bundle."
  [identifier js & {:keys [entity-id] :or {entity-id (entity-id identifier)}}]
  (let [dir   (str "custom_viz_plugins/" identifier "/")
        files (plugin-files identifier js)]
    (into {(str dir "custom_viz_plugin.yaml")
           (ee.serialization/entity-yaml {:serdes/meta [{:model "CustomVizPlugin"}]
                                          :entity_id   entity-id
                                          :identifier  identifier
                                          :files       (vec (sort (keys files)))})}
          (map (fn [[path content]] [(str dir path) content]))
          files)))

(defn- removed
  "The commit removing the files of `tree`."
  [tree]
  (update-vals tree (constantly nil)))

(defn- plugin-id [identifier]
  (t2/select-one-pk :model/CustomVizPlugin :identifier identifier))

(defn- stored-js [identifier]
  (-> (t2/select-one-fn :bundle [:model/CustomVizPlugin :bundle] :identifier identifier)
      cache/bundle->files
      (get "dist/index.js")
      (String. "UTF-8")))

(defn- pull-ok! [url base-version]
  (let [result (remote-sync.tu/pull! url base-version)]
    (is (=? {:status :success} result))
    (:version result)))

(defn- push-ok! [url base-version]
  (let [result (remote-sync.tu/push! url base-version)]
    (is (=? {:status :success} result))
    (:version result)))

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

(defn- do-with-plugin-sync!
  "Calls `f` with the `file://` URL of a new repository, with custom visualizations on and remote sync syncing with
  its `main` in `sync-type` mode."
  [sync-type f]
  (mt/with-premium-features #{:custom-viz}
    (mt/with-temporary-setting-values [csp-img-enabled true custom-viz-enabled true]
      (mt/with-model-cleanup [:model/CustomVizPlugin]
        (remote-sync.tu/with-repository [url]
          (remote-sync.tu/with-remote-sync [url sync-type]
            (f url)))))))

(defmacro ^:private with-plugin-sync
  "Runs `body` with `url` bound to the repository remote sync syncs with (see [[do-with-plugin-sync!]])."
  [[url sync-type] & body]
  `(do-with-plugin-sync! ~sync-type (fn [~url] ~@body)))

(deftest pull-imports-updates-renames-and-removes-plugins-test
  (with-plugin-sync [url :read-write]
    (let [v0 (remote-sync.tu/commit! url "main" (plugin-tree "thumbs" "v1();"))]
      (testing "a pull registers the plugin under the repository's entity_id"
        (pull-ok! url nil)
        (is (=? {:status :active :enabled true :entity_id (entity-id "thumbs")}
                (t2/select-one :model/CustomVizPlugin :identifier "thumbs"))))
      (let [id (plugin-id "thumbs")]
        (testing "a changed bundle updates the plugin in place, leaving `enabled` to the instance"
          (mt/user-http-request :crowberto :put 200 (str "ee/custom-viz-plugin/" id) {:enabled false})
          (let [v1 (remote-sync.tu/commit! url "main" (plugin-tree "thumbs" "v2();"))]
            (pull-ok! url v0)
            (is (=? {:id id :enabled false} (t2/select-one :model/CustomVizPlugin :identifier "thumbs")))
            (is (= "v2();" (stored-js "thumbs")))
            (testing "a new identifier under the same entity_id renames the plugin in place"
              (let [v2 (remote-sync.tu/commit! url "main" (merge (removed (plugin-tree "thumbs" "v2();"))
                                                                 (plugin-tree "Thumbs2" "v2();" :entity-id (entity-id "thumbs"))))]
                (pull-ok! url v1)
                (is (= id (plugin-id "Thumbs2")))
                (testing "a plugin whose directory is gone is deleted"
                  (remote-sync.tu/commit! url "main" (removed (plugin-tree "Thumbs2" "v2();")))
                  (pull-ok! url v2)
                  (is (not (t2/exists? :model/CustomVizPlugin :id id))))))))))))

(deftest pull-refuses-a-plugin-whose-identifier-is-taken-test
  (with-plugin-sync [url :read-write]
    (remote-sync.tu/commit! url "main" (plugin-tree "thumbs" "v1();"))
    (upload! 200 (plugin-files "thumbs" "local();"))
    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Failed to load"
                          (remote-sync.tu/pull! url nil {:force? true})))
    (is (= "local();" (stored-js "thumbs")))
    (testing "once the local plugin is deleted, the pull lands the repository's"
      (delete-plugin! 204 (plugin-id "thumbs"))
      (pull-ok! url nil)
      (is (= "v1();" (stored-js "thumbs"))))))

(deftest push-writes-and-removes-only-plugin-files-test
  (with-plugin-sync [url :read-write]
    (let [unowned {"custom_viz_plugins/thumbs/src/index.tsx" "export default null;"
                   "custom_viz_plugins/README.md"            "# plugins"}
          v0      (remote-sync.tu/commit! url "main" unowned)
          paths   #(set (filter (partial re-find #"^custom_viz_plugins/") (remote-sync.tu/files! url "main")))]
      (upload! 200 (plugin-files "thumbs" "v1();"))
      (testing "an uploaded plugin is a change to push, named by its identifier"
        (is (=? [{:key [:model/CustomVizPlugin (t2/select-one-fn :entity_id :model/CustomVizPlugin :identifier "thumbs")]
                  :status "create"}]
                (remote-sync.tu/local-changes! url v0))))
      (testing "a push writes the plugin's YAML and bundle files, beside the files it does not own"
        (let [v1 (push-ok! url v0)]
          (is (= (into (repo-paths "thumbs") (keys unowned)) (paths)))
          (testing "a replaced bundle is pushed"
            (replace-bundle! 200 (plugin-id "thumbs") (plugin-files "thumbs" "v2();"))
            (let [v2 (push-ok! url v1)]
              (is (= "v2();" (remote-sync.tu/read-file! url "main" "custom_viz_plugins/thumbs/dist/index.js")))
              (testing "a deleted plugin's files are removed; other plugins' and unowned files stay"
                (upload! 200 (plugin-files "ops" "ops();"))
                (delete-plugin! 204 (plugin-id "thumbs"))
                (push-ok! url v2)
                (is (= (into (repo-paths "ops") (keys unowned)) (paths)))))))))))

(deftest dev-only-plugins-are-not-synced-test
  (with-plugin-sync [url :read-write]
    (let [v0 (remote-sync.tu/commit! url "main" (plugin-tree "thumbs" "v1();"))]
      (pull-ok! url nil)
      (let [{dev-id :id} (register-dev-plugin! "dev-only")]
        (is (empty? (remote-sync.tu/local-changes! url v0)))
        (push-ok! url v0)
        (is (not-any? #(re-find #"dev_only" %) (remote-sync.tu/files! url "main")))
        (pull-ok! url v0)
        (is (t2/exists? :model/CustomVizPlugin :id dev-id))))))

(deftest read-only-instance-refuses-plugin-changes-test
  (with-plugin-sync [url :read-only]
    (remote-sync.tu/commit! url "main" (plugin-tree "thumbs" "v1();"))
    (pull-ok! url nil)
    (let [id (plugin-id "thumbs")]
      (upload! 403 (plugin-files "ops" "ops();"))
      (replace-bundle! 403 id (plugin-files "thumbs" "v2();"))
      (delete-plugin! 403 id)
      (testing "`enabled` and dev-only plugins stay this instance's"
        (is (false? (:enabled (mt/user-http-request :crowberto :put 200 (str "ee/custom-viz-plugin/" id) {:enabled false}))))
        (delete-plugin! 204 (:id (register-dev-plugin! "dev-only")))))))
