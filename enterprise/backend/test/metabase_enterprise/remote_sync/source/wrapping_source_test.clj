(ns metabase-enterprise.remote-sync.source.wrapping-source-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.remote-sync.source :as source]
   [metabase-enterprise.remote-sync.source.protocol :as source.p]))

(defrecord MockSourceSnapshot [files]
  source.p/SourceSnapshot
  (list-files [_]
    (keys files))

  (read-file [_ path]
    (get files path))

  (write-files! [_ _message new-files]
    (into {} (map (juxt :path :content) new-files))
    "written-files-version")

  (version [_]
    "mock-version"))

(defrecord MockSource [files]
  source.p/Source
  (create-branch [_ _branch _base]
    nil)

  (branches [_]
    ["main"])

  (default-branch [_]
    "main")

  (snapshot [_]
    (->MockSourceSnapshot files)))

(deftest wrapping-source-list-files-single-filter-test
  (testing "WrappingSource filters list-files based on path-filters"
    (let [mock-source (->MockSource {"collections/foo.yaml" "foo-content"
                                     "collections/bar.yaml" "bar-content"
                                     "databases/db1.yaml" "db1-content"
                                     "databases/db2.yaml" "db2-content"
                                     "dashboards/dash1.yaml" "dash1-content"})
          wrapped-snap (source/->WrappingSnapshot (source.p/snapshot mock-source) [#"collections/.*"])]
      (is (= ["collections/foo.yaml" "collections/bar.yaml"]
             (source.p/list-files wrapped-snap))
          "Should only include files matching the collections pattern"))))

(deftest wrapping-source-list-files-multiple-filters-test
  (testing "WrappingSource with multiple path filters"
    (let [mock-source (->MockSource {"collections/foo.yaml" "foo-content"
                                     "collections/bar.yaml" "bar-content"
                                     "databases/db1.yaml" "db1-content"
                                     "databases/db2.yaml" "db2-content"
                                     "dashboards/dash1.yaml" "dash1-content"})
          wrapped-snap (source/->WrappingSnapshot (source.p/snapshot mock-source) [#"collections/.*" #"databases/.*"])]
      (is (= ["collections/foo.yaml" "collections/bar.yaml" "databases/db1.yaml" "databases/db2.yaml"]
             (source.p/list-files wrapped-snap))
          "Should include files matching any of the patterns"))))

(deftest wrapping-source-list-files-no-match-test
  (testing "WrappingSource with no matching files"
    (let [mock-source (->MockSource {"collections/foo.yaml" "foo-content"
                                     "dashboards/dash1.yaml" "dash1-content"})
          wrapped-snap (source/->WrappingSnapshot (source.p/snapshot mock-source) [#"databases/.*"])]
      (is (= []
             (source.p/list-files wrapped-snap))
          "Should return empty list when no files match"))))

(deftest wrapping-source-read-file-single-filter-test
  (testing "WrappingSource filters read-file based on path-filters"
    (let [mock-source (->MockSource {"collections/foo.yaml" "foo-content"
                                     "collections/bar.yaml" "bar-content"
                                     "databases/db1.yaml" "db1-content"})
          wrapped-snap (source/->WrappingSnapshot (source.p/snapshot mock-source) [#"collections/.*"])]
      (is (= "foo-content"
             (source.p/read-file wrapped-snap "collections/foo.yaml"))
          "Should read file that matches filter")
      (is (nil? (source.p/read-file wrapped-snap "databases/db1.yaml"))
          "Should return nil for file that doesn't match filter"))))

(deftest wrapping-source-read-file-multiple-filters-test
  (testing "WrappingSource read-file with multiple filters"
    (let [mock-source (->MockSource {"collections/foo.yaml" "foo-content"
                                     "databases/db1.yaml" "db1-content"
                                     "dashboards/dash1.yaml" "dash1-content"})
          wrapped-snap (source/->WrappingSnapshot (source.p/snapshot mock-source) [#"collections/.*" #"dashboards/.*"])]
      (is (= "foo-content"
             (source.p/read-file wrapped-snap "collections/foo.yaml"))
          "Should read file matching first pattern")
      (is (= "dash1-content"
             (source.p/read-file wrapped-snap "dashboards/dash1.yaml"))
          "Should read file matching second pattern")
      (is (nil? (source.p/read-file wrapped-snap "databases/db1.yaml"))
          "Should return nil for file not matching any pattern"))))

(deftest wrapping-source-write-files-single-filter-test
  (testing "WrappingSource filters write-files! based on path-filters"
    (let [written-files (atom [])
          mock-snap (reify source.p/SourceSnapshot
                      (list-files [_]
                        [])
                      (read-file [_ _path]
                        nil)
                      (write-files! [_ _message files]
                        (reset! written-files files)
                        nil)
                      (version [_]
                        "mock-version"))
          wrapped-snap (source/->WrappingSnapshot mock-snap [#"collections/.*"])
          files-to-write [{:path "collections/foo.yaml" :content "foo-content"}
                          {:path "collections/bar.yaml" :content "bar-content"}
                          {:path "databases/db1.yaml" :content "db1-content"}]]
      (source.p/write-files! wrapped-snap "test commit" files-to-write)
      (is (= [{:path "collections/foo.yaml" :content "foo-content"}
              {:path "collections/bar.yaml" :content "bar-content"}]
             @written-files)
          "Should only write files matching the filter"))))

(deftest wrapping-source-write-files-multiple-filters-test
  (testing "WrappingSource write-files! with multiple filters"
    (let [written-files (atom [])
          mock-snap (reify source.p/SourceSnapshot
                      (list-files [_]
                        [])
                      (read-file [_ _path]
                        nil)
                      (write-files! [_ _message files]
                        (reset! written-files files)
                        nil)
                      (version [_]
                        "mock-version"))
          wrapped-snap (source/->WrappingSnapshot mock-snap [#"collections/.*" #"dashboards/.*"])
          files-to-write [{:path "collections/foo.yaml" :content "foo-content"}
                          {:path "databases/db1.yaml" :content "db1-content"}
                          {:path "dashboards/dash1.yaml" :content "dash1-content"}]]
      (source.p/write-files! wrapped-snap "test commit" files-to-write)
      (is (= [{:path "collections/foo.yaml" :content "foo-content"}
              {:path "dashboards/dash1.yaml" :content "dash1-content"}]
             @written-files)
          "Should write files matching any pattern"))))

(deftest wrapping-source-write-files-no-match-test
  (testing "WrappingSource write-files! with no matching files"
    (let [written-files (atom [])
          mock-snapshot (reify source.p/SourceSnapshot
                          (list-files [_]
                            [])
                          (read-file [_this _path]
                            nil)
                          (write-files! [_this _message _files]
                            nil)
                          (version [_this]
                            nil))
          files-to-write [{:path "databases/db1.yaml" :content "db1-content"}
                          {:path "dashboards/dash1.yaml" :content "dash1-content"}]]
      (source.p/write-files! mock-snapshot "test commit" files-to-write)
      (is (= []
             @written-files)
          "Should write no files when none match"))))

(deftest wrapping-source-write-files-removal-entries-test
  (testing "WrappingSource filters removal entries based on path-filters"
    (let [written-files (atom [])
          mock-snap (reify source.p/SourceSnapshot
                      (list-files [_]
                        [])
                      (read-file [_ _path]
                        nil)
                      (write-files! [_ _message files]
                        (reset! written-files (vec files))
                        nil)
                      (version [_]
                        "mock-version"))
          wrapped-snap (source/->WrappingSnapshot mock-snap [#"collections/.*"])
          files-to-write [{:path "collections/foo.yaml" :content "foo-content"}
                          {:path "collections/abc123" :remove? true}
                          {:path "databases/db1" :remove? true}]]
      (source.p/write-files! wrapped-snap "test commit" files-to-write)
      (is (= [{:path "collections/foo.yaml" :content "foo-content"}
              {:path "collections/abc123" :remove? true}]
             @written-files)
          "Should pass through removal entries that match filter and filter out those that don't"))))
