(ns metabase-enterprise.remote-sync.custom-viz-plugins-test
  "Remote sync ignores plugin imports and preserves plugin files on export."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.remote-sync.impl :as impl]
   [metabase-enterprise.remote-sync.source.protocol :as source.p]
   [metabase-enterprise.remote-sync.test-helpers :as test-helpers]
   [metabase.remote-sync.test-util :as remote-sync.tu]
   [metabase.search.test-util :as search.tu]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))
(use-fixtures :each
  remote-sync.tu/allow-remote-synced-collections test-helpers/clean-remote-sync-state test-helpers/commit-with-temp)

(def ^:private plugin-files
  {"custom_viz_plugins/thumbs/custom_viz_plugin.yaml" "identifier: thumbs\nenabled: true\nserdes/meta:\n- model: CustomVizPlugin\n"
   "custom_viz_plugins/thumbs/metabase-plugin.json"   "{\"name\": \"thumbs\", \"icon\": \"icon.svg\"}"
   "custom_viz_plugins/thumbs/dist/index.js"          "{}"
   "custom_viz_plugins/thumbs/dist/assets/icon.svg"   "<svg/>"
   "custom_viz_plugins/README.md"                     "# plugins"})

(deftest export-keeps-the-plugins-in-the-repository-test
  (search.tu/with-index-disabled
    (mt/with-temporary-setting-values [remote-sync-type :read-write remote-sync-enabled true remote-sync-transforms false]
      (let [mock (test-helpers/create-mock-source :initial-files {"main" plugin-files})
            task (t2/insert-returning-pk! :model/RemoteSyncTask {:sync_task_type "export"
                                                                 :initiated_by   (mt/user->id :rasta)})]
        (mt/with-temp [:model/Collection _ {:name "Synced" :is_remote_synced true :location "/"}]
          (testing "a full export preserves every plugin file"
            (let [result (impl/export! (source.p/snapshot mock) task "export" :force? true)]
              (is (= :success (:status result)))
              (is (= plugin-files
                     (select-keys (get @(:files-atom mock) "main") (keys plugin-files)))))))))))

(deftest import-does-not-load-the-plugins-in-the-repository-test
  (mt/with-model-cleanup [:model/CustomVizPlugin]
    (search.tu/with-index-disabled
      (mt/with-temporary-setting-values [remote-sync-type :read-write remote-sync-enabled true]
        (let [mock   (test-helpers/create-mock-source :initial-files {"main" plugin-files})
              task   (t2/insert-returning-pk! :model/RemoteSyncTask {:sync_task_type "import"
                                                                     :initiated_by   (mt/user->id :rasta)})
              result (impl/import! (source.p/snapshot mock) task)]
          (is (= :success (:status result)))
          (is (nil? (t2/select-one :model/CustomVizPlugin :identifier "thumbs"))))))))
