(ns metabase-enterprise.library-branching.old-format-app-db-test
  "The pull, the deploy, the status, the push and merge-branch of the app DB instance on trees in the old format, with a
  published table that has no user display name: remote sync writes no display name for it, so its name is the one
  that warehouse sync gives the table on the instance. These tests commit their content and delete it afterwards, and
  they change the one base row and the task rows of the app DB; they are not parallel."
  {:clj-kondo/config '{:lint-as {metabase-enterprise.library-branching.push-test-util/with-remote       clojure.core/fn
                                 metabase-enterprise.library-branching.repository-test-util/with-remote clojure.core/fn}}}
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.library-branching.deploy :as deploy]
   [metabase-enterprise.library-branching.features-test-util :as features.tu]
   [metabase-enterprise.library-branching.format.manifest :as format.manifest]
   [metabase-enterprise.library-branching.format.old-test-util :as old.tu]
   [metabase-enterprise.library-branching.instance :as instance]
   [metabase-enterprise.library-branching.instance.app-db :as app-db]
   [metabase-enterprise.library-branching.manifest :as manifest]
   [metabase-enterprise.library-branching.operations :as operations]
   [metabase-enterprise.library-branching.pull :as pull]
   [metabase-enterprise.library-branching.pull-test-util :as pltu]
   [metabase-enterprise.library-branching.push-test-util :as ptu :refer [with-remote]]
   [metabase-enterprise.library-branching.repository :as repository]
   [metabase-enterprise.library-branching.repository-test-util :as rtu]
   [metabase-enterprise.library-branching.status :as status]
   [metabase-enterprise.library-branching.store :as store]
   [metabase-enterprise.library-branching.tasks-test-util :as tasks.tu]
   [metabase.app-db.core :as mdb]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db) features.tu/with-features)

(defn- reset-base! []
  (t2/query {:update :library_branching_base :set {:commit_id nil :digests nil} :where [:= :id 1]}))

(defn- clear-digests! []
  (t2/query {:update :library_branching_base :set {:digests nil} :where [:= :id 1]}))

(defn- children-location
  [{:keys [id location]}]
  (str location id "/"))

(defn- do-with-published-venues!
  "Calls `f` with a data collection of the Library that holds the venues table, published with no user display name.
  Deletes every row that it inserted afterwards, and clears the base row before and after."
  [f]
  (let [rows    (atom ())
        insert! (fn [model row]
                  (let [inserted (t2/insert-returning-instance! model row)]
                    (swap! rows conj [model inserted])
                    inserted))]
    (reset-base!)
    (try
      (mt/with-temporary-setting-values [library-branching-enabled true]
        (let [library (or (t2/select-one :model/Collection :type "library" :archived false)
                          (insert! :model/Collection {:name "Library" :type "library" :location "/"}))
              data    (insert! :model/Collection {:name     "Old format data"
                                                  :type     "library-data"
                                                  :location (children-location library)})]
          (insert! :model/TableUserSettings {:table_id      (mt/id :venues)
                                             :is_published  true
                                             :collection_id (:id data)})
          (f data)))
      (finally
        (doseq [[model row] @rows]
          (if (= :model/TableUserSettings model)
            (t2/delete! model :table_id (:table_id row))
            (t2/delete! model :id (:id row))))
        (reset-base!)))))

(defn- venues-key []
  [(t2/select-one-fn :name :model/Database (mt/id)) "PUBLIC" "VENUES"])

(defn- user-display-name
  "The display name that a user set on the venues table, or nil."
  []
  (t2/select-one-fn :display_name :model/TableUserSettings :table_id (mt/id :venues)))

(defn- old-tree
  "`{path bytes}` of snapshot `s` in the old format, as remote sync writes it for tables with no user display name: no
  table settings file has a display name."
  [s]
  (into {"README.md" (ptu/utf8 "# Our content")}
        (map-indexed (fn [i doc]
                       [(str "collections/main/item_" i ".yaml")
                        (old.tu/bytes-of (cond-> doc
                                           (= "TableUserSettings" (-> doc :serdes/meta first :model))
                                           (dissoc :display_name)))]))
        (old.tu/docs s)))

(defn- read-snapshot [inst] (:snapshot (instance/read-snapshot inst)))

(deftest pull-of-old-format-trees-names-tables-as-the-instance-does-test
  (testing (str "a published table with no display name in its settings file has the name of warehouse sync on the "
                "instance, in the head and in the base; app DB " (mdb/db-type))
    (do-with-published-venues!
     (fn [data]
       (let [inst   (app-db/app-db-instance)
             venues (venues-key)
             local  (read-snapshot inst)]
         (is (= "Venues" (get-in local [venues :name])))
         (with-remote [repo s]
           (let [c0 (ptu/remote-commit! repo [] (old-tree local))]
             (testing "the first pull of a head that holds the local content: no conflict, and no local change after it"
               (is (= :pulled (:result (pull/pull! inst s ptu/branch))))
               (is (= c0 (instance/base inst)))
               (is (= status/no-changes (ptu/local-changes inst)))
               (is (nil? (user-display-name))))
             (let [remote (assoc-in local [venues :attrs :description] "Changed")
                   c1     (ptu/remote-commit! repo [c0] (old-tree remote))]
               (testing "a pull from a base in the old format applies the change of the head, and sets no display name"
                 (is (= :pulled (:result (pull/pull! inst s ptu/branch))))
                 (is (= c1 (instance/base inst)))
                 (is (= remote (read-snapshot inst)))
                 (is (= status/no-changes (ptu/local-changes inst)))
                 (is (nil? (user-display-name))))
               (testing "the status of a head that changes one collection shows that change only"
                 (ptu/remote-commit! repo [c1] (old-tree (assoc-in remote [(:entity_id data) :attrs :description] "Data")))
                 (is (= {:created #{} :deleted #{} :updated #{(:entity_id data)}}
                        (:remote (status/status inst s ptu/branch {}))))
                 (is (true? (:has-changes (status/check-remote-changes inst s ptu/branch {})))))
               (testing "a user display name on the instance is a local change: the name of warehouse sync names the table
                        in the base, so a head that changes the table gives a conflict"
                 (t2/update! :model/TableUserSettings (mt/id :venues) {:display_name "My venues"})
                 (ptu/remote-commit! repo [(ptu/remote-head repo)]
                                     (old-tree (assoc-in remote [venues :attrs :description] "Changed again")))
                 (let [{:keys [result conflicts]} (pull/pull! inst s ptu/branch)]
                   (is (= :conflicts result))
                   (is (= [venues] (map :id conflicts))))
                 (is (= c1 (instance/base inst)))
                 (is (= "My venues" (user-display-name))))))))))))

(defn- with-metric-row-ids
  "Old documents `docs`, each link card to a metric with the row id of the metric in place of its entity id, as the
  export of master writes it. `row-ids` is `{entity-id row-id}`."
  [docs row-ids]
  (mapv (fn [doc]
          (cond-> doc
            (= "Dashboard" (-> doc :serdes/meta first :model))
            (update :dashcards (partial mapv (fn [dc]
                                               (cond-> dc
                                                 (= "metric" (get-in dc [:visualization_settings :link :entity :model]))
                                                 (update-in [:visualization_settings :link :entity :id] row-ids)))))))
        docs))

(defn- count-query []
  (let [mp (mt/metadata-provider)]
    (-> (lib/query mp (lib.metadata/table mp (mt/id :venues)))
        (lib/aggregate (lib/count)))))

(deftest pull-of-old-format-link-card-to-a-metric-test
  (testing (str "a dashboard of the old format whose link card holds the row id of a metric: the pull links it to the "
                "metric of that row, and a row id of no card is a finding that names the dashboard; app DB "
                (mdb/db-type))
    (do-with-published-venues!
     (fn [data]
       ;; A pull reads at a read point of its own, so the rows commit; `mt/with-temp` would hold a transaction.
       (let [metric    (t2/insert-returning-instance! :model/Card
                                                      {:name                   "Linked metric"
                                                       :type                   :metric
                                                       :collection_id          (:id data)
                                                       :creator_id             (mt/user->id :crowberto)
                                                       :display                :scalar
                                                       :visualization_settings {}
                                                       :dataset_query          (count-query)})
             dashboard (t2/insert-returning-instance! :model/Dashboard {:name          "Metric links"
                                                                        :collection_id (:id data)
                                                                        :creator_id    (mt/user->id :crowberto)})]
         (try
           (t2/insert! :model/DashboardCard {:dashboard_id (:id dashboard) :row 0 :col 0 :size_x 4 :size_y 2
                                             :visualization_settings
                                             {:virtual_card {:display "link"}
                                              :link         {:entity {:model "metric" :id (:id metric)
                                                                      :name "Linked metric"}}}})
           (let [inst  (app-db/app-db-instance)
                 local (read-snapshot inst)
                 tree  (fn [row-ids]
                         (into {}
                               (map-indexed (fn [i doc] [(str "collections/main/item_" i ".yaml") (old.tu/bytes-of doc)]))
                               (with-metric-row-ids (old.tu/docs local) row-ids)))]
             (is (= (:entity_id metric)
                    (get-in local [(:entity_id dashboard) :attrs :dashcards 0 :visualization_settings :link :entity :id])))
             (with-remote [repo s]
               (testing "a row id of no card on the instance"
                 (let [missing (inc (t2/select-one-fn :id :model/Card {:order-by [[:id :desc]]}))
                       c0      (ptu/remote-commit! repo [] (tree {(:entity_id metric) missing}))]
                   (is (=? {:result   :invalid
                            :head     c0
                            :findings [{:type :unknown-row-id :id (:entity_id dashboard) :row-ids [missing]}]}
                           (pull/pull! inst s ptu/branch)))
                   (is (nil? (instance/base inst)))))
               (testing "the row id of the metric: the first pull of the local content gives no conflict and no local
                        change"
                 (let [c1 (ptu/remote-commit! repo [(ptu/remote-head repo)] (tree {(:entity_id metric) (:id metric)}))]
                   (is (= :pulled (:result (pull/pull! inst s ptu/branch))))
                   (is (= c1 (instance/base inst)))
                   (is (= local (read-snapshot inst)))
                   (is (= status/no-changes (ptu/local-changes inst)))))))
           (finally
             (t2/delete! :model/Dashboard (:id dashboard))
             (t2/delete! :model/Card (:id metric)))))))))

(deftest deploy-of-old-format-trees-names-tables-as-the-instance-does-test
  (testing (str "a deploy of a published table with no display name in its settings file writes no display name, and "
                "a base in the old format gives no drift; app DB " (mdb/db-type))
    (do-with-published-venues!
     (fn [_data]
       (let [inst   (app-db/app-db-instance)
             venues (venues-key)
             env    (format.manifest/env (manifest/manifest))
             local  (read-snapshot inst)
             deploy! #(deploy/deploy! inst % ptu/branch env)]
         (t2/update! :model/TableUserSettings (mt/id :venues) {:is_published false :collection_id nil})
         (is (not (contains? (read-snapshot inst) venues)))
         (with-remote [repo s]
           (let [c0 (ptu/remote-commit! repo [] (old-tree local))]
             (testing "the first deploy publishes the table with the name of warehouse sync"
               (is (= :deployed (:result (deploy! s))))
               (is (= c0 (instance/base inst)))
               (is (= local (read-snapshot inst)))
               (is (nil? (user-display-name))))
             (testing "with no base digests, the drift check decodes the base in the old format: no drift"
               (clear-digests!)
               (let [remote (assoc-in local [venues :attrs :description] "Changed")
                     c1     (ptu/remote-commit! repo [c0] (old-tree remote))]
                 (is (= {:result :deployed :head c1} (select-keys (deploy! s) [:result :head])))
                 (is (= remote (read-snapshot inst)))
                 (is (nil? (user-display-name))))))))))))

(deftest push-of-old-format-base-names-tables-as-the-instance-does-test
  (testing (str "with no base digests, the push decodes the base in the old format with the names of warehouse sync: "
                "the local content of the base is nothing to push; app DB " (mdb/db-type))
    (tasks.tu/with-no-tasks
      (do-with-published-venues!
       (fn [_data]
         (let [inst (app-db/app-db-instance)]
           (with-remote [repo s]
             (let [c0 (ptu/remote-commit! repo [] (old-tree (read-snapshot inst)))]
               (is (= :pulled (:result (pull/pull! inst s ptu/branch))))
               (clear-digests!)
               (is (= {:result :nothing-to-push :commit c0} (ptu/push! inst s)))
               (is (= c0 (ptu/remote-head repo)))))))))))

(deftest merge-branch-of-old-format-trees-names-tables-as-the-instance-does-test
  (testing (str "merge-branch decodes the merge base and the two heads in the old format with the names of warehouse "
                "sync on the instance, so the merge writes no table name of a key as a display name; app DB "
                (mdb/db-type))
    (do-with-published-venues!
     (fn [data]
       (let [venues (venues-key)
             local  (read-snapshot (app-db/app-db-instance))
             ours   (assoc-in local [venues :attrs :description] "From main")
             theirs (assoc-in local [(:entity_id data) :attrs :description] "From dev")]
         (rtu/with-remote [repo url]
           (rtu/with-settings {:remote-sync-url url :remote-sync-branch "main"}
             (let [a (pltu/commit-on! repo "main" [] (old-tree local))
                   m (pltu/commit-on! repo "main" [a] (old-tree ours))
                   d (pltu/commit-on! repo "dev" [a] (old-tree theirs))
                   {:keys [outcome]} (operations/merge-branch-task! nil "main" "dev")
                   ;; a store holds the commits of the branches that it fetched
                   merged (repository/do-with-store (fn [s]
                                                      (store/head s "main")
                                                      (ptu/commit-snapshot s (:commit outcome))))]
               (is (=? {:kind "merged" :branch "main" :from "dev" :commit string?} outcome))
               (is (= [m d] (ptu/commit-parents repo (:commit outcome))))
               (is (= "Venues" (get-in merged [venues :name])))
               (is (= (assoc-in ours [(:entity_id data) :attrs :description] "From dev") merged))))))))))
