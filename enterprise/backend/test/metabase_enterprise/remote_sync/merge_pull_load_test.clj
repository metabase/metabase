(ns metabase-enterprise.remote-sync.merge-pull-load-test
  "A merge pull loads only the load units that the remote changed, deletes only the entities whose files the remote
  deleted, and writes only the ledger rows of the entities that it loads or deletes.

  Not ^:parallel: uses the shared remote-sync fixtures."
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.remote-sync.db :as remote-sync.db]
   [metabase-enterprise.remote-sync.impl :as impl]
   [metabase-enterprise.remote-sync.models.remote-sync-task :as remote-sync.task]
   [metabase-enterprise.remote-sync.save-rule :as save-rule]
   [metabase-enterprise.remote-sync.settings :as settings]
   [metabase-enterprise.remote-sync.source :as source]
   [metabase-enterprise.remote-sync.source.protocol :as source.p]
   [metabase-enterprise.remote-sync.spec :as spec]
   [metabase-enterprise.remote-sync.test-helpers :as test-helpers]
   [metabase.app-db.core :as mdb]
   [metabase.collections.models.collection :as collection]
   [metabase.events.core :as events]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.notification.task.send]
   [metabase.notification.task.send-trigger :as notification.send-trigger]
   [metabase.pulse.task.send-pulses]
   [metabase.pulse.task.send-pulses-trigger :as send-pulses-trigger]
   [metabase.search.appdb.index :as search.index]
   [metabase.search.core :as search]
   [metabase.search.test-util :as search.tu]
   [metabase.task.core :as task]
   [metabase.task.impl :as task.impl]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util :as u]
   [metabase.util.yaml :as yaml]
   [toucan2.core :as t2])
  (:import
   (java.util Properties)
   (org.quartz.impl StdSchedulerFactory)))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))
(use-fixtures :each test-helpers/clean-remote-sync-state test-helpers/commit-with-temp)

(defn- tree
  "The files in `snapshot`, as a map of path to content."
  [snapshot]
  (into {} (map (juxt identity #(source.p/read-file snapshot %))) (source.p/list-files snapshot)))

(defn- run-sync!
  "Run `f` with a new sync task of `task-type`, complete the task, and return the result of `f`."
  [task-type f]
  (let [task-id (t2/insert-returning-pk! :model/RemoteSyncTask {:sync_task_type task-type
                                                                :initiated_by   (mt/user->id :rasta)})
        result  (f task-id)]
    (remote-sync.task/complete-sync-task! task-id)
    result))

(defn- sync!
  "Run `f` with a new sync task of `task-type`, check that it succeeds, and complete the task."
  [task-type f]
  (let [result (run-sync! task-type f)]
    (is (= :success (:status result)) (pr-str result))
    result))

(defn- export-tree!
  "Pushes the synced content of the app DB to an empty repository, and returns the files of the repository."
  []
  (let [src (test-helpers/versioned-source :trees {"empty" {}} :current "empty")]
    (sync! "export" #(impl/export! (source.p/snapshot src) % "initial" :force? true))
    (tree (source.p/snapshot src))))

(defn- pull-base!
  "Force-pulls the files `t0` as the version \"v0\", so that the ledger records them as the last sync."
  [t0]
  (sync! "import" #(impl/import! (source.p/snapshot (test-helpers/versioned-source :trees {"v0" t0} :current "v0"))
                                 % :force? true)))

(defn- merge-pull!
  "Merge-pulls the files `t1` as the version \"v1\" over the base `t0` (the version \"v0\"). Calls `(on-report
  fraction)` before each progress report. Returns `{:src :result :loaded}`: `loaded` is the set of `[model id]` of
  the entities that the pull loaded."
  [t0 t1 & {:keys [on-report] :or {on-report (constantly nil)}}]
  (let [src  (test-helpers/versioned-source :trees {"v0" t0 "v1" t1} :current "v1")
        real (mt/original-fn #'impl/import-progress-reporter)
        [result loaded]
        (mt/with-dynamic-fn-redefs [impl/import-progress-reporter (fn [task-id]
                                                                    (let [report (real task-id)]
                                                                      (fn [fraction & opts]
                                                                        (on-report fraction)
                                                                        (apply report fraction opts))))]
          (test-helpers/loaded-entities
           #(run-sync! "import" (fn [task-id]
                                  (impl/import! (source.p/snapshot src) task-id
                                                :merge? true :base-snapshot (source.p/snapshot-at src "v0"))))))]
    {:src src :result result :loaded loaded}))

(defn- once-at!
  "A function of a progress fraction that calls `f` the first time the fraction is `fraction`."
  [fraction f]
  (let [done (atom false)]
    (fn [x]
      (when (and (= fraction x) (compare-and-set! done false true))
        (f)))))

(defn- path-of
  "The path of the file in `t` whose `name:` is `entity-name`."
  [t entity-name]
  (some (fn [[p c]] (when (str/includes? c (str "name: " entity-name "\n")) p)) t))

(defn- edit
  "`t` with the description \"original\" of the card `card-name` replaced by `text`."
  [t card-name text]
  (update t (path-of t card-name) str/replace "description: original" (str "description: " text)))

(defn- save!
  "Set the description of the card `card-id` and publish its update event, as a save from the card API does."
  [card-id description]
  (t2/update! :model/Card card-id {:description description})
  (let [card (t2/select-one :model/Card card-id)]
    (events/publish-event! :event/card-update {:object card :previous-object card :user-id (mt/user->id :rasta)})))

(defn- row
  "The `:status` and `:file_path` of the ledger row of the entity `model-type` `id`."
  [model-type id]
  (t2/select-one [:model/RemoteSyncObject :status :file_path] :model_type model-type :model_id id))

(defn- entity-key
  "The `[model entity-id]` of the entity `model-key` `id`."
  [model-key id]
  [(name model-key) (t2/select-one-fn :entity_id model-key :id id)])

(defn- venues-query
  "An MBQL query of the venues table of the test data."
  []
  (let [mp (mt/metadata-provider)]
    (lib/query mp (lib.metadata/table mp (mt/id :venues)))))

(defmacro ^:private with-sync-settings
  "Run `body` with read-write remote sync, and with no search reindex."
  [& body]
  `(mt/with-temporary-setting-values [~'remote-sync-enabled true ~'remote-sync-type :read-write]
     (mt/with-dynamic-fn-redefs [search/reindex! (constantly nil)]
       ~@body)))

;;; ------------------------------------------- a save during a merge pull -------------------------------------------

(defn- do-with-synced-cards!
  "Two synced cards A and B with the description \"original\", pushed and pulled as the version \"v0\". Calls
  `(f {:a :b :t0})`."
  [f]
  (with-sync-settings
    (mt/with-temp [:model/Collection {coll-id :id} {:name "Merge Test" :is_remote_synced true :location "/"}
                   :model/Card {a :id} {:name "Card A" :description "original" :collection_id coll-id}
                   :model/Card {b :id} {:name "Card B" :description "original" :collection_id coll-id}]
      (let [t0 (export-tree!)]
        (pull-base! t0)
        (f {:a a :b b :t0 t0})))))

(deftest save-after-the-load-of-a-merge-pull-stays-dirty-test
  (testing "A user saves card A after the load of a merge pull and before its ledger transaction. The remote changed
            only card B. After the pull, A stays dirty, so the next push sends the edit."
    (do-with-synced-cards!
     (fn [{:keys [a t0]}]
       (let [{:keys [src result]} (merge-pull! t0 (edit t0 "Card B" "remote edit B")
                                               :on-report (once-at! 0.75 #(save! a "edit during pull")))]
         (is (= :success (:status result)) (pr-str result))
         (is (= "edit during pull" (t2/select-one-fn :description :model/Card a)))
         (is (= "update" (:status (row "Card" a))) "the save during the pull keeps the row dirty")
         (let [push (sync! "export" #(impl/export! (source.p/snapshot src) % "push" :source src))]
           (is (= :success (:status push)) (pr-str push))
           (is (str/includes? (str (get (tree (source.p/snapshot src)) (path-of t0 "Card A")))
                              "description: edit during pull")
               "the push sends the edit")))))))

(deftest save-during-the-load-of-an-unchanged-entity-is-not-overwritten-test
  (testing "A user saves card A at the start of the load of a merge pull. The remote changed only card B. The pull
            loads only B, so A keeps the edit and stays dirty."
    (do-with-synced-cards!
     (fn [{:keys [a b t0]}]
       (let [{:keys [result loaded]} (merge-pull! t0 (edit t0 "Card B" "remote edit B")
                                                  :on-report (once-at! 0.05 #(save! a "edit during pull")))]
         (is (= :success (:status result)) (pr-str result))
         (is (= #{(entity-key :model/Card b)} loaded) "the pull loads only the remote change")
         (is (= "remote edit B" (t2/select-one-fn :description :model/Card b)))
         (is (= "edit during pull" (t2/select-one-fn :description :model/Card a)))
         (is (= "update" (:status (row "Card" a)))))))))

;;; ------------------------------------- a remote delete and the delete closure -------------------------------------

(deftest remote-model-delete-with-a-local-new-action-reports-a-conflict-test
  (testing "The local side adds an action to model M and does not push. The remote deletes M. The merge pull reports
            a conflict and keeps the model and the action."
    (with-sync-settings
      (mt/with-temp [:model/Collection {coll-id :id} {:name "Merge Test" :is_remote_synced true :location "/"}
                     :model/Card {model-id :id} {:name "Model M" :type :model :collection_id coll-id
                                                 :dataset_query (venues-query)}]
        (let [t0        (export-tree!)
              _         (pull-base! t0)
              action-id (t2/insert-returning-pk! :model/Action {:name "New action" :type :query :model_id model-id})
              _         (t2/insert! :model/QueryAction {:action_id     action-id
                                                        :dataset_query (mt/native-query {:query "select 1"})})
              _         (events/publish-event! :event/action-create {:object  (t2/select-one :model/Action action-id)
                                                                     :user-id (mt/user->id :rasta)})
              {:keys [result loaded]} (merge-pull! t0 (dissoc t0 (path-of t0 "Model M")))]
          (is (= :conflict (:status result)) (pr-str result))
          (is (some #(str/includes? % "New action") (:conflicts result)) (pr-str (:conflicts result)))
          (is (empty? loaded) "a conflict loads nothing")
          (is (t2/exists? :model/Card model-id) "a conflict deletes nothing")
          (is (t2/exists? :model/Action action-id) "the new action stays")
          (is (= "create" (:status (row "Action" action-id)))))))))

(defn- do-with-synced-model-and-action!
  "A synced model M with the action \"Old action\", pushed and pulled as the version \"v0\". Calls
  `(f {:model-id :action-id :t0})`."
  [f]
  (with-sync-settings
    (mt/with-temp [:model/Collection {coll-id :id} {:name "Merge Test" :is_remote_synced true :location "/"}
                   :model/Card {model-id :id} {:name "Model M" :type :model :collection_id coll-id
                                               :dataset_query (venues-query)}
                   :model/Action {action-id :id} {:name "Old action" :type :query :model_id model-id}
                   :model/QueryAction _ {:action_id action-id :dataset_query (mt/native-query {:query "select 1"})}]
      (let [t0 (export-tree!)]
        (pull-base! t0)
        (f {:model-id model-id :action-id action-id :t0 t0})))))

(deftest remote-model-delete-with-an-unchanged-action-file-deletes-the-action-test
  (testing "The remote deletes model M and keeps the file of its action, which nobody changed (the decision keep). The
            merge pull deletes the model and the action and their rows, with no conflict."
    (do-with-synced-model-and-action!
     (fn [{:keys [model-id action-id t0]}]
       (let [{:keys [result]} (merge-pull! t0 (dissoc t0 (path-of t0 "Model M")))]
         (is (= :success (:status result)) (pr-str result))
         (is (not (t2/exists? :model/Card model-id)))
         (is (not (t2/exists? :model/Action action-id)))
         (is (nil? (row "Action" action-id))))))))

(defn- file-spec-of
  "The file spec (`:path` and `:content`) of the local entity `model-type` `id`."
  [model-type id]
  (source/entity->file-spec (source/storage-context)
                            (first (spec/extract-entities-for-rows [{:model_type model-type :model_id id}]))))

(deftest remote-model-delete-with-the-same-action-edit-on-both-sides-reports-a-conflict-test
  (testing "Both sides make the same edit to the action of model M, and the remote deletes M (the decision of the
            action is same). The merge pull reports a conflict and keeps the action."
    (do-with-synced-model-and-action!
     (fn [{:keys [model-id action-id t0]}]
       (t2/update! :model/Action action-id {:description "same edit"})
       (events/publish-event! :event/action-update {:object  (t2/select-one :model/Action action-id)
                                                    :user-id (mt/user->id :rasta)})
       (let [{:keys [path content]} (file-spec-of "Action" action-id)
             {:keys [result loaded]} (merge-pull! t0 (-> t0 (dissoc (path-of t0 "Model M")) (assoc path content)))]
         (is (contains? t0 path) "the edit does not move the file of the action")
         (is (= :conflict (:status result)) (pr-str result))
         (is (empty? loaded))
         (is (t2/exists? :model/Card model-id))
         (is (t2/exists? :model/Action action-id)))))))

(deftest remote-model-delete-with-a-locally-archived-action-deletes-the-action-test
  (testing "The user archives the action of model M, so the action is not in the local side of the merge. The remote
            deletes M and keeps the file of the action. The merge pull deletes the model and the action and their
            rows, with no conflict."
    (do-with-synced-model-and-action!
     (fn [{:keys [model-id action-id t0]}]
       (t2/update! :model/Action action-id {:archived true})
       (events/publish-event! :event/action-update {:object  (t2/select-one :model/Action action-id)
                                                    :user-id (mt/user->id :rasta)})
       (let [{:keys [result]} (merge-pull! t0 (dissoc t0 (path-of t0 "Model M")))]
         (is (= :success (:status result)) (pr-str result))
         (is (not (t2/exists? :model/Card model-id)))
         (is (not (t2/exists? :model/Action action-id)))
         (is (nil? (row "Action" action-id))))))))

(defn- insert-card!
  "Insert the card `card-name` with `columns`, and publish its create event, as a save from the card API does.
  Returns its id."
  [card-name columns]
  (let [card-id (t2/insert-returning-pk! :model/Card (merge {:name                   card-name
                                                             :display                :table
                                                             :dataset_query          (venues-query)
                                                             :visualization_settings {}
                                                             :creator_id             (mt/user->id :rasta)}
                                                            columns))]
    (events/publish-event! :event/card-create {:object (t2/select-one :model/Card card-id) :user-id (mt/user->id :rasta)})
    card-id))

(deftest remote-dashboard-delete-with-a-local-new-dashboard-question-reports-a-conflict-test
  (testing "The local side adds a question to dashboard D and does not push. The remote deletes D. The merge pull
            reports a conflict and keeps the dashboard and the question."
    (with-sync-settings
      (mt/with-temp [:model/Collection {coll-id :id} {:name "Merge Test" :is_remote_synced true :location "/"}
                     :model/Dashboard {dash-id :id} {:name "Dash D" :collection_id coll-id}
                     :model/Card _ {:name "Card A" :collection_id coll-id}]
        (let [t0   (export-tree!)
              _    (pull-base! t0)
              q-id (insert-card! "New question" {:collection_id coll-id :dashboard_id dash-id})
              {:keys [result loaded]} (merge-pull! t0 (dissoc t0 (path-of t0 "Dash D")))]
          (is (= :conflict (:status result)) (pr-str result))
          (is (some #(str/includes? % "New question") (:conflicts result)) (pr-str (:conflicts result)))
          (is (empty? loaded))
          (is (t2/exists? :model/Dashboard dash-id))
          (is (t2/exists? :model/Card q-id))
          (is (= "create" (:status (row "Card" q-id)))))))))

(deftest remote-document-delete-with-a-local-new-document-card-reports-a-conflict-test
  (testing "The local side adds a card to document Doc and does not push. The remote deletes Doc. The merge pull
            reports a conflict and keeps the document and the card."
    (with-sync-settings
      (mt/with-temp [:model/Collection {coll-id :id} {:name "Merge Test" :is_remote_synced true :location "/"}
                     :model/Document {doc-id :id} {:name "Doc D" :collection_id coll-id}
                     :model/Card _ {:name "Card A" :collection_id coll-id}]
        (let [t0      (export-tree!)
              _       (pull-base! t0)
              card-id (insert-card! "New doc card" {:collection_id coll-id :document_id doc-id})
              {:keys [result loaded]} (merge-pull! t0 (dissoc t0 (path-of t0 "Doc D")))]
          (is (= :conflict (:status result)) (pr-str result))
          (is (some #(str/includes? % "New doc card") (:conflicts result)) (pr-str (:conflicts result)))
          (is (empty? loaded))
          (is (t2/exists? :model/Document doc-id))
          (is (t2/exists? :model/Card card-id))
          (is (= "create" (:status (row "Card" card-id)))))))))

(deftest remote-model-delete-with-an-unchanged-action-deletes-both-test
  (testing "The remote deletes model M and its action, which nobody changed locally. The merge pull deletes both and
            their ledger rows, and keeps a local edit of another card."
    (with-sync-settings
      (mt/with-temp [:model/Collection {coll-id :id} {:name "Merge Test" :is_remote_synced true :location "/"}
                     :model/Card {model-id :id} {:name "Model M" :type :model :collection_id coll-id
                                                 :dataset_query (venues-query)}
                     :model/Action {action-id :id} {:name "Old action" :type :query :model_id model-id}
                     :model/QueryAction _ {:action_id action-id :dataset_query (mt/native-query {:query "select 1"})}
                     :model/Card {card-id :id} {:name "Card A" :description "original" :collection_id coll-id}]
        (let [t0 (export-tree!)
              _  (pull-base! t0)
              _  (save! card-id "local edit")
              {:keys [result loaded]} (merge-pull! t0 (dissoc t0 (path-of t0 "Model M") (path-of t0 "Old action")))]
          (is (= :success (:status result)) (pr-str result))
          (is (empty? loaded))
          (is (not (t2/exists? :model/Card model-id)))
          (is (not (t2/exists? :model/Action action-id)))
          (is (nil? (row "Card" model-id)))
          (is (nil? (row "Action" action-id)))
          (is (= "local edit" (t2/select-one-fn :description :model/Card card-id)))
          (is (= "update" (:status (row "Card" card-id)))))))))

;;; --------------------------------- each kind of change that has no incremental pull ---------------------------------

(def ^:private sales-eid "w8YkMQBwU4kOD0-pZ1nJk")

(defn- app-files
  "The repository files of the data app `sales`: a minimal data_app.yaml and its bundle."
  [bundle]
  {"data_apps/sales/data_app.yaml"
   (yaml/generate-string {:serdes/meta [{:model "DataApp" :id sales-eid :label "sales"}]
                          :entity_id   sales-eid
                          :slug        "sales"
                          :name        "Sales"
                          :path        "dist/index.js"})
   "data_apps/sales/dist/index.js" bundle})

(deftest merge-pull-of-a-remote-resource-file-change-loads-its-unit-test
  (testing "The remote changes only the bundle (a resource file) of a data app. The merge pull loads the data app
            with its bundle from the tip, and nothing else."
    (mt/with-premium-features #{:data-apps}
      (with-sync-settings
        (mt/with-temp [:model/Collection {coll-id :id} {:name "Merge Test" :is_remote_synced true :location "/"}
                       :model/Card _ {:name "Card A" :collection_id coll-id}]
          (mt/with-model-cleanup [:model/DataApp :model/PermissionsGroup]
            (let [t0     (merge (export-tree!) (app-files "BUNDLE-V1"))
                  _      (pull-base! t0)
                  {:keys [result loaded]} (merge-pull! t0 (merge t0 (app-files "BUNDLE-V2")))
                  app-id (t2/select-one-pk :model/DataApp :name "sales")]
              (is (= :success (:status result)) (pr-str result))
              (is (= #{["DataApp" sales-eid]} loaded))
              (is (= "BUNDLE-V2" (String. ^bytes (t2/select-one-fn :bundle :model/DataApp :id app-id) "UTF-8")))
              (is (= {:status "synced" :file_path "data_apps/sales/data_app.yaml"} (row "DataApp" app-id)))
              (is (= (source/row->content-hash {:model_type "DataApp" :model_id app-id})
                     (t2/select-one-fn :content_hash :model/RemoteSyncObject :model_type "DataApp" :model_id app-id))
                  "the row has the hash of the app with its bundle"))))))))

(deftest merge-pull-sets-the-transforms-setting-from-the-merged-set-test
  (testing "The remote adds a transform while the transforms setting is off. The merge pull loads the transform only,
            and turns the setting on."
    (mt/with-premium-features #{:transforms-basic}
      (with-sync-settings
        (mt/with-temporary-setting-values [remote-sync-transforms false]
          (mt/with-temp [:model/Collection {coll-id :id} {:name "Merge Test" :is_remote_synced true :location "/"}
                         :model/Card _ {:name "Card A" :collection_id coll-id}]
            (let [eid "remote-transform-xxxx"
                  t0  (export-tree!)
                  _   (pull-base! t0)
                  {:keys [result loaded]} (merge-pull! t0 (assoc t0 "collections/transforms/remote_transform.yaml"
                                                                 (test-helpers/generate-transform-yaml eid "Remote Transform")))]
              (is (= :success (:status result)) (pr-str result))
              (is (= #{["Transform" eid]} loaded))
              (is (t2/exists? :model/Transform :entity_id eid))
              (is (true? (settings/remote-sync-transforms)))
              (is (= {:status "synced" :file_path "collections/transforms/remote_transform.yaml"}
                     (row "Transform" (t2/select-one-pk :model/Transform :entity_id eid)))))))))))

(deftest merge-pull-of-a-remote-feature-model-change-test
  (testing "The remote renames a transform and moves its file. The merge pull loads the transform only, and its row
            gets the tip path."
    (mt/with-premium-features #{:transforms-basic}
      (with-sync-settings
        (mt/with-temporary-setting-values [remote-sync-transforms true]
          (mt/with-temp [:model/Collection {coll-id :id} {:name "Merge Test" :is_remote_synced true :location "/"}
                         :model/Card _ {:name "Card A" :collection_id coll-id}
                         :model/Transform {transform-id :id} {:name "Root Transform" :collection_id nil}]
            (let [t0   (export-tree!)
                  _    (pull-base! t0)
                  path (path-of t0 "Root Transform")
                  t1   (-> t0
                           (dissoc path)
                           (assoc "collections/transforms/renamed_transform.yaml"
                                  (str/replace (get t0 path) "name: Root Transform" "name: Renamed Transform")))
                  {:keys [result loaded]} (merge-pull! t0 t1)]
              (is (= "collections/transforms/root_transform.yaml" path))
              (is (= :success (:status result)) (pr-str result))
              (is (= #{(entity-key :model/Transform transform-id)} loaded))
              (is (= "Renamed Transform" (t2/select-one-fn :name :model/Transform :id transform-id)))
              (is (= {:status "synced" :file_path "collections/transforms/renamed_transform.yaml"}
                     (row "Transform" transform-id))))))))))

(deftest merge-pull-of-a-remote-table-file-change-test
  (testing "The remote edits the file of a published table. The merge pull loads the table only; serdes finds the
            local table by its path."
    (with-sync-settings
      (mt/with-temp [:model/Database   {db-id :id}    {:name "merge-pull-db"}
                     :model/Collection {coll-id :id}  {:name "Merge Test" :is_remote_synced true :location "/"}
                     :model/Table      {table-id :id} {:name "Orders" :db_id db-id :is_published true :collection_id coll-id}
                     :model/Field      _              {:name "F1" :table_id table-id :base_type :type/Text}
                     :model/Card       _              {:name "Card A" :collection_id coll-id}]
        (t2/insert! :model/TableUserSettings {:table_id table-id :display_name "Local Name"})
        (let [t0   (export-tree!)
              path (some (fn [[p c]] (when (str/includes? c "Local Name") p)) t0)
              _    (pull-base! t0)
              {:keys [result loaded]} (merge-pull! t0 (update t0 path str/replace "Local Name" "Remote Name"))]
          (is (some? path))
          (is (= :success (:status result)) (pr-str result))
          (is (= #{((juxt :model :id) (last (:serdes/meta (yaml/parse-string (get t0 path)))))} loaded)
              "the pull loads only the entity of the table file")
          (is (= "Remote Name" (t2/select-one-fn :display_name :model/TableUserSettings :table_id table-id))))))))

(defn- rename-collection
  "`t` with the collection file `collections/main/<from>.yaml` and the files under `collections/main/<from>/` moved to
  `<to>`, and the name of the collection set to `to-name`."
  [t from to to-name]
  (into {}
        (map (fn [[p c]]
               (cond
                 (= p (str "collections/main/" from ".yaml"))
                 [(str "collections/main/" to ".yaml")
                  (-> c
                      (str/replace #"(?m)^name: .*$" (str "name: " to-name))
                      (str/replace (str "slug: " from) (str "slug: " to))
                      (str/replace (str "label: " from) (str "label: " to)))]

                 (str/starts-with? p (str "collections/main/" from "/"))
                 [(str "collections/main/" to "/" (subs p (count (str "collections/main/" from "/")))) c]

                 :else
                 [p c])))
        t))

(deftest merge-pull-of-a-remote-collection-rename-test
  (testing "The remote renames a collection, which moves the files of its cards. The merge pull loads the collection
            and its cards with their tip paths, and nothing else."
    (with-sync-settings
      (mt/with-temp [:model/Collection {alpha :id} {:name "Alpha" :is_remote_synced true :location "/"}
                     :model/Card {a :id} {:name "Card A" :collection_id alpha}
                     :model/Collection {beta :id} {:name "Beta" :is_remote_synced true :location "/"}
                     :model/Card {b :id} {:name "Card B" :description "original" :collection_id beta}]
        (let [t0 (export-tree!)
              _  (pull-base! t0)
              _  (save! b "local edit")
              {:keys [result loaded]} (merge-pull! t0 (rename-collection t0 "alpha" "gamma" "Gamma"))]
          (is (contains? t0 "collections/main/alpha/card_a.yaml"))
          (is (= :success (:status result)) (pr-str result))
          (is (= #{(entity-key :model/Collection alpha) (entity-key :model/Card a)} loaded))
          (is (= "Gamma" (t2/select-one-fn :name :model/Collection :id alpha)))
          (is (= {:status "synced" :file_path "collections/main/gamma.yaml"} (row "Collection" alpha)))
          (is (= {:status "synced" :file_path "collections/main/gamma/card_a.yaml"} (row "Card" a)))
          (is (= {:status "update" :file_path "collections/main/beta/card_b.yaml"} (row "Card" b))
              "the row of the local edit does not change"))))))

(deftest merge-pull-of-a-remote-collection-delete-test
  (testing "The remote deletes a collection and its card. The merge pull deletes both and their rows, loads nothing,
            and keeps the other collection."
    (with-sync-settings
      (mt/with-temp [:model/Collection {alpha :id} {:name "Alpha" :is_remote_synced true :location "/"}
                     :model/Card {a :id} {:name "Card A" :description "original" :collection_id alpha}
                     :model/Collection {beta :id} {:name "Beta" :is_remote_synced true :location "/"}
                     :model/Card {b :id} {:name "Card B" :collection_id beta}]
        (let [t0 (export-tree!)
              _  (pull-base! t0)
              _  (save! a "local edit")
              t1 (into {} (remove (fn [[p _]] (str/starts-with? p "collections/main/beta"))) t0)
              {:keys [result loaded]} (merge-pull! t0 t1)]
          (is (contains? t0 "collections/main/beta.yaml"))
          (is (= :success (:status result)) (pr-str result))
          (is (empty? loaded))
          (is (not (t2/exists? :model/Collection :id beta)))
          (is (not (t2/exists? :model/Card :id b)))
          (is (nil? (row "Collection" beta)))
          (is (nil? (row "Card" b)))
          (is (= "local edit" (t2/select-one-fn :description :model/Card a)))
          (is (= "update" (:status (row "Card" a)))))))))

(defn- without-beta
  "`t` with no file of the collection `collections/main/beta` or of its contents."
  [t]
  (into {} (remove (fn [[p _]] (str/starts-with? p "collections/main/beta"))) t))

(deftest local-new-card-in-a-remote-deleted-collection-reports-a-conflict-test
  (testing "The local side adds card C to collection Beta and does not push. The remote deletes Beta and its synced card
            B. The merge pull reports a conflict and keeps Beta, B, C and the row of C."
    (with-sync-settings
      (mt/with-temp [:model/Collection {alpha :id} {:name "Alpha" :is_remote_synced true :location "/"}
                     :model/Card _ {:name "Card A" :collection_id alpha}
                     :model/Collection {beta :id} {:name "Beta" :is_remote_synced true :location "/"}
                     :model/Card {b :id} {:name "Card B" :collection_id beta}]
        (let [t0   (export-tree!)
              _    (pull-base! t0)
              c-id (insert-card! "New card C" {:collection_id beta})
              {:keys [result loaded]} (merge-pull! t0 (without-beta t0))]
          (is (= :conflict (:status result)) (pr-str result))
          (is (some #(str/includes? % "New card C") (:conflicts result)) (pr-str (:conflicts result)))
          (is (empty? loaded))
          (is (t2/exists? :model/Collection :id beta))
          (is (t2/exists? :model/Card :id b))
          (is (t2/exists? :model/Card :id c-id))
          (is (= "create" (:status (row "Card" c-id)))))))))

(deftest local-new-card-in-a-sub-collection-of-a-remote-deleted-collection-reports-a-conflict-test
  (testing "The local side adds card C to collection Gamma, a child of collection Beta. The remote deletes Beta and
            Gamma. The merge pull reports a conflict and keeps both collections and C."
    (with-sync-settings
      (mt/with-temp [:model/Collection {alpha :id} {:name "Alpha" :is_remote_synced true :location "/"}
                     :model/Card _ {:name "Card A" :collection_id alpha}
                     :model/Collection {beta :id} {:name "Beta" :is_remote_synced true :location "/"}
                     :model/Collection {gamma :id} {:name "Gamma" :is_remote_synced true :location (str "/" beta "/")}
                     :model/Card _ {:name "Card G" :collection_id gamma}]
        (let [t0   (export-tree!)
              _    (pull-base! t0)
              c-id (insert-card! "New card C" {:collection_id gamma})
              {:keys [result loaded]} (merge-pull! t0 (without-beta t0))]
          (is (some #(str/starts-with? % "collections/main/beta/") (keys t0)) "Gamma is under the directory of Beta")
          (is (= :conflict (:status result)) (pr-str result))
          (is (some #(str/includes? % "New card C") (:conflicts result)) (pr-str (:conflicts result)))
          (is (empty? loaded))
          (is (t2/exists? :model/Collection :id beta))
          (is (t2/exists? :model/Collection :id gamma))
          (is (t2/exists? :model/Card :id c-id))
          (is (= "create" (:status (row "Card" c-id)))))))))

(defn- card-added-in-a-remote-deleted-collection!
  "Collections Alpha (with card A) and Beta (with card B) are synced as the version v0. The remote edits A and deletes
  Beta and B. The user adds card C to Beta at `at`: `:before-the-pre-check` (after the merge read ours) or
  `:after-the-load` (before the reconcile). Returns `{:result :a :c-exists? :beta-exists? :c-row}`: `:a` is the
  description of A after the pull."
  [at]
  (with-sync-settings
    (mt/with-temp [:model/Collection {alpha :id} {:name "Alpha" :is_remote_synced true :location "/"}
                   :model/Card {a :id} {:name "Card A" :description "original" :collection_id alpha}
                   :model/Collection {beta :id} {:name "Beta" :is_remote_synced true :location "/"}
                   :model/Card _ {:name "Card B" :collection_id beta}]
      (mt/with-model-cleanup [:model/Card]
        (let [t0    (export-tree!)
              _     (pull-base! t0)
              c-id  (atom nil)
              add!  #(reset! c-id (insert-card! "New card C" {:collection_id beta}))
              real  (mt/original-fn #'save-rule/pre-check!)
              {:keys [result]}
              (mt/with-dynamic-fn-redefs [save-rule/pre-check! (fn [& args]
                                                                 (when (= :before-the-pre-check at) (add!))
                                                                 (apply real args))]
                (merge-pull! t0 (-> t0 without-beta (edit "Card A" "remote edit A"))
                             :on-report (once-at! 0.75 #(when (= :after-the-load at) (add!)))))]
          {:result       result
           :a            (t2/select-one-fn :description :model/Card a)
           :c-exists?    (t2/exists? :model/Card :id @c-id)
           :beta-exists? (t2/exists? :model/Collection :id beta)
           :c-row        (row "Card" @c-id)})))))

(deftest card-added-in-a-remote-deleted-collection-during-the-pull-stops-the-pull-test
  (testing "The remote edits card A and deletes collection Beta and its card. During the pull, the user adds card C to
            Beta. The merge did not see C, so the pull stops. Beta and C stay, and A keeps its text of the last sync."
    (doseq [at [:before-the-pre-check :after-the-load]]
      (testing at
        (let [{:keys [result a c-exists? beta-exists? c-row]} (card-added-in-a-remote-deleted-collection! at)]
          (is (= :conflict (:status result)) (pr-str result))
          (is (= ["New card C"] (:conflicts result)) "the conflict names the new card")
          (is (= (str "Import blocked: content was added locally during the pull under content that the remote "
                      "branch deleted. Your local change is kept.")
                 (:message result)))
          (is c-exists? "the new card stays")
          (is beta-exists? "Beta stays")
          (is (= "create" (:status c-row)))
          (is (= "original" a) "A has its text of the last sync"))))))

(deftest remote-delete-of-a-collection-with-unchanged-contents-deletes-all-test
  (testing "The remote deletes collection Beta, its child collection Gamma and their contents, which nobody changed
            locally. The merge pull deletes all of them and their rows, and keeps a local edit in collection Alpha."
    (with-sync-settings
      (mt/with-temp [:model/Collection {alpha :id} {:name "Alpha" :is_remote_synced true :location "/"}
                     :model/Card {a :id} {:name "Card A" :description "original" :collection_id alpha}
                     :model/Collection {beta :id} {:name "Beta" :is_remote_synced true :location "/"}
                     :model/Card {b :id} {:name "Card B" :collection_id beta}
                     :model/Dashboard {dash-id :id} {:name "Dash D" :collection_id beta}
                     :model/Collection {gamma :id} {:name "Gamma" :is_remote_synced true :location (str "/" beta "/")}
                     :model/Card {g :id} {:name "Card G" :collection_id gamma}]
        (let [t0 (export-tree!)
              _  (pull-base! t0)
              _  (save! a "local edit")
              {:keys [result loaded]} (merge-pull! t0 (without-beta t0))]
          (is (= :success (:status result)) (pr-str result))
          (is (empty? loaded))
          (is (not-any? #(t2/exists? :model/Collection :id %) [beta gamma]))
          (is (not-any? #(t2/exists? :model/Card :id %) [b g]))
          (is (not (t2/exists? :model/Dashboard :id dash-id)))
          (is (= #{}
                 (set (t2/select-fn-set (juxt :model_type :model_id) :model/RemoteSyncObject
                                        {:where [:or
                                                 [:and [:= :model_type "Collection"] [:in :model_id [beta gamma]]]
                                                 [:and [:= :model_type "Card"] [:in :model_id [b g]]]
                                                 [:and [:= :model_type "Dashboard"] [:= :model_id dash-id]]]})))
              "no row of a deleted entity stays")
          (is (= "local edit" (t2/select-one-fn :description :model/Card a)))
          (is (= "update" (:status (row "Card" a)))))))))

;;; ------------------------------ an archived card in a remote-deleted collection ------------------------------

(defn- archive!
  "Archive the card `card-id` and publish its update event, as an archive from the card API does."
  [card-id]
  (t2/update! :model/Card card-id {:archived true})
  (let [card (t2/select-one :model/Card card-id)]
    (events/publish-event! :event/card-update {:object card :previous-object card :user-id (mt/user->id :rasta)})))

(defn- do-with-archived-card-in-beta!
  "Synced collections Alpha (with card X) and Beta (with cards A and B), pushed and pulled as the version \"v0\". The
  user then archives A and does not push. Calls `(f {:a :b :beta :t0})`."
  [f]
  (with-sync-settings
    (mt/with-temp [:model/Collection {alpha :id} {:name "Alpha" :is_remote_synced true :location "/"}
                   :model/Card _ {:name "Card X" :collection_id alpha}
                   :model/Collection {beta :id} {:name "Beta" :is_remote_synced true :location "/"}
                   :model/Card {a :id} {:name "Card A" :collection_id beta}
                   :model/Card {b :id} {:name "Card B" :collection_id beta}]
      (let [t0 (export-tree!)]
        (pull-base! t0)
        (archive! a)
        (is (= {:status "delete" :file_path (path-of t0 "Card A")} (row "Card" a))
            "precondition: the archive marks the row of A")
        (f {:a a :b b :beta beta :t0 t0})))))

(deftest remote-delete-and-revert-of-a-collection-with-a-locally-archived-card-test
  (testing "The user archives card A in collection Beta and does not push. The remote deletes Beta, and later reverts
            the delete. The delete of Beta removes A, so the row of A goes too. After the revert, a push keeps the file
            of A, which the local side has again."
    (do-with-archived-card-in-beta!
     (fn [{:keys [a beta t0]}]
       (let [a-path           (path-of t0 "Card A")
             t1               (without-beta t0)
             {:keys [result]} (merge-pull! t0 t1)]
         (is (= :success (:status result)) (pr-str result))
         (is (not (t2/exists? :model/Collection :id beta)))
         (is (not (t2/exists? :model/Card :id a)) "the delete of Beta removes the archived card A")
         (is (nil? (row "Card" a)) "the row of A goes with A")
         ;; The remote reverts the delete of Beta. The version names differ from those of the first pull, because a
         ;; pull of the last synced version does nothing.
         (let [src (test-helpers/versioned-source :trees {"v1" t1 "v2" t0} :current "v2")
               _   (sync! "import" #(impl/import! (source.p/snapshot src) % :merge? true
                                                  :base-snapshot (source.p/snapshot-at src "v1")))
               a2  (t2/select-one-pk :model/Card :name "Card A" :archived false)]
           (is (some? a2) "the revert loads card A again")
           (is (= #{a2} (t2/select-fn-set :model_id :model/RemoteSyncObject :model_type "Card" :file_path a-path))
               "only the row of the new card A has the path of A")
           (sync! "export" #(impl/export! (source.p/snapshot src) % "push" :source src))
           (is (contains? (tree (source.p/snapshot src)) a-path) "the push keeps the file of card A")
           (is (= {:status "synced" :file_path a-path} (row "Card" a2)))))))))

(deftest remote-delete-of-a-collection-removes-its-archived-card-from-search-test
  (testing "The user archives card A in collection Beta. The remote deletes Beta. The delete of Beta removes A, so the
            search entry of A goes too."
    (search.tu/with-appdb-search-if-available*
      (do-with-archived-card-in-beta!
       (fn [{:keys [a b t0]}]
         ((mt/original-fn #'search/reindex!) {:async? false :in-place? true})
         (let [entry? (fn [id] (t2/exists? (search.index/active-table) :model "card" :model_id (str id)))]
           (is (entry? a) "precondition: the archived card A is in the search index")
           (is (entry? b) "precondition: card B is in the search index")
           (let [{:keys [result]} (merge-pull! t0 (without-beta t0))]
             (is (= :success (:status result)) (pr-str result))
             (is (not (t2/exists? :model/Card :id a)))
             (is (not (entry? b)) "the search entry of the deleted card B goes")
             (is (not (entry? a)) "the search entry of the removed card A goes"))))))))

;;; ---------------------------- untracked content in a remote-deleted collection ----------------------------

(deftest remote-delete-of-a-collection-keeps-an-exploration-summary-document-test
  (testing "Collection Beta holds an exploration and its Summary document, which remote sync does not track. The remote
            deletes Beta. The merge pull keeps the document, as the full import does."
    (with-sync-settings
      (mt/with-temp [:model/Collection {alpha :id} {:name "Alpha" :is_remote_synced true :location "/"}
                     :model/Card _ {:name "Card X" :collection_id alpha}
                     :model/Collection {beta :id} {:name "Beta" :is_remote_synced true :location "/"}
                     :model/Card _ {:name "Card B" :collection_id beta}
                     :model/Exploration {explo :id} {:name "Explo" :creator_id (mt/user->id :rasta) :collection_id beta}
                     :model/Document {doc :id} {:name "Explo summary" :creator_id (mt/user->id :rasta)
                                                :collection_id beta :exploration_id explo}]
        (let [t0 (export-tree!)
              _  (pull-base! t0)
              {:keys [result]} (merge-pull! t0 (without-beta t0))]
          (is (not-any? #(str/includes? % "Explo summary") (vals t0)) "precondition: the push leaves out the document")
          (is (= :success (:status result)) (pr-str result))
          (is (not (t2/exists? :model/Collection :id beta)))
          (is (t2/exists? :model/Exploration :id explo))
          (is (t2/exists? :model/Document :id doc) "the Summary document stays"))))))

;;; ------------------------------------- a remote-deleted transforms collection -------------------------------------

(defn- transforms-collection-delete!
  "A transforms collection TC with transform T is synced as the version v0. The remote deletes TC and T. With
  `add-during?`, the user creates transform U in TC after the load. Returns `{:paths :result :tc? :t? :u?}`: the files of
  TC and T in the tree, the pull result, and whether TC, T and U exist after the pull."
  [add-during?]
  (mt/with-premium-features #{:transforms-basic}
    (with-sync-settings
      (mt/with-temporary-setting-values [remote-sync-transforms true]
        (mt/with-temp [:model/Collection {alpha :id} {:name "Alpha" :is_remote_synced true :location "/"}
                       :model/Card _ {:name "Card A" :collection_id alpha}
                       :model/Collection {tc :id} {:name "TC" :namespace "transforms" :location "/"}
                       :model/Transform {t :id} {:name "Transform T" :collection_id tc}]
          (mt/with-model-cleanup [:model/Transform]
            (let [t0    (export-tree!)
                  _     (pull-base! t0)
                  paths (keep #(path-of t0 %) ["TC" "Transform T"])
                  u-id  (atom nil)
                  add!  #(reset! u-id (t2/insert-returning-pk! :model/Transform
                                                               (merge (t2/select-one [:model/Transform :source :target]
                                                                                     :id t)
                                                                      {:name "Transform U" :collection_id tc})))
                  {:keys [result]} (merge-pull! t0 (apply dissoc t0 paths)
                                                :on-report (once-at! 0.75 #(when add-during? (add!))))]
              {:paths  paths
               :result result
               :tc?    (t2/exists? :model/Collection :id tc)
               :t?     (t2/exists? :model/Transform :id t)
               :u?     (some->> @u-id (t2/exists? :model/Transform :id))})))))))

(deftest remote-delete-of-a-transforms-collection-test
  (testing "The remote deletes transforms collection TC and its transform T. The merge pull deletes both."
    (let [{:keys [paths result tc? t?]} (transforms-collection-delete! false)]
      (is (= 2 (count paths)) "precondition: the tree has the files of TC and T")
      (is (= :success (:status result)) (pr-str result))
      (is (not tc?))
      (is (not t?))))
  (testing "The remote deletes transforms collection TC and its transform T. After the load, the user creates transform
            U in TC. The merge did not see U, so the pull stops, and TC, T and U stay."
    (let [{:keys [result tc? t? u?]} (transforms-collection-delete! true)]
      (is (= :conflict (:status result)) (pr-str result))
      (is (= ["Transform U"] (:conflicts result)))
      (is tc?)
      (is t?)
      (is (true? u?) "the new transform stays"))))

;;; ------------------------------------ a transform test of a remote-deleted transform ------------------------------------

(defn- transform-test-of-a-deleted-transform!
  "A transforms collection TC with transform T and its transform test S is synced as the version v0. The remote deletes
  TC, T and S. Before the pull, the user changes nothing (`:unchanged`), edits S (`:changed`), or adds transform test X
  to T (`:local-new`); or the user adds X after the load (`:during`). Returns the pull result, the description of S,
  whether TC, T, S and X exist after the pull, and the ledger rows of S and X."
  [at]
  (mt/with-premium-features #{:transforms-basic}
    (with-sync-settings
      (mt/with-temporary-setting-values [remote-sync-transforms true]
        (mt/with-temp [:model/Collection    {alpha :id} {:name "Alpha" :is_remote_synced true :location "/"}
                       :model/Card          _           {:name "Card A" :collection_id alpha}
                       :model/Collection    {tc :id}    {:name "TC" :namespace "transforms" :location "/"}
                       :model/Transform     {t :id}     {:name "Transform T" :collection_id tc}
                       :model/TransformTest {s :id}     {:transform_id t :name "Test S" :description "original"}]
          (mt/with-model-cleanup [:model/Transform :model/TransformTest]
            (let [t0    (export-tree!)
                  _     (pull-base! t0)
                  t1    (into {} (remove (fn [[p _]] (str/starts-with? p "collections/transforms/tc"))) t0)
                  x-id  (atom nil)
                  add!  #(reset! x-id (t2/insert-returning-pk! :model/TransformTest
                                                               {:transform_id t
                                                                :name         "Test X"
                                                                :inputs       []
                                                                :expectations []
                                                                :creator_id   (mt/user->id :rasta)}))
                  _     (case at
                          :changed   (t2/update! :model/TransformTest s {:description "local edit"})
                          :local-new (add!)
                          nil)
                  {:keys [result]} (merge-pull! t0 t1 :on-report (once-at! 0.75 #(when (= :during at) (add!))))
                  x-id  @x-id]
              {:paths   (filterv #(str/starts-with? % "collections/transforms/tc") (keys t0))
               :result  result
               :s-desc  (t2/select-one-fn :description :model/TransformTest s)
               :tc?     (t2/exists? :model/Collection :id tc)
               :t?      (t2/exists? :model/Transform :id t)
               :s?      (t2/exists? :model/TransformTest :id s)
               :x?      (some->> x-id (t2/exists? :model/TransformTest :id))
               :s-row   (row "TransformTest" s)
               :x-row   (some->> x-id (row "TransformTest"))})))))))

(deftest remote-delete-of-a-transform-with-a-local-transform-test-test
  (testing "The user adds transform test X to transform T and does not push. The remote deletes T. The merge pull
            reports a conflict on X and keeps T and X."
    (let [{:keys [paths result t? x? x-row]} (transform-test-of-a-deleted-transform! :local-new)]
      (is (= 3 (count paths)) "precondition: the tree has the files of TC, T and S")
      (is (= :conflict (:status result)) (pr-str result))
      (is (some #(str/includes? % "Test X") (:conflicts result)) (pr-str (:conflicts result)))
      (is t?)
      (is (true? x?) "the local transform test stays")
      (is (= "create" (:status x-row)))))
  (testing "The user edits transform test S and does not push. The remote deletes S and its transform T. The merge pull
            reports a conflict and keeps the edit."
    (let [{:keys [result t? s-desc s-row]} (transform-test-of-a-deleted-transform! :changed)]
      (is (= :conflict (:status result)) (pr-str result))
      (is t?)
      (is (= "local edit" s-desc))
      (is (= "update" (:status s-row))))))

(deftest transform-test-added-under-a-remote-deleted-transform-during-the-pull-stops-the-pull-test
  (testing "The remote deletes transform T. After the load, the user adds transform test X to T. The merge did not see
            X, so the pull stops, and T and X stay."
    (let [{:keys [result t? x?]} (transform-test-of-a-deleted-transform! :during)]
      (is (= :conflict (:status result)) (pr-str result))
      (is (= ["Test X"] (:conflicts result)) "the conflict names the new transform test")
      (is (= (str "Import blocked: content was added locally during the pull under content that the remote "
                  "branch deleted. Your local change is kept.")
             (:message result)))
      (is t?)
      (is (true? x?) "the new transform test stays"))))

(deftest remote-delete-of-a-transform-with-an-unchanged-transform-test-deletes-both-test
  (testing "The remote deletes transforms collection TC, transform T and its transform test S, which nobody changed
            locally. The merge pull deletes all of them and the row of S."
    (let [{:keys [result tc? t? s? s-row]} (transform-test-of-a-deleted-transform! :unchanged)]
      (is (= :success (:status result)) (pr-str result))
      (is (not tc?))
      (is (not t?))
      (is (not s?))
      (is (nil? s-row) "the row of S goes with S"))))

;;; ------------------------ a placement under a remote-deleted collection during the reconcile ------------------------

(defn- on-thread
  "Run `f` on a plain Thread, with no binding of the connection of the pull. Returns a promise of `{:result}`, or of
  `{:error :status-code}`: the messages of the exception and its causes, and the first `:status-code` of their
  ex-data."
  [f]
  (let [p (promise)]
    (.start (Thread. ^Runnable
             (fn []
               (deliver p (try
                            {:result (f)}
                            (catch Throwable e
                              (let [chain (take-while some? (iterate ex-cause e))]
                                {:error       (str/join " | " (keep ex-message chain))
                                 :status-code (some (comp :status-code ex-data) chain)})))))))
    p))

(defn- deadlock?
  "True when the text `s` names a deadlock."
  [s]
  (boolean (some-> s u/lower-case-en (str/includes? "deadlock"))))

(defn- h2?
  "True when the app DB is H2. On H2 the reconcile runs in exclusive mode: a statement of another session pauses until
  the reconcile ends."
  []
  (= :h2 (mdb/db-type)))

(def ^:private gate-message
  "The message of a create or a move of a collection whose parent collection is locked."
  "The parent collection is being changed. Try again.")

(defn- check-placement-failed
  "Check that the user's create or move of a collection under a collection that the reconcile deletes failed: at once
  with the gate error, or on H2 after the pause with the error of a missing parent."
  [user]
  (if (h2?)
    (is (str/includes? (str (:error user)) "ancestors do not exist") (pr-str user))
    (do
      (is (= 409 (:status-code user)) (pr-str user))
      (is (str/includes? (str (:error user)) gate-message) (pr-str user)))))

(defn- write-during-the-reconcile!
  "Collections Alpha (with card A, and collection X with card X1) and Beta (with card B) are synced as the version v0.
  The remote deletes Beta and B. In the reconcile of the merge pull, at `at` (`:after-the-check`: after the save rule
  checked the delete closure; `:at-the-delete`: at the start of the delete step), `(user! ids)` runs on a plain thread,
  with `ids` the map of `:alpha`, `:beta` and `:x`. The pull waits at most 2 s for it, then continues. Returns the pull
  result, the result of the user's write (see [[on-thread]]), and what exists after the pull."
  [at user!]
  (with-sync-settings
    (mt/with-temp [:model/Collection {alpha :id} {:name "Alpha" :is_remote_synced true :location "/"}
                   :model/Card       _           {:name "Card A" :collection_id alpha}
                   :model/Collection {x :id}     {:name "X" :is_remote_synced true :location (str "/" alpha "/")}
                   :model/Card       {x1 :id}    {:name "Card X1" :collection_id x}
                   :model/Collection {beta :id}  {:name "Beta" :is_remote_synced true :location "/"}
                   :model/Card       _           {:name "Card B" :collection_id beta}]
      (mt/with-model-cleanup [:model/Card :model/Collection]
        (let [t0     (export-tree!)
              _      (pull-base! t0)
              user   (atom nil)
              start! (fn []
                       (when (nil? @user)
                         (reset! user (on-thread #(user! {:alpha alpha :beta beta :x x})))
                         (deref @user 2000 nil)))
              pull   #(merge-pull! t0 (without-beta t0))
              {:keys [result]}
              (case at
                :after-the-check
                (let [real (mt/original-fn #'save-rule/check-closure!)]
                  (mt/with-dynamic-fn-redefs [save-rule/check-closure! (fn [state closure phase]
                                                                         (let [checked (real state closure phase)]
                                                                           (when (= :reconcile phase)
                                                                             (start!))
                                                                           checked))]
                    (pull)))

                :at-the-delete
                (let [real (mt/original-fn #'impl/delete-with-closure!)]
                  (mt/with-dynamic-fn-redefs [impl/delete-with-closure! (fn [& args]
                                                                          (start!)
                                                                          (apply real args))]
                    (pull))))]
          {:result     (select-keys result [:status :conflicts :message])
           :user       (some-> @user (deref 60000 {:error "timed out"}))
           :alpha      alpha
           :beta?      (t2/exists? :model/Collection :id beta)
           :x-location (t2/select-one-fn :location :model/Collection :id x)
           :x1?        (t2/exists? :model/Card :id x1)
           :gammas     (t2/select-fn-vec :location :model/Collection :name "Gamma")
           :new-cards  (t2/select-fn-vec :collection_id :model/Card :name "New card C")})))))

(deftest collection-created-under-a-remote-deleted-collection-during-the-reconcile-fails-test
  (testing "The remote deletes collection Beta. In the reconcile, after the save rule checked the delete closure, the
            user creates collection Gamma under Beta. The create fails, and the pull succeeds. No collection Gamma
            exists, so the delete of Beta removes no collection that the user created."
    (let [{:keys [result user beta? gammas]}
          (write-during-the-reconcile! :after-the-check
                                       (fn [{:keys [beta]}]
                                         (t2/insert-returning-pk! :model/Collection {:name             "Gamma"
                                                                                     :location         (str "/" beta "/")
                                                                                     :is_remote_synced true})))]
      (is (= :success (:status result)) (pr-str result))
      (is (not beta?))
      (check-placement-failed user)
      (is (empty? gammas) "no collection Gamma exists"))))

(deftest collection-moved-under-a-remote-deleted-collection-during-the-reconcile-stays-test
  (testing "The remote deletes collection Beta. In the reconcile, at the delete, the user moves collection X, which
            holds card X1, from Alpha into Beta. The move fails, and the pull succeeds. X and X1 stay under Alpha."
    (let [{:keys [result user alpha beta? x-location x1?]}
          (write-during-the-reconcile! :at-the-delete
                                       (fn [{:keys [beta x]}]
                                         (collection/move-collection! (t2/select-one :model/Collection :id x)
                                                                      (str "/" beta "/"))))]
      (is (= :success (:status result)) (pr-str result))
      (is (not beta?))
      (check-placement-failed user)
      (is (= (str "/" alpha "/") x-location) "X stays under Alpha")
      (is x1? "card X1 stays"))))

(deftest card-saved-into-a-remote-deleted-collection-during-the-reconcile-fails-test
  (testing "The remote deletes collection Beta. In the reconcile, at the delete, the user saves new card C into Beta.
            The save fails, and the pull succeeds. On H2 the save pauses until the reconcile commits; on the other app
            DBs the foreign key check of the save waits for the lock of Beta. Then the save finds no Beta."
    (let [{:keys [result user beta? new-cards]}
          (write-during-the-reconcile! :at-the-delete
                                       (fn [{:keys [beta]}]
                                         (insert-card! "New card C" {:collection_id beta})))]
      (is (= :success (:status result)) (pr-str result))
      (is (not beta?))
      (is (some? (:error user)) (str "the save fails: " (pr-str user)))
      (is (empty? new-cards) "no card C exists"))))

(defn- two-deleted-collections!
  "Collections Alpha (with card A), Beta1 (with card C) and Beta2 (with card B2) are synced as the version v0. The
  remote deletes Beta1 and Beta2. Calls `(f {:beta1 :beta2 :c :t0 :t1})`, with `t1` the files of the remote."
  [f]
  (with-sync-settings
    (mt/with-temp [:model/Collection {alpha :id} {:name "Alpha" :is_remote_synced true :location "/"}
                   :model/Card       _           {:name "Card A" :collection_id alpha}
                   :model/Collection {beta1 :id} {:name "Beta1" :is_remote_synced true :location "/"}
                   :model/Card       {c :id}     {:name "Card C" :collection_id beta1}
                   :model/Collection {beta2 :id} {:name "Beta2" :is_remote_synced true :location "/"}
                   :model/Card       _           {:name "Card B2" :collection_id beta2}]
      (mt/with-model-cleanup [:model/Card :model/Collection]
        (let [t0 (export-tree!)]
          (pull-base! t0)
          (f {:beta1 beta1
              :beta2 beta2
              :c     c
              :t0    t0
              :t1    (into {} (remove (fn [[p _]] (or (str/starts-with? p "collections/main/beta1")
                                                      (str/starts-with? p "collections/main/beta2"))))
                           t0)}))))))

(deftest card-moved-between-two-remote-deleted-collections-during-the-reconcile-test
  (testing "The remote deletes collections Beta1 and Beta2. In the reconcile, after the pull locked the rows of the
            collections, the user moves card C from Beta1 to Beta2. Neither side gets a deadlock error. Nothing is
            lost: the pull deletes C only when C did not move, and else it stops with a conflict and C stays."
    (two-deleted-collections!
     (fn [{:keys [beta2 c t0 t1]}]
       (let [user (atom nil)
             real (mt/original-fn #'remote-sync.db/lock-instances!)
             {:keys [result]}
             (mt/with-dynamic-fn-redefs [remote-sync.db/lock-instances!
                                         (fn [model ids & more]
                                           (let [locked (apply real model ids more)]
                                             (when (and (= :model/Collection model) (nil? @user))
                                               (reset! user (on-thread #(t2/update! :model/Card c {:collection_id beta2})))
                                               (Thread/sleep 800))
                                             locked))]
               (merge-pull! t0 t1))
             user   (some-> @user (deref 60000 {:error "timed out"}))
             c?     (t2/exists? :model/Card :id c)]
         (is (some? user) "the user thread ran")
         (is (not (deadlock? (:message result))) (pr-str result))
         (is (not (deadlock? (:error user))) (pr-str user))
         (is (contains? #{:success :conflict} (:status result)) (pr-str result))
         (is (= c? (= :conflict (:status result))) "C stays exactly when the pull stops")
         (when c?
           (is (= beta2 (t2/select-one-fn :collection_id :model/Card :id c)) "C stays in Beta2")))))))

(deftest collection-moved-into-another-remote-deleted-collection-before-the-reconcile-stops-the-pull-test
  (testing "The remote deletes collections Beta1 and Beta2. Before the reconcile, the user moves Beta1 into Beta2 and
            keeps the transaction open for 300 ms. The reconcile does not wait for the user and does not deadlock: it
            runs again, finds that Beta1 changed, and stops the pull. Beta1 stays under Beta2."
    (two-deleted-collections!
     (fn [{:keys [beta1 beta2 t0 t1]}]
       (let [user  (atom nil)
             moved (promise)
             move! #(t2/with-transaction [_conn]
                      (collection/move-collection! (t2/select-one :model/Collection :id beta1) (str "/" beta2 "/"))
                      (deliver moved true)
                      (Thread/sleep 300))
             {:keys [result]} (merge-pull! t0 t1 :on-report (once-at! 0.75 (fn []
                                                                             (reset! user (on-thread move!))
                                                                             (deref moved 10000 nil))))
             user  (some-> @user (deref 60000 {:error "timed out"}))]
         (is (nil? (:error user)) (pr-str user))
         (is (not (deadlock? (:message result))) (pr-str result))
         (is (= :conflict (:status result)) (pr-str result))
         (is (some #(str/includes? % "Beta1") (:conflicts result)) (pr-str result))
         (is (= (str "/" beta2 "/") (t2/select-one-fn :location :model/Collection :id beta1)) "Beta1 stays under Beta2")
         (is (t2/exists? :model/Collection :id beta2) "Beta2 stays"))))))

(deftest collection-created-under-a-remote-deleted-collection-before-the-reconcile-stops-the-pull-test
  (testing "The remote deletes collection Beta. Before the reconcile, the user creates collection Gamma under Beta and
            keeps the transaction open for 300 ms. The reconcile does not wait for the user: it runs again, finds
            Gamma, and stops the pull. Beta and Gamma stay."
    (with-sync-settings
      (mt/with-temp [:model/Collection {alpha :id} {:name "Alpha" :is_remote_synced true :location "/"}
                     :model/Card       _           {:name "Card A" :collection_id alpha}
                     :model/Collection {beta :id}  {:name "Beta" :is_remote_synced true :location "/"}
                     :model/Card       _           {:name "Card B" :collection_id beta}]
        (mt/with-model-cleanup [:model/Card :model/Collection]
          (let [t0      (export-tree!)
                _       (pull-base! t0)
                user    (atom nil)
                created (promise)
                create! #(t2/with-transaction [_conn]
                           (let [id (t2/insert-returning-pk! :model/Collection {:name             "Gamma"
                                                                                :location         (str "/" beta "/")
                                                                                :is_remote_synced true})]
                             (deliver created id)
                             (Thread/sleep 300)
                             id))
                {:keys [result]} (merge-pull! t0 (without-beta t0)
                                              :on-report (once-at! 0.75 (fn []
                                                                          (reset! user (on-thread create!))
                                                                          (deref created 10000 nil))))
                {gamma :result :as user} (some-> @user (deref 60000 {:error "timed out"}))]
            (is (some? gamma) (pr-str user))
            (is (= :conflict (:status result)) (pr-str result))
            (is (= ["Gamma"] (:conflicts result)) "the conflict names the new collection")
            (is (= (str "Import blocked: content was added locally during the pull under content that the remote "
                        "branch deleted. Your local change is kept.")
                   (:message result)))
            (is (t2/exists? :model/Collection :id beta) "Beta stays")
            (is (= (str "/" beta "/") (t2/select-one-fn :location :model/Collection :id gamma)) "Gamma stays under Beta")))))))

(deftest reconcile-that-stays-busy-stops-the-pull-test
  (testing "The remote deletes collection Beta and its card B. Before the reconcile, the user locks the row of B and
            keeps it locked for 3 s. The reconcile does not wait: it runs again a few times, and then stops the pull
            with the busy message. The version does not move, and Beta and B stay."
    (with-sync-settings
      (mt/with-temp [:model/Collection {alpha :id} {:name "Alpha" :is_remote_synced true :location "/"}
                     :model/Card       _           {:name "Card A" :collection_id alpha}
                     :model/Collection {beta :id}  {:name "Beta" :is_remote_synced true :location "/"}
                     :model/Card       {b :id}     {:name "Card B" :collection_id beta}]
        (let [t0       (export-tree!)
              _        (pull-base! t0)
              version0 (remote-sync.task/last-version)
              user     (atom nil)
              locked   (promise)
              hold!    #(t2/with-transaction [_conn]
                          (t2/query {:select [:id] :from [:report_card] :where [:= :id b] :for :update})
                          (deliver locked true)
                          (Thread/sleep 3000))
              {:keys [result]} (merge-pull! t0 (without-beta t0)
                                            :on-report (once-at! 0.75 (fn []
                                                                        (reset! user (on-thread hold!))
                                                                        (deref locked 10000 nil))))]
          (some-> @user (deref 60000 nil))
          (is (= :conflict (:status result)) (pr-str result))
          (is (= (str "Import blocked: content under a collection that the remote branch deleted was in use during "
                      "the pull. Try the pull again.")
                 (:message result)))
          (is (= version0 (remote-sync.task/last-version)) "the version does not move")
          (is (t2/exists? :model/Collection :id beta) "Beta stays")
          (is (t2/exists? :model/Card :id b) "B stays"))))))

;;; --------------------------------- scheduled content under a remote-deleted collection ---------------------------------

(defn- do-with-jdbc-store-scheduler!
  "Call `(f)` with a Quartz scheduler on the JDBC job store of the app DB bound on this thread, in standby, as
  production has before the scheduler starts. Its jobs are those of dashboard subscriptions and of notifications. Quartz
  reads and writes the job store over connections of its own pool. The scheduler has a name of its own, so its rows in
  the job store are its own; this clears them and shuts it down after."
  [f]
  (#'task.impl/set-jdbc-backend-properties!)
  (let [props     (doto (Properties.)
                    (.load (io/input-stream (io/resource "quartz.properties"))))
        _         (doseq [[k v] (System/getProperties)
                          :when (str/starts-with? (str k) "org.quartz.")]
                    (.setProperty props (str k) (str v)))
        _         (doto props
                    (.setProperty "org.quartz.scheduler.instanceName" "remote-sync-merge-pull-test")
                    (.setProperty "org.quartz.threadPool.threadCount" "1"))
        scheduler (.getScheduler (StdSchedulerFactory. props))]
    (try
      (binding [task.impl/*quartz-scheduler* (atom scheduler)]
        (task/init! :metabase.pulse.task.send-pulses/SendPulses)
        (task/init! :metabase.notification.task.send/SendNotifications)
        (f))
      (finally
        (.clear scheduler)
        (.shutdown scheduler)))))

(defn- pulse-trigger-keys
  "The keys of the SendPulse triggers of the pulse `pulse-id`."
  [pulse-id]
  (into #{}
        (comp (map :key)
              (filter #(str/starts-with? % (str "metabase.task.send-pulse.trigger." pulse-id "."))))
        (:triggers (task/job-info send-pulses-trigger/send-pulse-job-key))))

(defn- subscription-trigger-keys
  "The keys of the SendNotification triggers of the notification subscription `subscription-id`."
  [subscription-id]
  (into #{}
        (comp (filter #(= subscription-id (get-in % [:data "subscription-id"])))
              (map :key))
        (:triggers (task/job-info notification.send-trigger/send-notification-job-key))))

(defn- pull-on-another-thread!
  "Run `(pull!)` on another thread with the bindings of this thread, and wait for its value. On H2, when no value comes
  in 10 s, the reconcile is stuck in exclusive mode: this thread then turns exclusive mode off on the connection of the
  reconcile, so that the pull and the app DB go on, at most 5 times. Returns `{:value :stuck?}`."
  [pull!]
  (let [exclusive (atom nil)
        real      (mt/original-fn #'remote-sync.db/set-h2-exclusive!)]
    (mt/with-dynamic-fn-redefs [remote-sync.db/set-h2-exclusive! (fn [on?]
                                                                   (when on?
                                                                     (reset! exclusive
                                                                             (t2/with-connection [^java.sql.Connection conn]
                                                                               conn)))
                                                                   (real on?))]
      (let [pull (future (pull!))]
        (loop [unstuck 0]
          (let [value (deref pull 10000 ::no-value)]
            (cond
              (not= ::no-value value)
              {:value value :stuck? (pos? unstuck)}

              (< unstuck 5)
              (do
                (when-let [^java.sql.Connection conn @exclusive]
                  (with-open [stmt (.createStatement conn)]
                    (.execute stmt "SET EXCLUSIVE 0")))
                (recur (inc unstuck)))

              :else
              {:value nil :stuck? true})))))))

(defn- do-with-scheduled-content-in-beta!
  "Collections Alpha (with card A) and Beta (with card B and dashboard D) are synced as the version v0. With
  `:dashboard-subscription`, D has a daily email subscription; with `:alert`, B has an alert with a daily schedule. The
  scheduler is on the JDBC job store (see [[do-with-jdbc-store-scheduler!]]). Calls `(f {:b :d :beta :t0 :pulse
  :notification :subscription})`; `:pulse` is nil without a dashboard subscription, and `:notification` and
  `:subscription` are nil without an alert."
  [kind f]
  (do-with-jdbc-store-scheduler!
   (fn []
     (with-sync-settings
       (mt/with-temp [:model/Collection {alpha :id} {:name "Alpha" :is_remote_synced true :location "/"}
                      :model/Card       _           {:name "Card A" :collection_id alpha}
                      :model/Collection {beta :id}  {:name "Beta" :is_remote_synced true :location "/"}
                      :model/Card       {b :id}     {:name "Card B" :collection_id beta}
                      :model/Dashboard  {d :id}     {:name "Dash D" :collection_id beta}]
         (mt/with-model-cleanup [:model/Pulse :model/Notification]
           (let [t0    (export-tree!)
                 _     (pull-base! t0)
                 pulse (when (= :dashboard-subscription kind)
                         (let [p (t2/insert-returning-pk! :model/Pulse {:name          "Subscription of D"
                                                                        :dashboard_id  d
                                                                        :collection_id beta
                                                                        :creator_id    (mt/user->id :rasta)})]
                           (t2/insert! :model/PulseChannel {:pulse_id      p
                                                            :channel_type  :email
                                                            :details       {:emails ["user@example.com"]}
                                                            :schedule_type :daily
                                                            :schedule_hour 10
                                                            :enabled       true})
                           p))
                 [notification subscription]
                 (when (= :alert kind)
                   (let [nc (t2/insert-returning-pk! :model/NotificationCard {:card_id        b
                                                                              :send_condition :has_result})
                         n  (t2/insert-returning-pk! :model/Notification {:payload_type :notification/card
                                                                          :payload_id   nc
                                                                          :active       true
                                                                          :creator_id   (mt/user->id :rasta)})
                         s  (t2/insert-returning-pk! :model/NotificationSubscription
                                                     {:notification_id n
                                                      :type            :notification-subscription/cron
                                                      :cron_schedule   "0 0 10 * * ? *"})]
                     [n s]))]
             (f {:b b :d d :beta beta :t0 t0 :pulse pulse :notification notification :subscription subscription}))))))))

(deftest remote-delete-of-a-collection-with-scheduled-content-test
  (testing "The remote deletes collection Beta, which holds card B and dashboard D. B has an alert, or D has a dashboard
            subscription, with a trigger in the JDBC job store of the scheduler. The pull does not get stuck, deletes
            Beta and its content, and removes the trigger."
    (doseq [kind [:dashboard-subscription :alert]]
      (testing kind
        (do-with-scheduled-content-in-beta!
         kind
         (fn [{:keys [b d beta t0 pulse notification subscription]}]
           (if pulse
             (is (seq (pulse-trigger-keys pulse)) "the subscription has a trigger before the pull")
             (is (seq (subscription-trigger-keys subscription)) "the alert has a trigger before the pull"))
           (let [{:keys [value stuck?]} (pull-on-another-thread! #(:result (merge-pull! t0 (without-beta t0))))]
             (is (not stuck?) "the pull does not get stuck")
             (is (= :success (:status value)) (pr-str value))
             (is (= [false false false] (map #(t2/exists? %1 :id %2) [:model/Collection :model/Card :model/Dashboard] [beta b d]))
                 "Beta, B and D go")
             (if pulse
               (testing "the dashboard subscription"
                 (is (not (t2/exists? :model/Pulse :id pulse)))
                 (is (empty? (pulse-trigger-keys pulse)) "its trigger goes"))
               (testing "the alert"
                 (is (not (t2/exists? :model/Notification :id notification)))
                 (is (empty? (subscription-trigger-keys subscription)) "its trigger goes"))))))))))

(deftest pull-that-stops-after-the-delete-keeps-the-triggers-test
  (testing "The remote deletes collection Beta, which holds card B and dashboard D. B has an alert, or D has a dashboard
            subscription. Each run of the reconcile finds a busy row after its delete, so the pull stops. Beta, its
            content and the trigger stay."
    (doseq [kind [:dashboard-subscription :alert]]
      (testing kind
        (do-with-scheduled-content-in-beta!
         kind
         (fn [{:keys [b d beta t0 pulse notification subscription]}]
           (let [real (mt/original-fn #'impl/delete-with-closure!)
                 {:keys [value stuck?]}
                 (mt/with-dynamic-fn-redefs [impl/delete-with-closure!
                                             (fn [& args]
                                               (apply real args)
                                               (throw (ex-info "A row is busy" {:error ::save-rule/busy})))]
                   (pull-on-another-thread! #(:result (merge-pull! t0 (without-beta t0)))))]
             (is (not stuck?) "the pull does not get stuck")
             (is (= :conflict (:status value)) (pr-str value))
             (is (= [true true true] (map #(t2/exists? %1 :id %2) [:model/Collection :model/Card :model/Dashboard] [beta b d]))
                 "Beta, B and D stay")
             (if pulse
               (testing "the dashboard subscription"
                 (is (t2/exists? :model/Pulse :id pulse))
                 (is (seq (pulse-trigger-keys pulse)) "its trigger stays"))
               (testing "the alert"
                 (is (t2/exists? :model/Notification :id notification))
                 (is (seq (subscription-trigger-keys subscription)) "its trigger stays"))))))))))

(deftest dashboard-card-of-a-deleted-card-held-during-the-reconcile-delete-test
  (testing "The remote deletes collection Beta, which holds cards C and C2. Dashboard D in Alpha shows C. At the delete
            of the reconcile, the user updates the dashboard card of C, and then C2, in one transaction. Neither side
            gets a deadlock error, and no write is lost: C2 keeps the edit of the user exactly when the pull stops."
    (with-sync-settings
      (mt/with-temp [:model/Collection    {alpha :id} {:name "Alpha" :is_remote_synced true :location "/"}
                     :model/Collection    {beta :id}  {:name "Beta" :is_remote_synced true :location "/"}
                     :model/Card          {c :id}     {:name "Card C" :collection_id beta}
                     :model/Card          {c2 :id}    {:name "Card C2" :collection_id beta}
                     :model/Dashboard     {d :id}     {:name "Dash D" :collection_id alpha}
                     :model/DashboardCard {dc :id}    {:dashboard_id d :card_id c}]
        (mt/with-model-cleanup [:model/Card :model/Collection :model/Dashboard]
          (let [t0      (export-tree!)
                _       (pull-base! t0)
                user    (atom nil)
                dc-held (promise)
                real    (mt/original-fn #'impl/delete-with-closure!)
                {:keys [result]}
                (mt/with-dynamic-fn-redefs [impl/delete-with-closure!
                                            (fn [& args]
                                              (when (nil? @user)
                                                (reset! user (on-thread
                                                              #(t2/with-transaction [_conn]
                                                                 (t2/query {:update :report_dashboardcard
                                                                            :set    {:size_x 7}
                                                                            :where  [:= :id dc]})
                                                                 (deliver dc-held true)
                                                                 (t2/query {:update :report_card
                                                                            :set    {:description "user edit"}
                                                                            :where  [:= :id c2]})
                                                                 :committed)))
                                                (deref dc-held 5000 nil)
                                                (Thread/sleep 200))
                                              (apply real args))]
                  (merge-pull! t0 (without-beta t0)))
                user    (some-> @user (deref 60000 {:error "timed out"}))]
            (is (some? user) "the user thread ran")
            (is (not (deadlock? (:message result))) (pr-str result))
            (is (not (deadlock? (:error user))) (pr-str user))
            (is (contains? #{:success :conflict} (:status result)) (pr-str result))
            (is (= (= :conflict (:status result))
                   (= "user edit" (t2/select-one-fn :description :model/Card :id c2)))
                "C2 keeps the edit exactly when the pull stops")))))))
