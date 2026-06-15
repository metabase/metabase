(ns metabase-enterprise.remote-sync.data-apps-test
  "Integration coverage for the data-apps hook in the remote-sync import pipeline:
   importing a repo materializes data apps from its `data_apps/` directory."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.data-apps.models.data-app]
   [metabase-enterprise.remote-sync.impl :as impl]
   [metabase-enterprise.remote-sync.source.protocol :as source.p]
   [metabase-enterprise.remote-sync.test-helpers :as test-helpers]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db))
(use-fixtures :each (fn [f] (test-helpers/clean-remote-sync-state f)))

(comment metabase-enterprise.data-apps.models.data-app/keep-me)

(defn- import! [files]
  (let [source  (test-helpers/create-mock-source :initial-files files)
        task-id (t2/insert-returning-pk! :model/RemoteSyncTask
                                         {:sync_task_type "import" :initiated_by (mt/user->id :rasta)})
        ;; force: the mock source reports a constant version, so without this the
        ;; second import in a test would hit the "version unchanged" skip branch
        result  (impl/import! (source.p/snapshot source) task-id :force? true)]
    ;; calling import! directly leaves the task "running"; mark it ended so a
    ;; subsequent import in the same test isn't blocked by the running-task guard
    (t2/update! :model/RemoteSyncTask task-id {:ended_at :%now})
    result))

(deftest import-materializes-data-apps-test
  (testing "a remote-sync import materializes data apps from data_apps/ alongside serdes content"
    (mt/with-model-cleanup [:model/DataApp]
      (let [files  {"main" {"collections/c/c.yaml"
                            (test-helpers/generate-collection-yaml "data-apps-test-collx" "DA Coll")
                            "data_apps/sales/data_app.yml"  "name: Sales\nslug: sales\npath: ./dist/index.js\n"
                            "data_apps/sales/dist/index.js" "SALESBUNDLE"}}
            result (import! files)]
        (is (= :success (:status result)))
        (let [app (t2/select-one :model/DataApp :name "sales")]
          (is (some? app) "the data app from the repo was materialized by the import")
          (is (= "Sales" (:display_name app)))
          (is (= "data_apps/sales/dist/index.js" (:bundle_path app)))
          (is (true? (:enabled app)))
          (is (= "SALESBUNDLE" (String. ^bytes (:bundle app) "UTF-8"))))))))

(deftest import-prunes-removed-data-apps-test
  (testing "an import whose repo no longer has an app dir prunes that app, keeping the rest"
    (mt/with-model-cleanup [:model/DataApp]
      (import! {"main" {"data_apps/gone/data_app.yml" "name: Gone\nslug: gone\npath: ./i.js\n"
                        "data_apps/gone/i.js"         "X"
                        "data_apps/kept/data_app.yml" "name: Kept\nslug: kept\npath: ./i.js\n"
                        "data_apps/kept/i.js"         "K"}})
      (is (= #{"gone" "kept"} (t2/select-fn-set :name :model/DataApp)))
      (import! {"main" {"data_apps/kept/data_app.yml" "name: Kept\nslug: kept\npath: ./i.js\n"
                        "data_apps/kept/i.js"         "K"}})
      (is (nil? (t2/select-one :model/DataApp :name "gone"))
          "the removed app is pruned")
      (is (some? (t2/select-one :model/DataApp :name "kept"))
          "the still-present app is kept"))))
