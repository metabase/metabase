(ns build.embedder-model-test
  (:require
   [build.embedder-model :as embedder-model]
   [clojure.java.io :as io]
   [clojure.test :refer [deftest is testing]])
  (:import
   (java.nio.file Files)
   (java.nio.file.attribute FileAttribute)))

(set! *warn-on-reflection* true)

(deftest clear-bundle-dir-test
  (testing "removes stale bundle files and nested directories"
    (let [bundle-dir (.toFile (Files/createTempDirectory "metabase-embedder-bundles-"
                                                         (make-array FileAttribute 0)))
          nested-dir (io/file bundle-dir "old-arch")
          stale-zip  (io/file nested-dir "old-model.zip")]
      (io/make-parents stale-zip)
      (spit stale-zip "stale bundle")
      (with-redefs-fn {#'embedder-model/bundle-dir (str bundle-dir)}
        #(#'embedder-model/clear-bundle-dir!))
      (is (not (.exists bundle-dir))
          "the generated bundle tree should be removed completely")))
  (testing "a bundle dir that doesn't exist yet is not an error"
    ;; The clean-checkout case: nothing to clear before the first build. Worth pinning because
    ;; clear-bundle-dir! deletes strictly (io/delete-file throws), so losing its exists? guard would
    ;; break every from-scratch build rather than fail quietly.
    ;; A freshly-created temp dir, deleted again: absent, and guaranteed not to collide with a real path.
    (let [missing-dir (doto (.toFile (Files/createTempDirectory "metabase-embedder-bundles-absent-"
                                                               (make-array FileAttribute 0)))
                        (.delete))]
      (is (not (.exists missing-dir)) "precondition: the dir really is absent")
      (is (nil? (with-redefs-fn {#'embedder-model/bundle-dir (str missing-dir)}
                  #(#'embedder-model/clear-bundle-dir!)))))))
