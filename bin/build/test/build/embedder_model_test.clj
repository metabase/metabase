(ns build.embedder-model-test
  (:require
   [build.embedder-model :as embedder-model]
   [clojure.java.io :as io]
   [clojure.test :refer [deftest is testing]]
   [environ.core :as env])
  (:import
   (java.io File)
   (java.nio.file Files Path)
   (java.nio.file.attribute FileAttribute)))

(set! *warn-on-reflection* true)

(defn- temp-dir ^File [prefix]
  (.toFile (Files/createTempDirectory prefix (make-array FileAttribute 0))))

(defn- clear! [bundle-dir]
  (with-redefs-fn {#'embedder-model/bundle-dir (str bundle-dir)}
    #(#'embedder-model/clear-bundle-dir!)))

(defn- assert-symlink-not-traversed!
  "Point `link-path` at a throwaway external directory holding a file, clear `clear-target`, then assert the
  link is gone and its target survived. The symlink cases differ only in where the link sits — inside the
  bundle dir, or as the bundle root itself — so they share this body."
  [^Path link-path ^File clear-target removed-message]
  (let [^File external-dir  (temp-dir "metabase-embedder-external-")
        ^File external-file (io/file external-dir "keep.txt")]
    (spit external-file "keep me")
    (Files/createSymbolicLink link-path (.toPath external-dir) (make-array FileAttribute 0))
    (try
      (clear! clear-target)
      (is (not (.exists clear-target)) removed-message)
      (is (= "keep me" (slurp external-file)) "the symlink target must remain untouched")
      (finally
        (io/delete-file external-file true)
        (io/delete-file external-dir true)))))

(deftest ^:parallel bundled-models-test
  (let [models (var-get #'embedder-model/bundled-models)]
    (testing "the plugin ships the defaults used by its three consumers"
      (is (= #{"all-MiniLM-L6-v2" "snowflake-arctic-embed-l-v2.0"}
             (set (keys models)))))
    (testing "Arctic is pinned with native signed/unsigned INT8 exports for the two architecture buckets"
      (is (= {:hf-repo         "Snowflake/snowflake-arctic-embed-l-v2.0"
              :revision        "f0ff6dce29c14995095706b2c861b31f13643ceb"
              :arch->onnx-file {"arm64" "onnx/model_int8.onnx"
                                "avx2"  "onnx/model_uint8.onnx"}}
             (select-keys (get models "snowflake-arctic-embed-l-v2.0")
                          [:hf-repo :revision :arch->onnx-file]))))))

(deftest clear-bundle-dir-removes-stale-bundles-test
  (let [^File bundle-dir (temp-dir "metabase-embedder-bundles-")
        nested-dir       (io/file bundle-dir "old-arch")
        stale-zip        (io/file nested-dir "old-model.zip")]
    (io/make-parents stale-zip)
    (spit stale-zip "stale bundle")
    (clear! bundle-dir)
    (is (not (.exists bundle-dir))
        "the generated bundle tree should be removed completely")))

(deftest clear-bundle-dir-directory-symlink-test
  (let [^File bundle-dir (temp-dir "metabase-embedder-bundles-")]
    (assert-symlink-not-traversed! (.resolve (.toPath bundle-dir) "linked-directory")
                                   bundle-dir
                                   "the generated bundle tree should be removed")))

(deftest clear-bundle-dir-symlinked-root-test
  (let [^File link-parent (temp-dir "metabase-embedder-link-parent-")
        ^File bundle-link (.toFile (.resolve (.toPath link-parent) "bundles"))]
    (try
      (assert-symlink-not-traversed! (.toPath bundle-link)
                                     bundle-link
                                     "the bundle-root symlink should be removed")
      (finally
        (io/delete-file link-parent true)))))

(deftest clear-bundle-dir-absent-dir-test
  ;; The clean-checkout case: nothing to clear before the first build. Worth pinning because
  ;; clear-bundle-dir! deletes strictly (io/delete-file throws), so losing its exists? guard would
  ;; break every from-scratch build rather than fail quietly.
  ;; A freshly-created temp dir, deleted again: absent, and guaranteed not to collide with a real path.
  (let [^File missing-dir (temp-dir "metabase-embedder-bundles-absent-")]
    (Files/delete (.toPath missing-dir))
    (is (not (.exists missing-dir)) "precondition: the dir really is absent")
    (is (nil? (clear! missing-dir)))))

(deftest skip-model-fetch-clears-bundles-test
  (let [^File bundle-dir (temp-dir "metabase-embedder-bundles-skip-")
        stale-zip        (io/file bundle-dir "stale-model.zip")]
    (spit stale-zip "stale bundle")
    (with-redefs-fn {#'embedder-model/bundle-dir (str bundle-dir)
                     #'env/env                      {:skip-embedder-model "true"}}
      #(embedder-model/fetch-model! nil))
    (is (not (.exists bundle-dir))
        "SKIP_EMBEDDER_MODEL must not leave stale bundles available for packaging")))
