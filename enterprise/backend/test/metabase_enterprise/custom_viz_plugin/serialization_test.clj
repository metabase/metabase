(ns metabase-enterprise.custom-viz-plugin.serialization-test
  "A custom viz plugin on disk: `custom_viz_plugins/<identifier>/custom_viz_plugin.yaml` with the bundle unpacked
  beside it, laid out as `npx @metabase/custom-viz pack` archives it."
  (:require
   [clojure.java.io :as io]
   [clojure.test :refer :all]
   [metabase-enterprise.custom-viz-plugin.cache :as cache]
   [metabase-enterprise.custom-viz-plugin.test-util :as cv.tu]
   [metabase-enterprise.serialization.core :as serialization]
   [metabase-enterprise.serialization.test-util :as ts]
   [metabase-enterprise.serialization.v2.protocols :as protocols]
   [metabase-enterprise.serialization.v2.storage.tar :as storage.tar]
   [metabase.models.serialization :as serdes]
   [metabase.test :as mt]
   [metabase.util.compress :as u.compress]
   [metabase.util.json :as json]
   [metabase.util.yaml :as yaml]
   [toucan2.core :as t2])
  (:import
   (java.io ByteArrayOutputStream File)
   (java.nio.file Files)))

(set! *warn-on-reflection* true)

(def ^:private icon-bytes
  "An icon that isn't UTF-8 text, so a byte that doesn't survive a string round trip shows."
  (byte-array [(int 0x89) 0x50 0x4e 0x47 0 (int 0xff)]))

(defn- plugin-files
  "The files `pack` archives for a plugin `identifier` with an icon: the manifest, the JavaScript, and the icon."
  [identifier]
  {"metabase-plugin.json" (.getBytes ^String (json/encode {:name identifier :icon "icon.png" :metabase {:version ">=1.60"}}) "UTF-8")
   "dist/index.js"        (.getBytes "console.log('hi')" "UTF-8")
   "dist/assets/icon.png" icon-bytes})

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

(defn- export! [dir]
  (serialization/store! (serdes/extract-all "CustomVizPlugin" {}) (serialization/file-writer dir)))

(defn- import! [dir]
  (serialization/load-metabase! (serialization/ingest-yaml dir)))

(defn- file-bytes ^bytes [^File f]
  (Files/readAllBytes (.toPath f)))

(defn- files-in
  "The regular files under `dir`, as a map of `/`-separated path relative to `dir` to their bytes as a seq."
  [^File dir]
  (into {}
        (for [^File f (file-seq dir)
              :when (.isFile f)]
          [(str (.relativize (.toPath dir) (.toPath f))) (seq (file-bytes f))])))

(defn- write-plugin-files!
  "Write a serialized plugin with `yaml` fields and the `files` next to it under `custom_viz_plugins/<dir>/`."
  [dump-dir dir yaml-fields files]
  (let [plugin-dir (io/file dump-dir "custom_viz_plugins" dir)]
    (.mkdirs plugin-dir)
    (spit (io/file plugin-dir "custom_viz_plugin.yaml") (yaml/generate-string yaml-fields))
    (doseq [[path content] files
            :let [f (io/file plugin-dir ^String path)]]
      (io/make-parents f)
      (if (bytes? content)
        (io/copy content f)
        (spit f content)))))

(defn- plugin-yaml [identifier & {:as extra}]
  (merge {:serdes/meta [{:model "CustomVizPlugin"}]
          :identifier  identifier
          :enabled     true}
         extra))

(deftest export-writes-the-yaml-and-the-bundles-files-test
  (mt/with-model-cleanup [:model/CustomVizPlugin]
    (ts/with-random-dump-dir [dump-dir "custom-viz-export-"]
      (let [files (plugin-files "Thumbs")]
        (insert-plugin! "Thumbs" (cv.tu/make-tgz-bytes files) :enabled false)
        (export! dump-dir)
        (let [plugin-dir (io/file dump-dir "custom_viz_plugins" "Thumbs")
              yaml-file  (io/file plugin-dir "custom_viz_plugin.yaml")]
          (testing "the YAML is in a directory named by the identifier verbatim, holding only what the bundle can't derive"
            (is (= {:serdes/meta [{:model "CustomVizPlugin"}]
                    :identifier  "Thumbs"
                    :enabled     false}
                   (yaml/from-file yaml-file))
                "`enabled` is written only when false"))
          (testing "the bundle's files are beside it, byte for byte, and nothing else is written"
            (is (= (assoc (update-vals files seq) "custom_viz_plugin.yaml" (seq (file-bytes yaml-file)))
                   (files-in plugin-dir)))))))))

(deftest export-writes-only-the-files-an-import-reads-test
  (mt/with-model-cleanup [:model/CustomVizPlugin]
    (ts/with-random-dump-dir [dump-dir "custom-viz-export-"]
      (let [files (plugin-files "thumbs")]
        (insert-plugin! "thumbs" (cv.tu/make-tgz-bytes (assoc files
                                                              "dist/index.js.map"     "{}"
                                                              "dist/assets/other.png" icon-bytes
                                                              "README.md"             "hand-built")))
        (export! dump-dir)
        (testing "an archive entry the instance never serves is left out, so it can't go stale in the repository"
          (is (= (set (keys files))
                 (disj (set (keys (files-in (io/file dump-dir "custom_viz_plugins" "thumbs")))) "custom_viz_plugin.yaml"))))))))

(deftest export-of-an-unreadable-bundle-writes-the-yaml-alone-test
  (mt/with-model-cleanup [:model/CustomVizPlugin]
    (ts/with-random-dump-dir [dump-dir "custom-viz-export-"]
      (insert-plugin! "garbled" (.getBytes "not an archive" "UTF-8"))
      (mt/with-log-messages-for-level [messages [metabase-enterprise :warn]]
        (export! dump-dir)
        (testing "the YAML is written without files, so the export goes on and the plugin imports as an error"
          (is (= ["custom_viz_plugin.yaml"] (vec (.list (io/file dump-dir "custom_viz_plugins" "garbled"))))))
        (testing "the warning names the plugin"
          (is (some #(re-find #"Not exporting the bundle of custom viz plugin \"garbled\"" (:message %))
                    (messages))))))))

(deftest export-skips-plugins-that-cannot-be-represented-test
  (mt/with-model-cleanup [:model/CustomVizPlugin]
    (ts/with-random-dump-dir [dump-dir "custom-viz-export-"]
      (insert-plugin! "exported" (cv.tu/valid-bundle-bytes "exported"))
      (testing "a dev-only plugin has no bundle to export"
        (t2/insert! :model/CustomVizPlugin {:identifier     "dev-only"
                                            :display_name   "dev-only"
                                            :status         :active
                                            :dev_bundle_url "http://localhost:4000/"}))
      (testing "an identifier that can't name a directory, from before upload refused it, is left out"
        (insert-plugin! "bad identifier" (cv.tu/valid-bundle-bytes "bad identifier")))
      (export! dump-dir)
      (is (= ["exported"] (vec (.list (io/file dump-dir "custom_viz_plugins"))))))))

(deftest export-with-no-plugins-writes-nothing-test
  (mt/with-model-cleanup [:model/CustomVizPlugin]
    (ts/with-random-dump-dir [dump-dir "custom-viz-export-"]
      (t2/delete! :model/CustomVizPlugin)
      (export! dump-dir)
      (is (not (.exists (io/file dump-dir "custom_viz_plugins")))))))

(deftest export-skips-plugins-whose-identifiers-differ-only-in-case-test
  (mt/with-model-cleanup [:model/CustomVizPlugin]
    (ts/with-random-dump-dir [dump-dir "custom-viz-export-"]
      (doseq [identifier ["exported" "Thumbs" "thumbs"]]
        (insert-plugin! identifier (cv.tu/valid-bundle-bytes identifier)))
      (mt/with-log-messages-for-level [messages [metabase-enterprise :warn]]
        (export! dump-dir)
        (testing "neither is written: they would be one directory on a case-insensitive filesystem"
          (is (= ["exported"] (vec (.list (io/file dump-dir "custom_viz_plugins"))))))
        (testing "the log names them"
          (is (some #(re-find #"Not exporting custom viz plugins \"Thumbs\", \"thumbs\": their identifiers differ only in case" (:message %))
                    (messages))))))))

(deftest import-packs-the-files-beside-the-yaml-test
  (mt/with-model-cleanup [:model/CustomVizPlugin]
    (ts/with-random-dump-dir [dump-dir "custom-viz-import-"]
      (let [files (plugin-files "thumbs")]
        (write-plugin-files! dump-dir "thumbs" (plugin-yaml "thumbs") files)
        (import! dump-dir)
        (testing "the plugin is active with everything the manifest derives"
          (is (=? {:status           :active
                   :enabled          true
                   :display_name     "thumbs"
                   :icon             "icon.png"
                   :metabase_version ">=1.60"
                   :manifest         {:name "thumbs" :icon "icon.png" :metabase {:version ">=1.60"}}
                   :bundle_hash      (cv.tu/bundle-hash (cache/files->bundle files))}
                  (t2/select-one :model/CustomVizPlugin :identifier "thumbs"))))
        (testing "the stored bundle is an archive of the files, and serves the icon's bytes"
          (let [plugin (t2/select-one :model/CustomVizPlugin :identifier "thumbs")]
            (is (= (update-vals files seq) (update-vals (cache/bundle->files (:bundle plugin)) seq)))
            (is (= (seq icon-bytes) (seq (cache/get-asset plugin "icon.png"))))))))))

(deftest import-without-a-manifest-makes-an-error-plugin-test
  (mt/with-model-cleanup [:model/CustomVizPlugin]
    (ts/with-random-dump-dir [dump-dir "custom-viz-import-"]
      (write-plugin-files! dump-dir "thumbs" (plugin-yaml "thumbs") {"dist/index.js" "console.log('hi')"})
      (import! dump-dir)
      (is (=? {:status        :error
               :error_message #(re-find #"metabase-plugin.json not found" %)
               :display_name  "thumbs"}
              (t2/select-one :model/CustomVizPlugin :identifier "thumbs"))))))

(deftest import-with-missing-files-replaces-an-active-plugins-bundle-test
  (mt/with-model-cleanup [:model/CustomVizPlugin]
    (ts/with-random-dump-dir [dump-dir "custom-viz-import-"]
      (let [healthy (cache/files->bundle (plugin-files "thumbs"))
            {id :id} (insert-plugin! "thumbs" healthy :icon "icon.png" :metabase_version ">=1.60")]
        (testing "the repository owns the files: a directory holding only the YAML imports as an error plugin"
          (write-plugin-files! dump-dir "thumbs" (plugin-yaml "thumbs") {})
          (import! dump-dir)
          (let [plugin (t2/select-one :model/CustomVizPlugin :id id)]
            (is (=? {:status           :error
                     :error_message    #(re-find #"metabase-plugin.json not found" %)
                     :manifest         nil
                     :icon             nil
                     :metabase_version nil}
                    plugin)
                "what the old manifest derived is cleared with it")
            (is (not= (cv.tu/bundle-hash healthy) (:bundle_hash plugin))
                "the healthy bundle is replaced, not kept")))))))

(deftest import-refuses-a-bundle-over-the-upload-limit-test
  (mt/with-model-cleanup [:model/CustomVizPlugin]
    (ts/with-random-dump-dir [dump-dir "custom-viz-import-"]
      (let [incompressible (doto (byte-array (inc cache/max-bundle-bytes))
                             (->> (.nextBytes (java.util.Random. 1))))]
        (write-plugin-files! dump-dir "big" (plugin-yaml "big")
                             (assoc (plugin-files "big") "dist/index.js" incompressible))
        (import! dump-dir)
        (testing "the plugin is an error row that says why, and the oversized bytes are not stored"
          (is (=? {:status        :error
                   :error_message #(re-find #"Bundle must be less than 5MB" %)
                   :bundle        nil
                   :bundle_hash   nil}
                  (t2/select-one :model/CustomVizPlugin :identifier "big"))))))))

(deftest import-fails-naming-a-directory-not-named-by-its-identifier-test
  (mt/with-model-cleanup [:model/CustomVizPlugin]
    (ts/with-random-dump-dir [dump-dir "custom-viz-import-"]
      (write-plugin-files! dump-dir "thumb" (plugin-yaml "thumbs") (plugin-files "thumbs"))
      (is (= "custom_viz_plugins/thumb: the directory must be named by the plugin's identifier, \"thumbs\""
             (try
               (import! dump-dir)
               (catch Exception e
                 (ex-message (ex-cause e))))))
      (is (nil? (t2/select-one :model/CustomVizPlugin :identifier "thumbs"))))))

(deftest import-ignores-other-files-in-a-plugins-directory-test
  (mt/with-model-cleanup [:model/CustomVizPlugin]
    (ts/with-random-dump-dir [dump-dir "custom-viz-import-"]
      (let [files (plugin-files "thumbs")]
        (write-plugin-files! dump-dir "thumbs" (plugin-yaml "thumbs")
                             (assoc files
                                    "deploy/config.yaml"     "a: 1\n---\nb: [unterminated\n"
                                    "src/index.tsx"          "export default () => null;"
                                    "package.json"           "{}"
                                    "dist/index.js.map"      "{}"
                                    "dist/assets/unused.png" "not named by the manifest"))
        (import! dump-dir)
        (let [plugin (t2/select-one :model/CustomVizPlugin :identifier "thumbs")]
          (is (= :active (:status plugin)))
          (is (= (update-vals files seq) (update-vals (cache/bundle->files (:bundle plugin)) seq))
              "only the files pack would archive are in the bundle"))))))

(deftest round-trip-keeps-the-files-and-settles-the-hash-test
  (mt/with-model-cleanup [:model/CustomVizPlugin]
    (ts/with-random-dump-dir [dump-dir "custom-viz-round-trip-"]
      (let [files  (plugin-files "thumbs")
            plugin (insert-plugin! "thumbs" (cv.tu/make-tgz-bytes files))]
        (export! dump-dir)
        (t2/delete! :model/CustomVizPlugin :id (:id plugin))
        (import! dump-dir)
        (let [imported-hash (t2/select-one-fn :bundle_hash :model/CustomVizPlugin :identifier "thumbs")]
          (testing "the imported bundle holds the exported files"
            (is (= (update-vals files seq)
                   (update-vals (cache/bundle->files (t2/select-one-fn :bundle :model/CustomVizPlugin :identifier "thumbs")) seq))))
          (testing "exporting and importing again changes nothing"
            (ts/with-random-dump-dir [dump-dir-2 "custom-viz-round-trip-"]
              (export! dump-dir-2)
              (is (= (files-in (io/file dump-dir "custom_viz_plugins" "thumbs"))
                     (files-in (io/file dump-dir-2 "custom_viz_plugins" "thumbs"))))
              (import! dump-dir-2)
              (is (= imported-hash (t2/select-one-fn :bundle_hash :model/CustomVizPlugin :identifier "thumbs"))))))))))

(deftest tar-export-holds-the-bundles-files-test
  (mt/with-model-cleanup [:model/CustomVizPlugin]
    (let [files (plugin-files "thumbs")
          out   (ByteArrayOutputStream.)]
      (insert-plugin! "thumbs" (cv.tu/make-tgz-bytes files))
      (let [writer (storage.tar/tar-writer out "export")]
        (serialization/store! (serdes/extract-all "CustomVizPlugin" {}) writer)
        (protocols/finish! writer))
      (let [prefix  "export/custom_viz_plugins/thumbs/"
            entries (u.compress/untgz-files (.toByteArray out))]
        (is (= (update-vals files seq)
               (-> (update-keys entries #(subs % (count prefix)))
                   (dissoc "custom_viz_plugin.yaml")
                   (update-vals seq))))))))
