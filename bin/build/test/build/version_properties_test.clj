(ns build.version-properties-test
  (:require
   [build.version-properties :as version-properties]
   [clojure.test :refer :all]
   [clojure.tools.build.api :as b]
   [metabuild-common.core :as u])
  (:import
   (java.nio.file Files)
   (java.nio.file.attribute FileAttribute)))

(deftest most-recent-tag-test
  (let [repo (str (Files/createTempDirectory "metabase-version-properties-test-" (make-array FileAttribute 0)))
        git! (fn [& args]
               (apply u/sh {:dir repo, :quiet? true} "git" args))
        sh*  u/sh*]
    (try
      (git! "init" "--quiet")
      (git! "config" "user.email" "test@metabase.com")
      (git! "config" "user.name" "Metabase Test")
      (git! "commit" "--quiet" "--allow-empty" "--message" "Metabase release")
      (git! "tag" "v0.60.0-beta")
      (git! "commit" "--quiet" "--allow-empty" "--message" "Custom viz release")
      (git! "tag" "custom-viz-v2.0.0-canary.0")
      (with-redefs [u/sh* (fn [& args]
                            (apply sh* {:dir repo, :quiet? true} args))]
        (is (= "v0.60.0-beta"
               (#'version-properties/most-recent-tag))
            "Metabase version detection should ignore component release tags"))
      (finally
        (b/delete {:path repo})))))

(deftest tag-parts-test
  (doseq [[tag expected] {nil          nil
                          "0.37.0"     [0 37 0]
                          "0.37.0.1"   [0 37 0 1]
                          "0.37.1-rc2" [0 37 1]}
          tag            [tag (str \v tag)]]
    (testing (str (pr-str (list 'tag-parts tag)) " => " (pr-str expected))
      (is (= expected
             (#'version-properties/tag-parts tag))))))

(deftest current-snapshot-version-test
  (doseq [[branch edition->tag->expected] {"release-x.37.x" {:oss {nil          "UNKNOWN"
                                                                   "0.37.0"     "v0.37.1-SNAPSHOT"
                                                                   "0.37.0.1"   "v0.37.1-SNAPSHOT"
                                                                   "0.37.1-rc2" "v0.37.2-SNAPSHOT"}
                                                             :ee  {nil          "UNKNOWN"
                                                                   "0.37.0"     "v1.37.1-SNAPSHOT"
                                                                   "0.37.0.1"   "v1.37.1-SNAPSHOT"
                                                                   "0.37.1-rc2" "v1.37.2-SNAPSHOT"}}
                                           "master"         {:oss {nil          "UNKNOWN"
                                                                   "0.37.0"     "v0.38.0-SNAPSHOT"
                                                                   "0.37.0.1"   "v0.38.0-SNAPSHOT"
                                                                   "0.37.1-rc2" "v0.38.0-SNAPSHOT"}
                                                             :ee  {nil          "UNKNOWN"
                                                                   "0.37.0"     "v1.38.0-SNAPSHOT"
                                                                   "0.37.0.1"   "v1.38.0-SNAPSHOT"
                                                                   "0.37.1-rc2" "v1.38.0-SNAPSHOT"}}}
          [edition tag->expected]         edition->tag->expected
          [tag expected]                  tag->expected]
    (testing (str (pr-str (list 'current-snapshot-version edition branch tag)) " => " (pr-str expected))
      (is (= expected
             (version-properties/current-snapshot-version edition branch tag))))))
