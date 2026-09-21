(ns ^:mb/app-db-migrations-test metabase-enterprise.remote-sync.legacy-entity-id-test
  "Remote Sync exports of content that predates the v64 entity_id backfill."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.remote-sync.impl :as impl]
   [metabase-enterprise.remote-sync.source.protocol :as source.p]
   [metabase-enterprise.remote-sync.test-helpers :as test-helpers]
   [metabase.app-db.schema-migrations-test.impl :as schema-migrations.impl]
   [toucan2.core :as t2]))

(deftest export!-legacy-null-entity-id-collections-test
  (testing "GHY-4257: two same-named collections that had NULL entity_ids before the v64 upgrade export to two
           different files. Before the v64 backfill, both resolved to the same path and the push failed with
           that path listed twice."
    (schema-migrations.impl/test-migrations ["v64.2026-07-23T12:00:00" nil] [migrate!]
      (let [insert-legacy-genes! #(t2/insert-returning-pk! :collection {:name             "Genes"
                                                                        :slug             "genes"
                                                                        :location         "/"
                                                                        :entity_id        nil
                                                                        :archived         false
                                                                        :is_sample        false
                                                                        :is_remote_synced true
                                                                        :created_at       :%now})]
        (insert-legacy-genes!)
        (insert-legacy-genes!)
        (migrate!)
        (let [task-id     (t2/insert-returning-pk! :model/RemoteSyncTask {:sync_task_type "export"})
              mock-source (test-helpers/create-mock-source :initial-files {"main" {}})
              result      (impl/export! (source.p/snapshot mock-source) task-id "Push" :force? true)
              files       (keys (get @(:files-atom mock-source) "main"))]
          (is (= :success (:status result)) (:message result))
          ;; The mock source overwrites a path staged twice instead of failing like git does, so the
          ;; collision shows up as one file, not as an error.
          (is (= 2 (count (filter #(str/includes? % "genes") files)))
              files))))))
