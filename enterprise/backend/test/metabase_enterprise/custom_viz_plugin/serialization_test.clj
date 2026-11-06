(ns metabase-enterprise.custom-viz-plugin.serialization-test
  "A custom viz plugin on disk: `custom_viz_plugins/<slug>/custom_viz_plugin.yaml` with the bundle unpacked beside
  it, laid out as `npx @metabase/custom-viz pack` archives it."
  (:require
   [clojure.java.io :as io]
   [clojure.test :refer :all]
   [metabase-enterprise.custom-viz-plugin.cache :as cache]
   [metabase-enterprise.custom-viz-plugin.test-util :as cv.tu]
   [metabase-enterprise.serialization.core :as serialization]
   [metabase-enterprise.serialization.test-util :as ts]
   [metabase-enterprise.serialization.v2.protocols :as protocols]
   [metabase-enterprise.serialization.v2.storage.tar :as storage.tar]
   [metabase.app-db.core :as mdb]
   [metabase.models.serialization :as serdes]
   [metabase.test :as mt]
   [metabase.util :as u]
   [metabase.util.compress :as u.compress]
   [metabase.util.json :as json]
   [metabase.util.yaml :as yaml]
   [toucan2.core :as t2])
  (:import
   (java.io ByteArrayOutputStream File)
   (java.nio.file Files)
   (java.util Random)))

(set! *warn-on-reflection* true)

(def ^:private icon-bytes
  "The SVG icon as bytes; the text outside ASCII catches a wrong charset."
  (.getBytes "<svg xmlns=\"http://www.w3.org/2000/svg\"><title>Daumen hoch – 👍</title></svg>" "UTF-8"))

(defn- manifest
  "The manifest of plugin `identifier`, naming the icon in [[plugin-files]]."
  [identifier]
  {:name identifier :icon "icon.svg" :metabase {:version ">=1.60"}})

(defn- plugin-files
  "Bundle files, as bytes."
  [identifier]
  {"metabase-plugin.json" (.getBytes ^String (json/encode (manifest identifier)) "UTF-8")
   "dist/index.js"        (.getBytes "{}" "UTF-8")
   "dist/assets/icon.svg" icon-bytes})

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
  "Relative file paths mapped to byte sequences."
  [^File dir]
  (into {}
        (for [^File f (file-seq dir)
              :when (.isFile f)]
          [(str (.relativize (.toPath dir) (.toPath f))) (seq (file-bytes f))])))

(defn- stored-files
  "The files of the bundle stored for plugin `identifier`, mapped to byte sequences."
  [identifier]
  (update-vals (cache/bundle->files (t2/select-one-fn :bundle :model/CustomVizPlugin :identifier identifier)) seq))

(defn- write-plugin-files!
  "Write plugin YAML and resources. Each file's content is a byte array or a string."
  [dump-dir dir yaml-fields files]
  (let [plugin-dir (io/file dump-dir "custom_viz_plugins" dir)]
    (.mkdirs plugin-dir)
    (spit (io/file plugin-dir "custom_viz_plugin.yaml") (yaml/generate-string yaml-fields))
    (doseq [[path content] files
            :let [f (io/file plugin-dir ^String path)]]
      (io/make-parents f)
      (io/copy content f))))

(defn- plugin-yaml
  "The YAML of plugin `identifier` as an export writes it, under a fresh entity_id unless `extra` gives one."
  [identifier & {:as extra}]
  (merge {:serdes/meta [{:model "CustomVizPlugin"}]
          :entity_id   (u/generate-nano-id)
          :identifier  identifier
          :files       (vec (sort (keys (plugin-files identifier))))}
         extra))

(deftest export-writes-the-yaml-and-the-bundles-files-test
  (mt/with-model-cleanup [:model/CustomVizPlugin]
    (ts/with-random-dump-dir [dump-dir "custom-viz-export-"]
      (let [files  (plugin-files "Thumbs")
            plugin (insert-plugin! "Thumbs" (cv.tu/make-tgz-bytes (assoc files
                                                                         "dist/index.js.map" "{}"
                                                                         "README.md" "ignored"))
                                   :enabled false)]
        (export! dump-dir)
        (let [plugin-dir (io/file dump-dir "custom_viz_plugins" "Thumbs")
              yaml-file  (io/file plugin-dir "custom_viz_plugin.yaml")]
          (testing "YAML carries the entity_id and identifier and declares the files, not this instance's `enabled` state"
            (is (= {:serdes/meta [{:model "CustomVizPlugin"}]
                    :entity_id   (:entity_id plugin)
                    :identifier  "Thumbs"
                    :files       (vec (sort (keys files)))}
                   (yaml/from-file yaml-file))))
          (testing "only declared resources are exported, byte for byte"
            (is (= (assoc (update-vals files seq) "custom_viz_plugin.yaml" (seq (file-bytes yaml-file)))
                   (files-in plugin-dir)))))))))

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
        (insert-plugin! "bad/identifier" (cv.tu/valid-bundle-bytes "bad/identifier")))
      (export! dump-dir)
      (is (= ["exported"] (vec (.list (io/file dump-dir "custom_viz_plugins"))))))))

(deftest export-skips-plugins-whose-identifiers-differ-only-in-case-test
  ;; MySQL and MariaDB compare text case-insensitively, so the unique index refuses the second plugin: the collision
  ;; this test covers can't exist there
  (when-not (= :mysql (mdb/db-type))
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
                      (messages)))))))))

(deftest import-packs-the-files-beside-the-yaml-test
  (mt/with-model-cleanup [:model/CustomVizPlugin]
    (ts/with-random-dump-dir [dump-dir "custom-viz-import-"]
      (let [files (plugin-files "thumbs")]
        (write-plugin-files! dump-dir "thumbs" (plugin-yaml "thumbs")
                             (assoc files
                                    "deploy/config.yaml" "a: [unterminated"
                                    "src/index.tsx" "{}"
                                    "dist/assets/unused.svg" "ignored"))
        (import! dump-dir)
        (testing "import derives metadata from the manifest"
          (is (=? {:status           :active
                   :enabled          true
                   :display_name     "thumbs"
                   :icon             "icon.svg"
                   :metabase_version ">=1.60"
                   :manifest         (manifest "thumbs")
                   :bundle_hash      (cv.tu/bundle-hash (cache/files->bundle files))}
                  (t2/select-one :model/CustomVizPlugin :identifier "thumbs"))))
        (testing "only declared resources are packed and the icon remains intact"
          (is (= (update-vals files seq) (stored-files "thumbs")))
          (is (= (seq icon-bytes)
                 (seq (cache/get-asset (t2/select-one :model/CustomVizPlugin :identifier "thumbs") "icon.svg")))))))))

(deftest import-with-missing-files-replaces-an-active-plugins-bundle-test
  (mt/with-model-cleanup [:model/CustomVizPlugin]
    (ts/with-random-dump-dir [dump-dir "custom-viz-import-"]
      (let [healthy (cache/files->bundle (plugin-files "thumbs"))
            {id :id entity-id :entity_id} (insert-plugin! "thumbs" healthy :icon "icon.svg" :metabase_version ">=1.60")]
        (testing "missing resources replace the existing bundle with an error"
          (write-plugin-files! dump-dir "thumbs" (plugin-yaml "thumbs" :entity_id entity-id) {})
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

(deftest import-of-a-plugin-with-a-bitmap-icon-keeps-it-active-test
  (mt/with-model-cleanup [:model/CustomVizPlugin]
    (ts/with-random-dump-dir [dump-dir "custom-viz-import-"]
      (let [files {"metabase-plugin.json" (json/encode {:name "thumbs" :icon "icon.png"})
                   "dist/index.js"        "{}"
                   "dist/assets/icon.png" (byte-array [0x89 0x50 0x4e 0x47])}]
        (write-plugin-files! dump-dir "thumbs" (plugin-yaml "thumbs" :files (vec (sort (keys files)))) files)
        (import! dump-dir)
        (testing "a plugin exported with a bitmap icon, from before icons had to be SVG files, keeps working once imported"
          (is (=? {:status :active :error_message nil}
                  (t2/select-one [:model/CustomVizPlugin :status :error_message] :identifier "thumbs"))))))))

(deftest import-refuses-a-bundle-over-the-upload-limit-test
  (mt/with-model-cleanup [:model/CustomVizPlugin]
    (ts/with-random-dump-dir [dump-dir "custom-viz-import-"]
      ;; bundle files are read as text, so the oversized script is random printable ASCII: about 6.5 bits of entropy
      ;; a character, which gzip can't bring under the limit from twice its size
      (let [random         (Random. 1)
            incompressible (let [sb (StringBuilder.)]
                             (dotimes [_ (* 2 cache/max-bundle-bytes)]
                               (.append sb (char (+ 33 (.nextInt random 94)))))
                             (str sb))]
        (write-plugin-files! dump-dir "big" (plugin-yaml "big")
                             (assoc (plugin-files "big") "dist/index.js" incompressible))
        (import! dump-dir)
        (testing "oversized bundles are rejected without storing their bytes"
          (is (=? {:status        :error
                   :error_message #(re-find #"Bundle must be less than 5MB" %)
                   :bundle        nil
                   :bundle_hash   nil}
                  (t2/select-one [:model/CustomVizPlugin :status :error_message :bundle :bundle_hash]
                                 :identifier "big"))))))))

(deftest import-ignores-the-directory-name-test
  (testing "the identifier comes from the YAML, whatever the directory is called"
    (mt/with-model-cleanup [:model/CustomVizPlugin]
      (ts/with-random-dump-dir [dump-dir "custom-viz-import-"]
        (write-plugin-files! dump-dir "my thumbs plugin" (plugin-yaml "thumbs") (plugin-files "thumbs"))
        (import! dump-dir)
        (is (= :active (t2/select-one-fn :status :model/CustomVizPlugin :identifier "thumbs")))))))

(deftest round-trip-keeps-the-files-and-settles-the-hash-test
  (mt/with-model-cleanup [:model/CustomVizPlugin]
    (ts/with-random-dump-dir [dump-dir "custom-viz-round-trip-"]
      (let [files  (plugin-files "Calendar Heatmap")
            plugin (insert-plugin! "Calendar Heatmap" (cv.tu/make-tgz-bytes files))]
        (export! dump-dir)
        (t2/delete! :model/CustomVizPlugin :id (:id plugin))
        (import! dump-dir)
        (let [{imported-id :id imported-hash :bundle_hash :as imported}
              (t2/select-one :model/CustomVizPlugin :identifier "Calendar Heatmap")]
          (testing "the plugin keeps its entity_id across the round trip"
            (is (= (:entity_id plugin) (:entity_id imported))))
          (testing "spaces and casing survive the round trip with resource bytes intact"
            (is (= (update-vals files seq) (stored-files "Calendar Heatmap"))))
          (testing "exporting and importing again updates the row in place and changes nothing"
            (ts/with-random-dump-dir [dump-dir-2 "custom-viz-round-trip-"]
              (export! dump-dir-2)
              (is (= (files-in (io/file dump-dir "custom_viz_plugins" "calendar_heatmap"))
                     (files-in (io/file dump-dir-2 "custom_viz_plugins" "calendar_heatmap"))))
              (import! dump-dir-2)
              (is (= [imported-id (:entity_id plugin) imported-hash]
                     ((juxt :id :entity_id :bundle_hash) (t2/select-one :model/CustomVizPlugin :identifier "Calendar Heatmap")))))))))))

(deftest import-of-a-yaml-without-an-entity-id-registers-a-new-plugin-test
  (testing "a hand-written YAML without entity_id lands as a new plugin under a generated one, as a data app's does"
    (mt/with-model-cleanup [:model/CustomVizPlugin]
      (ts/with-random-dump-dir [dump-dir "custom-viz-import-"]
        (write-plugin-files! dump-dir "thumbs" (dissoc (plugin-yaml "thumbs") :entity_id) (plugin-files "thumbs"))
        (import! dump-dir)
        (let [{:keys [entity_id status]} (t2/select-one :model/CustomVizPlugin :identifier "thumbs")]
          (is (= :active status))
          (is (= 21 (count entity_id))))
        (testing "imported again, it is a second plugin with the identifier of the first, so the import refuses it"
          (is (= "A custom viz plugin \"thumbs\" already exists on this instance. Delete it and pull again: cards reference the plugin by its identifier, so they keep working once it is pulled."
                 (try (import! dump-dir) nil
                      (catch Exception e (ex-message (or (ex-cause e) e))))))
          (is (= 1 (t2/count :model/CustomVizPlugin :identifier "thumbs"))))))))

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
