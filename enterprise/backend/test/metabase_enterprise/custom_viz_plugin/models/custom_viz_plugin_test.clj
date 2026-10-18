(ns metabase-enterprise.custom-viz-plugin.models.custom-viz-plugin-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.custom-viz-plugin.cache :as cache]
   [metabase-enterprise.custom-viz-plugin.test-util :as cv.tu]
   [metabase-enterprise.serialization.v2.ingest :as ingest]
   [metabase-enterprise.serialization.v2.storage.util :as storage.util]
   [metabase.api.common :as api]
   [metabase.models.interface :as mi]
   [metabase.models.serialization :as serdes]
   [metabase.test :as mt]
   [metabase.util.json :as json]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(deftest dot-path-bundle-round-trip-test
  (let [identifier "dot-path-viz"
        files      {"metabase-plugin.json" (.getBytes ^String (json/encode {:name identifier :icon "./icon.png"}) "UTF-8")
                    "dist/index.js"        (.getBytes "console.log('hi')" "UTF-8")
                    "dist/assets/icon.png" (byte-array [0 (int 0x80) (int 0xff)])}
        bundle     (cv.tu/make-tgz-bytes (map (fn [[path content]] [(str "./" path) content]) files))
        export     (get-in (serdes/make-spec "CustomVizPlugin" {}) [:transform :bundle :export])]
    (is (some? (cache/validate-bundle! bundle)))
    (let [exported (export bundle)]
      (is (= (update-vals files seq) (when (map? exported) (update-vals exported seq))))
      (when (map? exported)
        (let [ingested (ingest/read-resources
                        {:serdes/meta [{:model "CustomVizPlugin" :id identifier}]
                         :identifier identifier :enabled true}
                        identifier
                        (fn [path] (when-let [^bytes content (get exported path)] (String. content "UTF-8")))
                        exported)]
          (is (= (set (keys files)) (set (keys (:serdes/resources ingested)))))
          (mt/with-temp [:model/CustomVizPlugin {id :id :as plugin} {:identifier   identifier
                                                                     :display_name identifier
                                                                     :status       :active
                                                                     :bundle       bundle}]
            (serdes/load-one! ingested plugin)
            (is (= :active (t2/select-one-fn :status :model/CustomVizPlugin :id id)))
            (is (= (update-vals files seq)
                   (update-vals (cache/bundle->files (t2/select-one-fn :bundle :model/CustomVizPlugin :id id)) seq)))))))))

(deftest table-name-test
  (is (= :custom_viz_plugin (t2/table-name :model/CustomVizPlugin))))

(deftest timestamped-test
  (testing "CustomVizPlugin gets auto-populated timestamps"
    (mt/with-temp [:model/CustomVizPlugin {id :id} {:identifier   "ts-test"
                                                    :display_name "ts-test"
                                                    :status       :active}]
      (let [plugin (t2/select-one :model/CustomVizPlugin :id id)]
        (is (some? (:created_at plugin)))
        (is (some? (:updated_at plugin)))))))

(deftest permissions-test
  (testing "read is available to any authenticated user"
    (mt/with-temp [:model/CustomVizPlugin {id :id} {:identifier   "perm-test"
                                                    :display_name "perm-test"
                                                    :status       :active}]
      (let [plugin (t2/select-one :model/CustomVizPlugin :id id)]
        (binding [api/*current-user-id* (mt/user->id :rasta)]
          (is (true? (mi/can-read? plugin))))
        (binding [api/*current-user-id* nil]
          (is (false? (mi/can-read? plugin)))))))
  (testing "write requires superuser"
    (mt/with-temp [:model/CustomVizPlugin {id :id} {:identifier   "perm-test-2"
                                                    :display_name "perm-test-2"
                                                    :status       :active}]
      (let [plugin (t2/select-one :model/CustomVizPlugin :id id)]
        (binding [api/*is-superuser?* true]
          (is (true? (mi/can-write? plugin))))
        (binding [api/*is-superuser?* false]
          (is (false? (mi/can-write? plugin)))))))
  (testing "create requires superuser"
    (binding [api/*is-superuser?* true]
      (is (true? (mi/can-create? :model/CustomVizPlugin {}))))
    (binding [api/*is-superuser?* false]
      (is (false? (mi/can-create? :model/CustomVizPlugin {}))))))

(deftest to-json-strips-bundle-test
  (testing "JSON serialization never includes the raw bundle bytes"
    (mt/with-temp [:model/CustomVizPlugin {id :id} {:identifier   "json-test"
                                                    :display_name "json-test"
                                                    :status       :active
                                                    :bundle       (.getBytes "pretend-zip-bytes" "UTF-8")
                                                    :bundle_hash  "feedface"}]
      (let [plugin   (t2/select-one :model/CustomVizPlugin :id id)
            json-str (json/encode plugin)]
        (is (not (re-find #"pretend-zip-bytes" json-str)))))))

(deftest status-keyword-transform-test
  (testing "status is stored as string and returned as keyword"
    (mt/with-temp [:model/CustomVizPlugin {id :id} {:identifier   "status-test"
                                                    :display_name "status-test"
                                                    :status       :active}]
      (is (= :active (:status (t2/select-one :model/CustomVizPlugin :id id))))
      (t2/update! :model/CustomVizPlugin id {:status :error})
      (is (= :error (:status (t2/select-one :model/CustomVizPlugin :id id)))))))

;;; ------------------------------------------------- Serialization --------------------------------------------------

(deftest entity-id-test
  (testing "entity-id is based on identifier"
    (is (= "my-viz"
           (serdes/entity-id "CustomVizPlugin" {:identifier "my-viz" :id 1})))))

(deftest generate-path-test
  (testing "generate-path uses identifier for both id and label"
    (is (= [{:model "CustomVizPlugin" :id "my-viz" :label "my-viz"}]
           (serdes/generate-path "CustomVizPlugin" {:identifier "my-viz"})))))

(deftest storage-path-test
  (testing "storage-path is the identifier's own directory under custom_viz_plugins, holding custom_viz_plugin.yaml"
    (let [entity {:identifier  "My-Viz"
                  :serdes/meta [{:model "CustomVizPlugin" :id "My-Viz" :label "My-Viz"}]}]
      (is (= [{:label "custom_viz_plugins"}
              {:label "My-Viz" :key "My-Viz" :style :slug}
              {:label "custom_viz_plugin"}]
             (serdes/storage-path entity nil)))
      (testing "the directory keeps the identifier verbatim, since import checks it against the identifier"
        (is (= "custom_viz_plugins/My-Viz/custom_viz_plugin.yaml"
               (storage.util/entity-file-path (serdes/storage-base-context) entity)))))))

(deftest load-find-local-test
  (testing "load-find-local finds plugin by identifier"
    (mt/with-temp [:model/CustomVizPlugin {id :id} {:identifier   "find-local"
                                                    :display_name "find-local"
                                                    :status       :active}]
      (let [found (serdes/load-find-local [{:model "CustomVizPlugin" :id "find-local"}])]
        (is (some? found))
        (is (= id (:id found)))))))

(deftest make-spec-test
  (testing "the file holds only what the bundle can't derive; the bundle itself is unpacked into resource files"
    (let [spec (serdes/make-spec "CustomVizPlugin" {})]
      (is (= #{:identifier :enabled} (set (:copy spec))))
      (is (= #{:display_name :icon :manifest :metabase_version :bundle_hash :status :error_message :dev_bundle_url}
             (set (:skip spec))))
      (is (nil? (:defaults spec)) "enabled is always written, so absent can mean false")
      (is (= :serdes/resources (get-in spec [:transform :bundle :as])))))
  (testing "the bundle exports as its files and imports back as an archive of them"
    (let [spec     (serdes/make-spec "CustomVizPlugin" {})
          export   (get-in spec [:transform :bundle :export])
          import   (get-in spec [:transform :bundle :import])
          manifest (json/encode {:name "my-viz" :icon "icon.svg"})
          files    {"metabase-plugin.json" (.getBytes ^String manifest "UTF-8")
                    "dist/index.js"        (.getBytes "console.log('hi')" "UTF-8")
                    "dist/assets/icon.svg" (byte-array [0 (int 0x80) (int 0xff)])}
          bundle   (cv.tu/make-tgz-bytes files)]
      (is (= (update-vals files seq) (update-vals (export bundle) seq)))
      (is (= (update-vals files seq) (update-vals (cache/bundle->files (import files)) seq)))
      (is (= ::serdes/skip (export nil)))
      (is (= ::serdes/skip (export (.getBytes "not a tgz" "UTF-8"))) "a stored archive that can't be read is left out")
      (testing "a file that isn't there is left out of the archive"
        (is (= {"dist/index.js" (seq (get files "dist/index.js"))}
               (update-vals (cache/bundle->files (import (assoc files "metabase-plugin.json" nil "dist/assets/icon.svg" nil)))
                            seq))))
      (testing "the same files always pack to the same bytes, so the hash is stable across imports"
        (is (= (seq (import files)) (seq (import files)))))))
  (testing "the resource files are the manifest, the JavaScript, and the icon the manifest names, read as bytes"
    (let [ingested  {:serdes/meta [{:model "CustomVizPlugin" :id "my-viz"}]}
          read-text (fn [path]
                      (when (= path "metabase-plugin.json")
                        (json/encode {:name "my-viz" :icon "icon.svg"})))]
      (is (= ["metabase-plugin.json" "dist/index.js" "dist/assets/icon.svg"]
             (serdes/resource-paths ingested read-text)))
      (is (true? (serdes/binary-resources? ingested))))
    (testing "an icon the instance would not serve is not a resource"
      (doseq [icon ["../x" "icon.exe"]]
        (is (= ["metabase-plugin.json" "dist/index.js"]
               (serdes/resource-paths {:serdes/meta [{:model "CustomVizPlugin" :id "my-viz"}]}
                                      (constantly (json/encode {:name "my-viz" :icon icon}))))
            icon)))
    (testing "without a readable manifest, the fixed files"
      (is (= ["metabase-plugin.json" "dist/index.js"]
             (serdes/resource-paths {:serdes/meta [{:model "CustomVizPlugin" :id "my-viz"}]} (constantly nil))))
      (is (= ["metabase-plugin.json" "dist/index.js"]
             (serdes/resource-paths {:serdes/meta [{:model "CustomVizPlugin" :id "my-viz"}]} (constantly "{not json")))))))

(defn- ingested-plugin
  "What serdes ingests for an export of plugin `identifier` whose bundle bytes are `bundle`, read from the directory
  `identifier` unless `extra` says otherwise: the YAML's fields and the bundle's files as resources."
  [identifier ^bytes bundle & {:as extra}]
  (merge {:serdes/meta      [{:model "CustomVizPlugin" :id identifier :label identifier}]
          :serdes/directory identifier
          :serdes/resources (when bundle
                              (try (cache/bundle->files bundle)
                                   ;; not an archive: pass the bytes off as the JavaScript, so the import packs them
                                   (catch Exception _ {"dist/index.js" bundle})))
          :identifier       identifier
          :enabled          true
          :created_at       "2026-01-01T00:00:00Z"}
         extra))

(defn- repacked-hash
  "The `bundle_hash` an import of `bundle`'s files stores: the hash of the archive it packs them back into."
  [^bytes bundle]
  (cv.tu/bundle-hash (cache/files->bundle (cache/bundle->files bundle))))

(defn- active-plugin-row
  "Columns of an active, enabled plugin `identifier` backed by `bundle`, for `mt/with-temp`."
  [identifier ^bytes bundle]
  {:identifier   identifier
   :display_name identifier
   :status       :active
   :enabled      true
   :manifest     {:name identifier}
   :bundle       bundle
   :bundle_hash  (cv.tu/bundle-hash bundle)})

(deftest load-insert-validates-bundle-test
  (testing "loading an exported plugin with a valid bundle makes it :active"
    (mt/with-model-cleanup [:model/CustomVizPlugin]
      (let [bundle (cv.tu/valid-bundle-bytes "imported-viz" {:icon "chart"})]
        (serdes/load-one! (ingested-plugin "imported-viz" bundle) nil)
        (is (=? {:status        :active
                 :error_message nil
                 :enabled       true
                 :bundle_hash   (repacked-hash bundle)}
                (t2/select-one :model/CustomVizPlugin :identifier "imported-viz"))))))
  (testing "loading a plugin whose files have no manifest makes it :error, keeping the files and their hash"
    (mt/with-model-cleanup [:model/CustomVizPlugin]
      (let [script (.getBytes "console.log('hi')" "UTF-8")
            packed (cache/files->bundle {"dist/index.js" script})]
        (serdes/load-one! (ingested-plugin "broken-viz" nil :serdes/resources {"metabase-plugin.json" nil
                                                                               "dist/index.js"        script})
                          nil)
        (is (=? {:status        :error
                 :error_message #(str/includes? % "metabase-plugin.json not found")
                 :display_name  "broken-viz"
                 :bundle_hash   (cv.tu/bundle-hash packed)}
                (t2/select-one :model/CustomVizPlugin :identifier "broken-viz")))
        (is (= (seq packed) (seq (t2/select-one-fn :bundle :model/CustomVizPlugin :identifier "broken-viz")))))))
  (testing "loading a plugin whose directory has none of the files makes it :error"
    (mt/with-model-cleanup [:model/CustomVizPlugin]
      (serdes/load-one! (ingested-plugin "bundleless-viz" nil) nil)
      (is (=? {:status        :error
               :error_message #(str/includes? % "metabase-plugin.json not found")}
              (t2/select-one :model/CustomVizPlugin :identifier "bundleless-viz"))))))

(deftest load-enabled-is-owned-by-the-file-test
  (let [bundle (cv.tu/valid-bundle-bytes "toggled-viz")]
    (testing "a file without `enabled` loads a disabled plugin, whatever the column's default"
      (mt/with-model-cleanup [:model/CustomVizPlugin]
        (serdes/load-one! (dissoc (ingested-plugin "toggled-viz" bundle) :enabled) nil)
        (is (false? (t2/select-one-fn :enabled :model/CustomVizPlugin :identifier "toggled-viz")))))
    (testing "the file's `enabled` replaces what an admin set on this instance"
      (mt/with-temp [:model/CustomVizPlugin {id :id} (assoc (active-plugin-row "toggled-viz" bundle) :enabled false)]
        (serdes/load-one! (ingested-plugin "toggled-viz" bundle :enabled true) (t2/select-one :model/CustomVizPlugin :id id))
        (is (true? (t2/select-one-fn :enabled :model/CustomVizPlugin :id id)))))))

(deftest load-checks-the-directory-name-test
  (testing "a plugin read from a directory not named by its identifier fails the import, naming the directory"
    (mt/with-model-cleanup [:model/CustomVizPlugin]
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"custom_viz_plugins/thumb: .*\"thumbs\""
                            (serdes/load-one! (ingested-plugin "thumbs" (cv.tu/valid-bundle-bytes "thumbs")
                                                               :serdes/directory "thumb")
                                              nil)))
      (is (nil? (t2/select-one :model/CustomVizPlugin :identifier "thumbs")))))
  (testing "an ingested plugin that carries no directory, such as one not read from files, loads"
    (mt/with-model-cleanup [:model/CustomVizPlugin]
      (serdes/load-one! (dissoc (ingested-plugin "thumbs" (cv.tu/valid-bundle-bytes "thumbs")) :serdes/directory) nil)
      (is (= :active (t2/select-one-fn :status :model/CustomVizPlugin :identifier "thumbs"))))))

(deftest load-refuses-an-identifier-differing-only-in-case-test
  (let [bundle (cv.tu/valid-bundle-bytes "Thumbs")]
    (mt/with-temp [:model/CustomVizPlugin _ (active-plugin-row "Thumbs" bundle)]
      (testing "a new plugin whose identifier is an existing one in another case is refused, naming both"
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"\"thumbs\" differs only in case from .*\"Thumbs\""
                              (serdes/load-one! (ingested-plugin "thumbs" (cv.tu/valid-bundle-bytes "thumbs")) nil))))
      (testing "the same plugin updates in place"
        (serdes/load-one! (ingested-plugin "Thumbs" bundle) (t2/select-one :model/CustomVizPlugin :identifier "Thumbs"))
        (is (= 1 (t2/count :model/CustomVizPlugin :identifier "Thumbs")))))))

(deftest load-update-validates-bundle-test
  (testing "re-importing over an existing plugin re-validates the new bundle"
    (let [old-bundle (cv.tu/valid-bundle-bytes "updated-viz")
          new-bundle (cv.tu/valid-bundle-bytes "updated-viz" {:icon "star"})]
      (mt/with-temp [:model/CustomVizPlugin {id :id} (assoc (active-plugin-row "updated-viz" old-bundle)
                                                            :status        :error
                                                            :error_message "stale")]
        (serdes/load-one! (ingested-plugin "updated-viz" new-bundle) (t2/select-one :model/CustomVizPlugin :id id))
        (is (=? {:id            id
                 :status        :active
                 :error_message nil
                 :icon          "star"
                 :bundle_hash   (repacked-hash new-bundle)}
                (t2/select-one :model/CustomVizPlugin :id id)))))))

(deftest load-rejects-bundle-identifier-mismatch-test
  (testing "a bundle whose manifest name differs from the imported identifier lands as :error, never :active"
    (let [ingested (ingested-plugin "calendar-heatmap-viz" (cv.tu/valid-bundle-bytes "thumbs-viz"))]
      (testing "on insert"
        (mt/with-model-cleanup [:model/CustomVizPlugin]
          (serdes/load-one! ingested nil)
          (is (=? {:identifier    "calendar-heatmap-viz"
                   :status        :error
                   :error_message #(str/includes? % "does not match")}
                  (t2/select-one :model/CustomVizPlugin :identifier "calendar-heatmap-viz")))))
      (testing "on update over an active plugin"
        (mt/with-temp [:model/CustomVizPlugin {id :id} (active-plugin-row "calendar-heatmap-viz"
                                                                          (cv.tu/valid-bundle-bytes "calendar-heatmap-viz"))]
          (serdes/load-one! ingested (t2/select-one :model/CustomVizPlugin :id id))
          (is (=? {:id            id
                   :status        :error
                   :error_message #(str/includes? % "does not match")}
                  (t2/select-one :model/CustomVizPlugin :id id))))))))
