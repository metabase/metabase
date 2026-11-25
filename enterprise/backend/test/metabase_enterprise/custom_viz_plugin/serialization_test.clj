(ns metabase-enterprise.custom-viz-plugin.serialization-test
  "A custom viz plugin on disk: `custom_viz_plugins/<slug>/custom_viz_plugin.yaml` with the bundle unpacked beside
  it, laid out as `npx @metabase/custom-viz pack` archives it. Loading single entities is covered in
  `models.custom-viz-plugin-test`; these tests go through the file system."
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.custom-viz-plugin.cache :as cache]
   [metabase-enterprise.custom-viz-plugin.test-util :as cv.tu]
   [metabase-enterprise.serialization.core :as ee.serialization]
   [metabase-enterprise.serialization.test-util :as ts]
   [metabase-enterprise.serialization.v2.protocols :as protocols]
   [metabase-enterprise.serialization.v2.storage.tar :as storage.tar]
   [metabase.serialization.core :as serialization]
   [metabase.test :as mt]
   [metabase.util.compress :as u.compress]
   [metabase.util.json :as json]
   [metabase.util.yaml :as yaml]
   [toucan2.core :as t2])
  (:import
   (java.io ByteArrayOutputStream File)
   (java.nio.file Files)))

(set! *warn-on-reflection* true)

(defn- manifest [identifier]
  {:name identifier :icon "icon.svg" :metabase {:version ">=1.60"}})

(defn- plugin-files
  "Bundle files, as bytes. The icon's text outside ASCII catches a wrong charset."
  [identifier]
  {"metabase-plugin.json" (.getBytes ^String (json/encode (manifest identifier)) "UTF-8")
   "dist/index.js"        (.getBytes "{}" "UTF-8")
   "dist/assets/icon.svg" (.getBytes "<svg xmlns=\"http://www.w3.org/2000/svg\"><title>Thumbs up – 👍</title></svg>" "UTF-8")})

(defn- insert-plugin! [identifier ^bytes bundle & {:as extra}]
  (t2/insert-returning-instance! :model/CustomVizPlugin
                                 (merge {:identifier   identifier
                                         :display_name identifier
                                         :status       :active
                                         :enabled      true
                                         :manifest     {:name identifier}
                                         :bundle       bundle
                                         :bundle_hash  (cv.tu/bundle-hash bundle)}
                                        extra)))

(defn- exported-plugins
  "The exported entities of the plugins a full export takes."
  []
  (serialization/export :model/CustomVizPlugin (ee.serialization/select-rows :model/CustomVizPlugin {})))

(defn- export! [dir]
  (ee.serialization/store! (exported-plugins) (ee.serialization/file-writer dir)))

(defn- import! [dir]
  (ee.serialization/load-metabase! (ee.serialization/ingest-yaml dir)))

(defn- files-in
  "Relative file paths under `dir` mapped to byte sequences."
  [^File dir]
  (into {}
        (for [^File f (file-seq dir)
              :when (.isFile f)]
          [(str (.relativize (.toPath dir) (.toPath f))) (seq (Files/readAllBytes (.toPath f)))])))

(defn- stored-files
  "The files of the bundle stored for plugin `identifier`, mapped to byte sequences."
  [identifier]
  (update-vals (cache/bundle->files (t2/select-one-fn :bundle :model/CustomVizPlugin :identifier identifier)) seq))

(defn- write-plugin-files!
  "Write a plugin's YAML and its `files` (path -> bytes or string) into `dir` under `custom_viz_plugins`."
  [dump-dir dir yaml-fields files]
  (let [plugin-dir (io/file dump-dir "custom_viz_plugins" dir)]
    (.mkdirs plugin-dir)
    (spit (io/file plugin-dir "custom_viz_plugin.yaml")
          (yaml/generate-string (merge {:serdes/meta [{:model "CustomVizPlugin"}]
                                        :files       (vec (sort (keys (plugin-files "_"))))}
                                       yaml-fields)))
    (doseq [[path content] files
            :let [f (io/file plugin-dir ^String path)]]
      (io/make-parents f)
      (io/copy content f))))

(deftest export-writes-the-yaml-and-the-served-files-test
  (mt/with-model-cleanup [:model/CustomVizPlugin]
    (ts/with-random-dump-dir [dump-dir "custom-viz-export-"]
      (let [files  (plugin-files "Thumbs")
            _      (insert-plugin! "Thumbs" (cv.tu/make-tgz-bytes (assoc files "dist/index.js.map" "{}" "README.md" "x"))
                                   :enabled false)
            dir    (io/file dump-dir "custom_viz_plugins" "thumbs")]
        (export! dump-dir)
        (testing "the YAML declares the files, not this instance's `enabled` state"
          (is (= {:serdes/meta [{:model "CustomVizPlugin"}]
                  :identifier  "Thumbs"
                  :files       (vec (sort (keys files)))}
                 (yaml/from-file (io/file dir "custom_viz_plugin.yaml")))))
        (testing "only the served files are written beside it, byte for byte"
          (is (= (update-vals files seq)
                 (dissoc (files-in dir) "custom_viz_plugin.yaml"))))))))

(deftest export-takes-bundled-plugins-only-test
  (mt/with-model-cleanup [:model/CustomVizPlugin]
    (ts/with-random-dump-dir [dump-dir "custom-viz-export-"]
      (insert-plugin! "exported" (cv.tu/valid-bundle-bytes "exported"))
      (testing "a dev-only plugin has no bundle to export"
        (t2/insert! :model/CustomVizPlugin {:identifier     "dev-only"
                                            :display_name   "dev-only"
                                            :status         :active
                                            :dev_bundle_url "http://localhost:4000/"})
        (export! dump-dir)
        (is (= ["exported"] (vec (.list (io/file dump-dir "custom_viz_plugins"))))))
      (testing "a bundle whose entry paths can't be unpacked, from before upload refused it, fails the export by name"
        (insert-plugin! "unreadable" (cv.tu/make-tgz-bytes (update-keys (plugin-files "unreadable")
                                                                        #(str/replace % "dist/" "dist//"))))
        (let [e (is (thrown? clojure.lang.ExceptionInfo (into [] (exported-plugins))))]
          (is (re-find #"The bundle of custom viz plugin \"unreadable\" can't be unpacked"
                       (ex-message (ex-cause e)))))))))

(deftest export-by-ids-takes-bundled-plugins-only-test
  (mt/with-model-cleanup [:model/CustomVizPlugin]
    (let [{picked :id} (insert-plugin! "picked" (cv.tu/valid-bundle-bytes "picked"))
          _            (insert-plugin! "other" (cv.tu/valid-bundle-bytes "other"))
          dev-only     (t2/insert-returning-pk! :model/CustomVizPlugin {:identifier     "dev-only"
                                                                        :display_name   "dev-only"
                                                                        :status         :active
                                                                        :dev_bundle_url "http://localhost:4000/"})
          selected     (fn [ids]
                         {:rows (into [] (map :identifier) (ee.serialization/select-rows :model/CustomVizPlugin {:ids ids}))
                          :ids  (vec (ee.serialization/select-ids :model/CustomVizPlugin {:ids ids}))})]
      (testing "the ids narrow the plugins with bundles"
        (is (= {:rows ["picked"] :ids [picked]} (selected [picked]))))
      (testing "a dev-only plugin isn't taken even when named"
        (is (= {:rows ["picked"] :ids [picked]} (selected [picked dev-only])))
        (is (= {:rows [] :ids []} (selected [dev-only])))))))

(deftest import-packs-the-declared-files-test
  (mt/with-model-cleanup [:model/CustomVizPlugin]
    (ts/with-random-dump-dir [dump-dir "custom-viz-import-"]
      (let [files (plugin-files "thumbs")]
        ;; the identifier comes from the YAML, whatever the directory is called
        (write-plugin-files! dump-dir "my thumbs plugin" {:identifier "thumbs"}
                             (assoc files
                                    "deploy/config.yaml" "a: [unterminated"
                                    "dist/assets/unused.svg" "ignored"))
        (import! dump-dir)
        (testing "metadata is derived from the manifest"
          (is (=? {:status           :active
                   :enabled          true
                   :display_name     "thumbs"
                   :icon             "icon.svg"
                   :metabase_version ">=1.60"
                   :manifest         (manifest "thumbs")
                   :bundle_hash      (cv.tu/bundle-hash (cache/files->bundle files))}
                  (t2/select-one :model/CustomVizPlugin :identifier "thumbs"))))
        (testing "only declared files are packed, byte for byte"
          (is (= (update-vals files seq) (stored-files "thumbs"))))))))

(deftest import-with-missing-files-replaces-an-active-plugins-bundle-test
  (mt/with-model-cleanup [:model/CustomVizPlugin]
    (ts/with-random-dump-dir [dump-dir "custom-viz-import-"]
      (let [healthy (cache/files->bundle (plugin-files "thumbs"))
            {:keys [id]} (insert-plugin! "thumbs" healthy :icon "icon.svg" :metabase_version ">=1.60")]
        (write-plugin-files! dump-dir "thumbs" {:identifier "thumbs"} {})
        (import! dump-dir)
        (let [plugin (t2/select-one :model/CustomVizPlugin :id id)]
          (is (=? {:status           :error
                   :error_message    #(re-find #"metabase-plugin.json not found" %)
                   :manifest         nil
                   :icon             nil
                   :metabase_version nil}
                  plugin)
              "what the old manifest derived is cleared with it")
          (is (not= (cv.tu/bundle-hash healthy) (:bundle_hash plugin))))))))

(deftest round-trip-test
  (mt/with-model-cleanup [:model/CustomVizPlugin]
    (ts/with-random-dump-dir [dump-dir "custom-viz-round-trip-"]
      (let [files  (plugin-files "Calendar Heatmap")
            plugin (insert-plugin! "Calendar Heatmap" (cv.tu/make-tgz-bytes files))]
        (export! dump-dir)
        (t2/delete! :model/CustomVizPlugin :id (:id plugin))
        (import! dump-dir)
        (let [imported (t2/select-one :model/CustomVizPlugin :identifier "Calendar Heatmap")]
          (testing "the plugin keeps its files"
            (is (= (update-vals files seq) (stored-files "Calendar Heatmap"))))
          (testing "importing again updates the row in place and settles the hash"
            (import! dump-dir)
            (is (= ((juxt :id :bundle_hash) imported)
                   ((juxt :id :bundle_hash) (t2/select-one :model/CustomVizPlugin :identifier "Calendar Heatmap"))))))))))

(deftest import-over-a-plugin-registered-separately-test
  (testing "two instances that each registered the same plugin hold the same plugin"
    (mt/with-model-cleanup [:model/CustomVizPlugin]
      (ts/with-random-dump-dir [dump-dir "custom-viz-upgrade-"]
        (let [staging-files (assoc (plugin-files "thumbs") "dist/index.js" (.getBytes "export default 2;" "UTF-8"))
              staging       (insert-plugin! "thumbs" (cv.tu/make-tgz-bytes staging-files))]
          (export! dump-dir)
          (t2/delete! :model/CustomVizPlugin :id (:id staging))
          (let [prod (insert-plugin! "thumbs" (cv.tu/make-tgz-bytes (plugin-files "thumbs")))]
            (import! dump-dir)
            (testing "the import updates the plugin with that identifier in place"
              (is (= [(:id prod)] (t2/select-pks-vec :model/CustomVizPlugin :identifier "thumbs")))
              (is (= (update-vals staging-files seq) (stored-files "thumbs"))))))))))

(deftest identifiers-differing-in-surrounding-whitespace-round-trip-test
  (testing "plugins whose identifiers differ only in surrounding whitespace stay two plugins"
    (mt/with-model-cleanup [:model/CustomVizPlugin]
      (ts/with-random-dump-dir [dump-dir "custom-viz-whitespace-"]
        (let [files   (fn [identifier js]
                        (assoc (plugin-files identifier) "dist/index.js" (.getBytes ^String js "UTF-8")))
              v1      {"thumbs" (files "thumbs" "plain();") " thumbs" (files " thumbs" "padded();")}
              plugins (update-vals v1 #(cv.tu/make-tgz-bytes %))
              ids     (into {} (map (fn [[identifier bundle]] [identifier (:id (insert-plugin! identifier bundle))])) plugins)]
          (is (= #{[:model/CustomVizPlugin "thumbs"] [:model/CustomVizPlugin " thumbs"]}
                 (into #{} (map serialization/key-of) (exported-plugins))))
          (export! dump-dir)
          (doseq [[identifier id] ids]
            (t2/update! :model/CustomVizPlugin :id id {:bundle (cv.tu/make-tgz-bytes (files identifier "stale();"))}))
          (import! dump-dir)
          (doseq [[identifier id] ids]
            (testing (pr-str identifier)
              (is (= [id] (t2/select-pks-vec :model/CustomVizPlugin :identifier identifier)))
              (is (= (update-vals (get v1 identifier) seq) (stored-files identifier))))))))))

(deftest tar-export-holds-the-bundles-files-test
  (mt/with-model-cleanup [:model/CustomVizPlugin]
    (let [files  (plugin-files "thumbs")
          out    (ByteArrayOutputStream.)
          prefix "export/custom_viz_plugins/thumbs/"]
      (insert-plugin! "thumbs" (cv.tu/make-tgz-bytes files))
      (let [writer (storage.tar/tar-writer out "export")]
        (ee.serialization/store! (exported-plugins) writer)
        (protocols/finish! writer))
      (is (= (update-vals files seq)
             (-> (u.compress/untgz-files (.toByteArray out))
                 (update-keys #(subs % (count prefix)))
                 (dissoc "custom_viz_plugin.yaml")
                 (update-vals seq)))))))
