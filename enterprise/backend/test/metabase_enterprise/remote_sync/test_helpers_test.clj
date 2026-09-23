(ns metabase-enterprise.remote-sync.test-helpers-test
  "Tests for the MockSource implementation in test-helpers."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.remote-sync.impl :as impl]
   [metabase-enterprise.remote-sync.source.protocol :as source.p]
   [metabase-enterprise.remote-sync.test-helpers :as th]
   [metabase.search.core :as search]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db))

(defn- write-files!
  "Wholesale-write `files` ({:path :content}) to `snapshot` via the commit builder (clear managed dirs,
  stage every file, push)."
  [snapshot message files]
  (let [c (source.p/open-commit snapshot)]
    (source.p/replace-all! c)
    (doseq [f files] (source.p/stage-upsert! c f))
    (source.p/finish-commit! c message)))

(deftest mock-source-write-files-managed-dir-cleanup-test
  (testing "MockSource removes files in managed dirs not in write set"
    (let [source (th/create-mock-source
                  :initial-files {"main" {"collections/abc/file1.yaml" "content1"
                                          "collections/abc/file2.yaml" "content2"
                                          "collections/def/file3.yaml" "content3"
                                          "other/file4.yaml" "content4"}}
                  :managed-dirs #{"collections"})
          snapshot (source.p/snapshot source)]
      (write-files! snapshot "Write only abc"
                    [{:path "collections/abc/file1.yaml" :content "new-content1"}])
      (is (= #{"collections/abc/file1.yaml" "other/file4.yaml"}
             (set (source.p/list-files snapshot)))
          "Only written files in managed dirs should remain; unmanaged dirs untouched"))))

(deftest mock-source-write-files-unmanaged-preserved-test
  (testing "MockSource preserves files in unmanaged directories"
    (let [source (th/create-mock-source
                  :initial-files {"main" {"collections/abc/file1.yaml" "content1"
                                          "unmanaged/file2.yaml" "content2"}}
                  :managed-dirs #{"collections"})
          snapshot (source.p/snapshot source)]
      (write-files! snapshot "Write collections"
                    [{:path "collections/abc/file1.yaml" :content "new-content"}])
      (is (= #{"collections/abc/file1.yaml" "unmanaged/file2.yaml"}
             (set (source.p/list-files snapshot)))
          "Unmanaged directory files should be preserved"))))

(deftest mock-source-write-files-empty-managed-dir-cleanup-test
  (testing "MockSource cleans managed dir even when no files written to it"
    (let [source (th/create-mock-source
                  :initial-files {"main" {"collections/abc/file1.yaml" "content1"
                                          "snippets/old.yaml" "old-snippet"}}
                  :managed-dirs #{"collections" "snippets"})
          snapshot (source.p/snapshot source)]
      ;; Write only to collections, nothing to snippets
      (write-files! snapshot "Write only collections"
                    [{:path "collections/abc/file1.yaml" :content "new-content"}])
      (is (= #{"collections/abc/file1.yaml"}
             (set (source.p/list-files snapshot)))
          "Snippets dir should be cleaned even though no snippet files were written"))))

(defn- content-ids
  "Ids of the main app's cards, dashboards and non-personal collections (test users' personal collections
  are created lazily, so they are left out)."
  []
  {:cards       (t2/select-pks-set :model/Card)
   :dashboards  (t2/select-pks-set :model/Dashboard)
   :collections (t2/select-pks-set :model/Collection :personal_owner_id nil)})

(deftest clean-remote-sync-state-removes-imported-content-test
  (testing "content a test imports into the main app is gone once the clean-remote-sync-state fixture ends"
    (mt/dataset test-data
      (mt/id) ; the mock source's card references test-data
      (mt/with-dynamic-fn-redefs [search/reindex! (constantly nil)]
        (let [before (content-ids)]
          (th/clean-remote-sync-state
           (fn []
             (let [task-id (t2/insert-returning-pk! :model/RemoteSyncTask {:sync_task_type "import"
                                                                          :initiated_by   (mt/user->id :rasta)})]
               (is (= :success (:status (impl/import! (source.p/snapshot (th/create-mock-source)) task-id))))
               (is (t2/exists? :model/Card :name "Some Question")))))
          (is (= before (content-ids))))))))
