(ns metabase-enterprise.custom-viz-plugin.serialization-test
  "A custom viz plugin on disk: `custom_viz_plugins/<identifier>/custom_viz_plugin.yaml`, with the uploaded bundle
  inside it as base64."
  (:require
   [clojure.java.io :as io]
   [clojure.test :refer :all]
   [metabase-enterprise.custom-viz-plugin.test-util :as cv.tu]
   [metabase-enterprise.serialization.core :as serialization]
   [metabase-enterprise.serialization.test-util :as ts]
   [metabase.models.serialization :as serdes]
   [metabase.test :as mt]
   [metabase.util.yaml :as yaml]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

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

(deftest round-trip-test
  (mt/with-model-cleanup [:model/CustomVizPlugin]
    (ts/with-random-dump-dir [dump-dir "custom-viz-round-trip-"]
      (let [bundle (cv.tu/valid-bundle-bytes "Thumbs" {:icon "icon.svg" :metabase-version ">=1.60"})
            plugin (insert-plugin! "Thumbs" bundle :enabled false)]
        (export! dump-dir)
        (testing "the YAML is in a directory named by the identifier verbatim, holding only what the bundle can't derive"
          (is (= #{:serdes/meta :identifier :enabled :bundle :created_at}
                 (set (keys (yaml/from-file (io/file dump-dir "custom_viz_plugins" "Thumbs" "custom_viz_plugin.yaml"))))))
          (is (= #{"custom_viz_plugin.yaml"}
                 (set (.list (io/file dump-dir "custom_viz_plugins" "Thumbs"))))))
        (t2/delete! :model/CustomVizPlugin :id (:id plugin))
        (import! dump-dir)
        (testing "the import derives everything from the bundle and stores the same bytes"
          (is (=? {:status           :active
                   :enabled          false
                   :display_name     "Thumbs"
                   :icon             "icon.svg"
                   :metabase_version ">=1.60"
                   :bundle_hash      (:bundle_hash plugin)}
                  (t2/select-one :model/CustomVizPlugin :identifier "Thumbs")))
          (is (= (seq bundle) (seq (t2/select-one-fn :bundle :model/CustomVizPlugin :identifier "Thumbs")))))))))

(deftest import-ignores-other-yaml-in-a-plugins-directory-test
  (mt/with-model-cleanup [:model/CustomVizPlugin]
    (ts/with-random-dump-dir [dump-dir "custom-viz-import-"]
      (insert-plugin! "thumbs" (cv.tu/valid-bundle-bytes "thumbs"))
      (export! dump-dir)
      (t2/delete! :model/CustomVizPlugin :identifier "thumbs")
      (let [stray (io/file dump-dir "custom_viz_plugins" "thumbs" "deploy" "config.yaml")]
        (io/make-parents stray)
        (spit stray "a: 1\n---\nb: [unterminated\n"))
      (import! dump-dir)
      (is (= :active (t2/select-one-fn :status :model/CustomVizPlugin :identifier "thumbs"))))))
