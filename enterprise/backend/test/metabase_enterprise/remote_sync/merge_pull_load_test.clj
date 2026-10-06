(ns metabase-enterprise.remote-sync.merge-pull-load-test
  "A merge pull loads only the load units that the remote changed, deletes only the entities whose files the remote
  deleted, and writes only the ledger rows of the entities that it loads or deletes.

  Not ^:parallel: uses the shared remote-sync fixtures."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.remote-sync.impl :as impl]
   [metabase-enterprise.remote-sync.models.remote-sync-task :as remote-sync.task]
   [metabase-enterprise.remote-sync.settings :as settings]
   [metabase-enterprise.remote-sync.source :as source]
   [metabase-enterprise.remote-sync.source.protocol :as source.p]
   [metabase-enterprise.remote-sync.test-helpers :as test-helpers]
   [metabase.events.core :as events]
   [metabase.search.core :as search]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util.yaml :as yaml]
   [toucan2.core :as t2]))

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

(defn- once-at
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
                                               :on-report (once-at 0.75 #(save! a "edit during pull")))]
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
                                                  :on-report (once-at 0.05 #(save! a "edit during pull")))]
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
                                                 :dataset_query (mt/mbql-query venues)}]
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

(deftest remote-model-delete-with-an-unchanged-action-deletes-both-test
  (testing "The remote deletes model M and its action, which nobody changed locally. The merge pull deletes both and
            their ledger rows, and keeps a local edit of another card."
    (with-sync-settings
      (mt/with-temp [:model/Collection {coll-id :id} {:name "Merge Test" :is_remote_synced true :location "/"}
                     :model/Card {model-id :id} {:name "Model M" :type :model :collection_id coll-id
                                                 :dataset_query (mt/mbql-query venues)}
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
