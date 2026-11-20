(ns mage.docs-docker-tags-test
  (:require
   [clojure.test :refer [are deftest is testing]]
   [mage.docs-docker-tags :as docs-docker-tags]))

(set! *warn-on-reflection* true)

(def ^:private version-info
  "Like `version-info.json`: `older` is not in version order."
  {:latest {:version "v0.65.5"}
   :older  [{:version "v0.65.4"}
            {:version "v0.64.7"}
            {:version "v0.58.41"}
            {:version "v0.64.10"}
            {:version "v0.64.9.1"}
            {:version "v0.58.40"}]
   :beta   {:version "v0.66.0-beta"}})

(deftest branch-major-test
  (are [branch major] (= major (docs-docker-tags/branch-major branch))
    "release-x.64.x"      64
    "release-x.65.x"      65
    "master"              :latest
    "doc-529-backport-64" nil
    ""                    nil
    nil                   nil))

(deftest latest-major-test
  (is (= 65 (docs-docker-tags/latest-major version-info))))

(deftest newest-release-test
  (testing "the newest release of a major version, compared as numbers"
    (is (= "64.10" (docs-docker-tags/newest-release version-info 64)))
    (is (= "58.41" (docs-docker-tags/newest-release version-info 58))))
  (testing "the `latest` release for `:latest`"
    (is (= "65.5" (docs-docker-tags/newest-release version-info :latest))))
  (testing "a release in `older` that is newer than `latest`, because a new release goes into `older` first"
    (is (= "65.6" (docs-docker-tags/newest-release (update version-info :older conj {:version "v0.65.6"}) :latest))))
  (testing "nil for a major version that has no release yet (the beta does not count)"
    (is (nil? (docs-docker-tags/newest-release version-info 66)))))

(deftest pin-tags-test
  (testing "fixed tags move to the release, with the prefix of each edition"
    (are [before after] (= after (docs-docker-tags/pin-tags before "65.5"))
      "docker pull metabase/metabase:v0.64.4"               "docker pull metabase/metabase:v0.65.5"
      "docker pull metabase/metabase-enterprise:v1.64.4"    "docker pull metabase/metabase-enterprise:v1.65.5"
      "image: metabase/metabase:v0.64.3.1\n"                "image: metabase/metabase:v0.65.5\n"
      "podman pull docker.io/metabase/metabase:v0.65.2"     "podman pull docker.io/metabase/metabase:v0.65.5"
      "change the image to `metabase/metabase:v0.64.4`."    "change the image to `metabase/metabase:v0.65.5`."
      "an OSS image with an EE tag metabase/metabase:v1.65.2" "an OSS image with an EE tag metabase/metabase:v0.65.5"))
  (testing "other text stays as it is"
    (are [text] (= text (docs-docker-tags/pin-tags text "65.5"))
      "metabase/metabase:latest"
      "metabase/metabase:v0.65.x"
      "metabase/metabase:v0.65.4.x"
      "metabase/metabase:v0.64-lts"
      "metabase/metabase:v0.66.0-beta"
      "metabase/metabase:<tag>"
      "ca072cd44a49        metabase/metabase        \"/app/run_metabase.sh\""
      "mycompany/metabase-custom"
      "foometabase/metabase:v0.65.2")))

(deftest pin-pages-test
  (testing "only the pages whose text changes, with their new text"
    (is (= {"a.md" "docker pull metabase/metabase:v0.65.5"}
           (docs-docker-tags/pin-pages {"a.md" "docker pull metabase/metabase:v0.64.4"
                                        "b.md" "docker pull metabase/metabase:v0.65.5"
                                        "c.md" "no tags here"}
                                       "65.5"))))
  (testing "nothing when no page changes"
    (is (= {} (docs-docker-tags/pin-pages {"a.md" "metabase/metabase:latest"} "65.5")))))
