(ns metabase-enterprise.remote-sync.custom-viz-plugins-test
  "Remote sync does not carry custom viz plugins, so a repository's `custom_viz_plugins/` directory is left alone:
  an import does not load it, and a full export keeps every file in it."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.remote-sync.impl :as impl]
   [metabase-enterprise.remote-sync.source.protocol :as source.p]
   [metabase-enterprise.remote-sync.test-helpers :as test-helpers]
   [metabase.search.test-util :as search.tu]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))
(use-fixtures :each test-helpers/clean-remote-sync-state test-helpers/commit-with-temp)

(deftest export-keeps-the-plugins-in-the-repository-test
  (search.tu/with-index-disabled
    (mt/with-temporary-setting-values [remote-sync-type :read-write remote-sync-enabled true remote-sync-transforms false]
      (let [plugin-files {"custom_viz_plugins/thumbs/custom_viz_plugin.yaml" "identifier: thumbs\nenabled: true\nserdes/meta:\n- model: CustomVizPlugin\n"
                          "custom_viz_plugins/thumbs/metabase-plugin.json"   "{\"name\": \"thumbs\", \"icon\": \"icon.svg\"}"
                          "custom_viz_plugins/thumbs/dist/index.js"          "console.log('hi')"
                          "custom_viz_plugins/thumbs/dist/assets/icon.svg"   "<svg/>"
                          "custom_viz_plugins/README.md"                     "# plugins"}
            mock         (test-helpers/create-mock-source :initial-files {"main" plugin-files})
            task         (t2/insert-returning-pk! :model/RemoteSyncTask {:sync_task_type "export"
                                                                         :initiated_by   (mt/user->id :rasta)})]
        (mt/with-temp [:model/Collection _ {:name "Synced" :is_remote_synced true :location "/"}]
          (testing "a full export, which replaces the managed directories wholesale, keeps the plugin's files"
            (let [result (impl/export! (source.p/snapshot mock) task "export" :force? true)]
              (impl/handle-task-result! result task)
              (is (= :success (:status result)))
              (is (= plugin-files
                     (select-keys (get @(:files-atom mock) "main") (keys plugin-files)))))))))))

(deftest import-does-not-load-the-plugins-in-the-repository-test
  (mt/with-model-cleanup [:model/CustomVizPlugin]
    (search.tu/with-index-disabled
      (mt/with-temporary-setting-values [remote-sync-type :read-write remote-sync-enabled true]
        (let [mock   (test-helpers/create-mock-source
                      :initial-files {"main" {"custom_viz_plugins/thumbs/custom_viz_plugin.yaml" "identifier: thumbs\nenabled: true\nserdes/meta:\n- model: CustomVizPlugin\n"
                                              "custom_viz_plugins/thumbs/metabase-plugin.json"   "{\"name\": \"thumbs\"}"
                                              "custom_viz_plugins/thumbs/dist/index.js"          "console.log('hi')"}})
              task   (t2/insert-returning-pk! :model/RemoteSyncTask {:sync_task_type "import"
                                                                     :initiated_by   (mt/user->id :rasta)})
              result (impl/import! (source.p/snapshot mock) task)]
          (impl/handle-task-result! result task)
          (is (= :success (:status result)))
          (is (nil? (t2/select-one :model/CustomVizPlugin :identifier "thumbs"))))))))
