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

(deftest clear-bundle-dir-test
  (testing "removes stale bundle files and nested directories"
    (let [^File bundle-dir (temp-dir "metabase-embedder-bundles-")
          nested-dir       (io/file bundle-dir "old-arch")
          stale-zip        (io/file nested-dir "old-model.zip")]
      (io/make-parents stale-zip)
      (spit stale-zip "stale bundle")
      (clear! bundle-dir)
      (is (not (.exists bundle-dir))
          "the generated bundle tree should be removed completely")))
  (testing "deletes a directory symlink without traversing into its target"
    (let [^File bundle-dir    (temp-dir "metabase-embedder-bundles-")
          ^File external-dir  (temp-dir "metabase-embedder-external-")
          ^File external-file (io/file external-dir "keep.txt")
          ^Path link-path     (.resolve (.toPath bundle-dir) "linked-directory")]
      (spit external-file "keep me")
      (Files/createSymbolicLink link-path (.toPath external-dir) (make-array FileAttribute 0))
      (try
        (clear! bundle-dir)
        (is (not (.exists bundle-dir)) "the generated bundle tree should be removed")
        (is (= "keep me" (slurp external-file)) "the symlink target must remain untouched")
        (finally
          (io/delete-file external-file true)
          (io/delete-file external-dir true)))))
  (testing "deletes a symlinked bundle root without traversing into its target"
    (let [^File link-parent    (temp-dir "metabase-embedder-link-parent-")
          ^File external-dir   (temp-dir "metabase-embedder-external-")
          ^File external-file  (io/file external-dir "keep.txt")
          ^File bundle-link    (.toFile (.resolve (.toPath link-parent) "bundles"))]
      (spit external-file "keep me")
      (Files/createSymbolicLink (.toPath bundle-link) (.toPath external-dir) (make-array FileAttribute 0))
      (try
        (clear! bundle-link)
        (is (not (.exists bundle-link)) "the bundle-root symlink should be removed")
        (is (= "keep me" (slurp external-file)) "the symlink target must remain untouched")
        (finally
          (io/delete-file link-parent true)
          (io/delete-file external-file true)
          (io/delete-file external-dir true)))))
  (testing "a bundle dir that doesn't exist yet is not an error"
    ;; The clean-checkout case: nothing to clear before the first build. Worth pinning because
    ;; clear-bundle-dir! deletes strictly (io/delete-file throws), so losing its exists? guard would
    ;; break every from-scratch build rather than fail quietly.
    ;; A freshly-created temp dir, deleted again: absent, and guaranteed not to collide with a real path.
    (let [^File missing-dir (temp-dir "metabase-embedder-bundles-absent-")]
      (Files/delete (.toPath missing-dir))
      (is (not (.exists missing-dir)) "precondition: the dir really is absent")
      (is (nil? (clear! missing-dir))))))

(deftest skip-model-fetch-clears-bundles-test
  (let [^File bundle-dir (temp-dir "metabase-embedder-bundles-skip-")
        stale-zip        (io/file bundle-dir "stale-model.zip")]
    (spit stale-zip "stale bundle")
    (with-redefs-fn {#'embedder-model/bundle-dir (str bundle-dir)
                     #'env/env                      {:skip-embedder-model "true"}}
      #(embedder-model/fetch-model! nil))
    (is (not (.exists bundle-dir))
        "SKIP_EMBEDDER_MODEL must not leave stale bundles available for packaging")))
