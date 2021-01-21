(ns build.version-info-test
  (:require [build.version-info :as version-info]
            [clojure.test :refer :all]))

(deftest tag-parts-test
  (doseq [[tag expected] {nil          nil
                          "0.37.0"     [0 37 0]
                          "0.37.0.1"   [0 37 0 1]
                          "0.37.1-rc2" [0 37 1]}
          tag            [tag (str \v tag)]]
    (testing (str (pr-str (list 'tag-parts tag)) " => " (pr-str expected))
      (is (= expected
             (#'version-info/tag-parts tag))))))

(deftest current-snapshot-version-test
  (doseq [[branch tag->expected] {"release-x.37.x" {nil          "UNKNOWN"
                                                    "0.37.0"     "v0.37.1-SNAPSHOT"
                                                    "0.37.0.1"   "v0.37.1-SNAPSHOT"
                                                    "0.37.1-rc2" "v0.37.2-SNAPSHOT"}
                                  "master"         {nil          "UNKNOWN"
                                                    "0.37.0"     "v0.38.0-SNAPSHOT"
                                                    "0.37.0.1"   "v0.38.0-SNAPSHOT"
                                                    "0.37.1-rc2" "v0.38.0-SNAPSHOT"}}
          [tag expected]         tag->expected]
    (testing (str (pr-str (list 'current-snapshot-version branch tag)) " => " (pr-str expected))
      (is (= expected
             (version-info/current-snapshot-version branch tag))))))
