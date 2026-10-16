(ns metabase-enterprise.remote-sync.user-files-test
  "Files a user keeps in the repository, which Metabase did not write, in the top-level folders of the kind layout:
  exports leave them, and imports skip them."
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase-enterprise.remote-sync.impl :as impl]
   [metabase-enterprise.remote-sync.source.protocol :as source.p]
   [metabase-enterprise.remote-sync.test-helpers :as rs.test]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))
(use-fixtures :each rs.test/clean-remote-sync-state rs.test/commit-with-temp)

(defn- new-task! [task-type]
  (t2/delete! :model/RemoteSyncTask)
  (t2/insert-returning-pk! :model/RemoteSyncTask {:sync_task_type task-type :initiated_by (mt/user->id :rasta)}))

(defn- seed-create-row! [model-type model-id]
  (t2/insert! :model/RemoteSyncObject
              {:model_type        model-type
               :model_id          model-id
               :model_name        (str model-type " " model-id)
               :status            "create"
               :status_changed_at (t/offset-date-time)}))

(def ^:private user-files
  "Files a user keeps in the folders the kind layout adds, none of them a Metabase entity file."
  {"data/notes.yaml"                     "title: Notes\nowner: data team\n"
   "data/list.yaml"                      "- a\n- b\n"
   "metrics/revenue.yaml"                "metrics:\n  - name: revenue\n    type: simple\n"
   "analytics/report.yaml"               "report: weekly\n"
   "dashboards/README.md"                "# Dashboards\n"
   "data_apps/sales/resources/seed.yaml" "rows: [1, 2]\n"})

(def ^:private stale-entity-file
  "An entity file Metabase wrote in a folder the kind layout adds, for an item that no longer exists."
  ["data/old.question.yaml"
   "serdes/meta:\n- model: Card\n  id: oldCardoldCardoldCard\n  label: old\nentity_id: oldCardoldCardoldCard\nname: Old\n"])

(defn- with-bench!
  "Calls `f` with a MockSource holding `files`, while a remote-synced collection with one card waits to be exported."
  [files f]
  (mt/with-temporary-setting-values [remote-sync-type       :read-write
                                     remote-sync-transforms false]
    (mt/with-temp [:model/Collection {coll-id :id} {:name "Bench" :is_remote_synced true :location "/"}
                   :model/Card       {card-id :id} {:name "Card A" :collection_id coll-id}]
      (t2/delete! :model/RemoteSyncObject)
      (seed-create-row! "Collection" coll-id)
      (seed-create-row! "Card" card-id)
      (f (rs.test/create-mock-source :initial-files {"main" files})))))

(defn- repo [mock]
  (get @(:files-atom mock) "main"))

(deftest full-export-keeps-user-files-test
  (testing "a full export deletes the entity files Metabase wrote in the new folders, and nothing else there"
    (with-bench! (conj user-files stale-entity-file)
      (fn [mock]
        (is (= :success (:status (impl/export! (source.p/snapshot mock) (new-task! "export") "full" :force? true))))
        (is (= user-files (select-keys (repo mock) (keys user-files))))
        (is (not (contains? (repo mock) (first stale-entity-file))))
        (is (contains? (repo mock) "collections/main/bench/card_a.yaml"))))))
