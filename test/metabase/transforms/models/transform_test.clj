(ns metabase.transforms.models.transform-test
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.collections.models.collection :as collection]
   [metabase.driver.util :as driver.u]
   [metabase.events.core :as events]
   [metabase.events.test-util :as events.tu]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.models.interface :as mi]
   [metabase.permissions.core :as perms]
   [metabase.permissions.data-permissions :as data-perms]
   [metabase.permissions.models.permissions-group :as perms-group]
   [metabase.search.core :as search]
   [metabase.search.test-util :as search.tu]
   [metabase.stale-test :as stale-test]
   [metabase.staleness.core :as staleness]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.test.util.dynamic-redefs :as dynamic-redefs]
   [metabase.transforms-base.ordering :as ordering]
   [metabase.transforms.core :as transforms.core]
   [metabase.transforms.models.transform :as transform]
   [metabase.transforms.models.transform-tag :as transform-tag]
   [metabase.transforms.query-test-util :as query-test-util]
   [metabase.transforms.schema :as transforms.schema]
   [metabase.util.malli.registry :as mr]
   [toucan2.core :as t2]
   [toucan2.jdbc.query :as t2.jdbc.query]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))

(deftest source-database-id-set-test
  (testing "inserting a transform correctly sets the source-database-id column"
    (mt/with-temp [:model/Transform transform
                   {:name   "Test Transform"
                    :source {:type  :query
                             :query (lib/native-query (mt/metadata-provider) "SELECT 1")}}]
      (is (= (mt/id) (:source_database_id transform)))))
  (testing "A transform with no source database has a nil source_database_id"
    (mt/with-temp [:model/Transform transform
                   {:name   "Test Transform"
                    :source {:type          :python
                             :source-tables []
                             :body          "print(\"hello\")"}}]
      (is (nil? (:source_database_id transform)))))
  (testing "updating a transform recomputes the source-database-id column from the source"
    (mt/with-temp [:model/Transform transform
                   {:name   "Test Transform"
                    :source {:type          :python
                             :source-tables []
                             :body          "print(\"hello\")"}}]
      (is (nil? (:source_database_id transform)))
      (t2/update! :model/Transform :id (:id transform) {:source {:type  :query
                                                                 :query (lib/native-query (mt/metadata-provider) "SELECT 1")}})
      (is (= (mt/id) (t2/select-one-fn :source_database_id :model/Transform :id (:id transform)))))))

(deftest source-database-deletion-deletes-transform-test
  (testing "deleting database deletes transforms reading from it"
    (mt/with-temp [:model/Database {db-id :id} {}
                   :model/Transform transform
                   {:name   "Test Transform"
                    :source {:type  :query
                             :query (lib/native-query (lib-be/application-database-metadata-provider db-id) "SELECT 1")}}]
      (is (= db-id (:source_database_id transform)))
      (t2/delete! :model/Database :id db-id)
      (is (not (t2/exists? :model/Transform :id (:id transform)))))))

(defn- temp-transform-with-index! [thunk]
  (mt/with-temp [:model/Transform {transform-id :id}
                 {:name   (mt/random-name)
                  :source {:type :query :query (query-test-util/make-query :source-table "venues")}
                  :target {:database (mt/id) :type "table" :schema "public" :name (mt/random-name)}}
                 :model/TableIndex {index-id :id}
                 {:transform_id transform-id
                  :index_name   "by_cat"
                  :status       :succeeded
                  :structured   {:kind :btree :name "by_cat" :columns [{:name "category"}]}}]
    (thunk transform-id index-id)))

(deftest revalidate-indexes-on-schema-change-test
  (testing "editing the source query (output schema may change) marks the transform's managed indexes for revalidation"
    (temp-transform-with-index!
     (fn [transform-id index-id]
       (transform/update-transforms! [transform-id] {:source {:type :query :query (query-test-util/make-query :source-table "checkins")}})
       (is (= :update-pending (t2/select-one-fn :status :model/TableIndex :id index-id))))))
  (testing "retargeting to a different table marks the transform's managed indexes for revalidation"
    (temp-transform-with-index!
     (fn [transform-id index-id]
       (transform/update-transforms! [transform-id] {:target {:database (mt/id) :type "table" :schema "public" :name (mt/random-name)}})
       (is (= :update-pending (t2/select-one-fn :status :model/TableIndex :id index-id))))))
  (testing "an unrelated edit (renaming the transform) leaves the indexes alone"
    (temp-transform-with-index!
     (fn [transform-id index-id]
       (transform/update-transforms! [transform-id] {:name "renamed"})
       (is (= :succeeded (t2/select-one-fn :status :model/TableIndex :id index-id)))))))

(mt/when-ee-evailable
 (deftest native-transform-requires-query-builder-and-native-test
   (testing "Writing a native-query transform requires \"Query builder and native\" on the source database."
     (mt/with-premium-features #{:transforms-basic :hosting :advanced-permissions}
       (mt/with-temp [:model/PermissionsGroup {group-id :id} {}
                      :model/PermissionsGroupMembership _ {:user_id (mt/user->id :rasta) :group_id group-id}
                      :model/Transform native-transform
                      {:name   "Native Transform"
                       :source {:type  :query
                                :query (lib/native-query (mt/metadata-provider) "SELECT 1")}}
                      :model/Transform mbql-transform
                      {:name   "MBQL Transform"
                       :source {:type  :query
                                :query (lib/query (mt/metadata-provider)
                                                  (lib.metadata/table (mt/metadata-provider) (mt/id :orders)))}}]
         (let [native (t2/select-one :model/Transform :id (:id native-transform))
               mbql   (t2/select-one :model/Transform :id (:id mbql-transform))]
           (mt/with-data-analyst-role! (mt/user->id :rasta)
             (mt/with-restored-data-perms!
               ;; Remove native access granted to All Users by default so the user's only path to native would be
               ;; the (mis)configured transforms group.
               (data-perms/set-database-permission! (perms-group/all-users) (mt/id) :perms/view-data :unrestricted)
               (data-perms/set-database-permission! (perms-group/all-users) (mt/id) :perms/create-queries :query-builder)
               (testing "transforms cannot be granted while create-queries is only query-builder (no native)"
                 (data-perms/set-database-permission! group-id (mt/id) :perms/view-data :unrestricted)
                 (data-perms/set-database-permission! group-id (mt/id) :perms/create-queries :query-builder)
                 (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Transforms permission requires"
                                       (data-perms/set-database-permission! group-id (mt/id) :perms/transforms :yes)))
                 (mt/with-current-user (mt/user->id :rasta)
                   (is (not (mi/can-write? (t2/hydrate native :can_write))))
                   (is (not (mi/can-write? (t2/hydrate mbql :can_write))))))
               (testing "with query-builder-and-native, native transform can be written"
                 (data-perms/set-database-permission! group-id (mt/id) :perms/create-queries :query-builder-and-native)
                 (data-perms/set-database-permission! group-id (mt/id) :perms/transforms :yes)
                 (mt/with-current-user (mt/user->id :rasta)
                   (is (mi/can-write? (t2/hydrate native :can_write)))))))))))))

(defn- status-code-of
  "The status code of the exception `thunk` throws, or nil when it throws none."
  [thunk]
  (try
    (thunk)
    nil
    (catch clojure.lang.ExceptionInfo e
      (:status-code (ex-data e)))))

(defn- python-transform-writing-to
  "A Transform row with a Python source that writes to the Database `target-db-id`."
  [target-db-id]
  (assoc (mt/with-temp-defaults :model/Transform)
         :source {:type :python :source-tables [] :body "print(\"hello\")"}
         :target {:type "table" :name (str "target_" (mt/random-name)) :database target-db-id}))

(deftest derived-columns-ignore-incoming-values-test
  (testing "insert computes source_type, source_database_id and target_db_id from the source and target"
    (mt/with-temp [:model/Database {other-db :id} {}
                   :model/Transform transform {:source_type        :python
                                               :source_database_id other-db
                                               :target_db_id       other-db}]
      (is (=? {:source_type        :native
               :source_database_id (mt/id)
               :target_db_id       (mt/id)}
              (t2/select-one :model/Transform :id (:id transform))))))
  (testing "a new source recomputes the columns, also when it reads another database"
    (mt/with-temp [:model/Database {other-db :id} {}
                   :model/Transform {id :id} {}]
      (t2/update! :model/Transform :id id
                  {:source {:type  :query
                            :query (lib/native-query (lib-be/application-database-metadata-provider other-db) "SELECT 1")}})
      (is (=? {:source_database_id other-db
               :target_db_id       other-db}
              (t2/select-one :model/Transform :id id))))))

(deftest derived-columns-cannot-change-alone-test
  (mt/with-temp [:model/Database {other-db :id} {}
                 :model/Transform {id :id} {}]
    (doseq [changes [{:source_type :python}
                     {:source_database_id other-db}
                     {:target_db_id other-db}]]
      (testing (str "changing only " (pr-str (keys changes)))
        (is (= 400 (status-code-of #(t2/update! :model/Transform :id id changes))))))))

(deftest source-database-id-is-callers-when-source-names-none-test
  (mt/when-ee-evailable
   (testing "a Python source without a database leaves source_database_id to the writer"
     (let [defaults (mt/with-temp-defaults :model/Transform)]
       (mt/with-temp [:model/Database {other-db :id} {}
                      :model/Transform {id :id} (assoc defaults
                                                       :source {:type :python :source-tables [] :body "print(\"hello\")"}
                                                       :source_database_id other-db)]
         (is (= other-db (t2/select-one-fn :source_database_id :model/Transform :id id)))
         (testing "writing the same value again changes nothing"
           (t2/update! :model/Transform :id id {:source_database_id other-db})
           (is (= other-db (t2/select-one-fn :source_database_id :model/Transform :id id))))
         (testing "it changes alone"
           (t2/update! :model/Transform :id id {:source_database_id (mt/id)})
           (is (= (mt/id) (t2/select-one-fn :source_database_id :model/Transform :id id))))
         (testing "a source that names a database derives it again"
           (t2/update! :model/Transform :id id {:source {:type :python :source-tables [] :body "print(1)" :source-database other-db}})
           (is (= other-db (t2/select-one-fn :source_database_id :model/Transform :id id)))
           (is (= 400 (status-code-of #(t2/update! :model/Transform :id id {:source_database_id (mt/id)}))))))))))

(deftest refused-write-leaves-the-outer-transaction-usable-test
  (mt/when-ee-evailable
   (mt/with-temp [:model/Database {sample-db :id} {:is_sample true}
                  :model/Transform {other :id} (python-transform-writing-to (mt/id))]
     (let [refused-name (str "refused " (mt/random-name))]
       (t2/with-transaction [_conn]
         (is (= 400 (status-code-of #(transform/create-transforms!
                                      [(assoc (python-transform-writing-to sample-db) :name refused-name)]))))
         (transform/update-transforms! [other] {:description "written after the refusal"}))
       (is (zero? (t2/count :model/Transform :name refused-name)))
       (is (= "written after the refusal" (t2/select-one-fn :description :model/Transform :id other)))))))

(deftest target-database-must-accept-transforms-test
  (mt/when-ee-evailable
   (mt/with-temp [:model/Database {audit-db :id}  {:is_audit true}
                  :model/Database {sample-db :id} {:is_sample true}
                  :model/Database {router-db :id} {}
                  :model/Database {dest-db :id}   {:router_database_id router-db}]
     (testing "a target database that does not exist"
       (is (thrown? Exception (transform/create-transforms! [(python-transform-writing-to Integer/MAX_VALUE)]))))
     (testing "the audit database"
       (is (= 400 (status-code-of #(transform/create-transforms! [(python-transform-writing-to audit-db)])))))
     (testing "the sample database"
       (is (= 400 (status-code-of #(transform/create-transforms! [(python-transform-writing-to sample-db)])))))
     (testing "a destination database of database routing"
       (is (= 400 (status-code-of #(transform/create-transforms! [(python-transform-writing-to dest-db)])))))
     (testing "retargeting an existing transform onto such a database"
       (mt/with-temp [:model/Transform {id :id} (python-transform-writing-to (mt/id))]
         (is (= 400 (status-code-of #(transform/update-transforms! [id] {:target {:type "table" :name "retargeted" :database audit-db}}))))
         (is (= 400 (status-code-of #(transform/update-transforms! [id] {:target {:type "table" :name "retargeted" :database dest-db}})))))))))

(deftest schema-checks-source-and-target-test
  (testing "target without a name"
    (is (not (mr/validate ::transforms.schema/transform-target {:type "table" :database 1}))))
  (testing "target of an unknown type"
    (is (not (mr/validate ::transforms.schema/transform-target {:type "view" :name "v" :database 1}))))
  (testing "query source without a query"
    (is (not (mr/validate ::transforms.schema/transform-source {:type :query})))))

(deftest cycles-are-rejected-on-update-test
  (let [mp     (mt/metadata-provider)
        schema (or (:default_schema (mt/db)) "PUBLIC")]
    (mt/with-temp [:model/Table {table1 :id} {:schema schema :name "cycle_table_1"}
                   :model/Field _ {:table_id table1 :name "foo"}
                   :model/Table {table2 :id} {:schema schema :name "cycle_table_2"}
                   :model/Transform {id :id} {:source {:type :query :query (lib/query mp (lib.metadata/table mp table1))}
                                              :target {:type "table" :schema schema :name "cycle_table_2"}
                                              :target_table_id table2}]
      (testing "retargeting a transform onto its own source table"
        (is (= 400 (status-code-of #(transform/update-transforms! [id] {:target {:type "table" :schema schema :name "cycle_table_1"}})))))
      (testing "an update that leaves the source and target alone checks no cycle"
        (is (nil? (status-code-of #(transform/update-transforms! [id] {:name "renamed"}))))))))

(deftest collection-is-checked-on-update-test
  (mt/with-temp [:model/Collection {transforms-id :id} {:namespace collection/transforms-ns}
                 :model/Collection {regular-id :id} {}
                 :model/Transform {id :id} {:collection_id transforms-id}]
    (is (= 400 (status-code-of #(transform/update-transforms! [id] {:collection_id regular-id}))))
    (is (= transforms-id (t2/select-one-fn :collection_id :model/Transform :id id)))))

(deftest model-writes-publish-lifecycle-events-test
  (let [events-published (atom [])]
    (with-redefs [events/publish-event! (fn [topic _event]
                                          (swap! events-published conj topic))]
      (let [{transform-id :id} (first (transform/create-transforms! [(mt/with-temp-defaults :model/Transform)]))]
        (transform/update-transforms! [transform-id] {:name "Updated Name"})
        (transform/delete-transforms! [transform-id])))
    (is (= [:event/transform-create :event/transform-update :event/transform-delete]
           (filterv #{:event/transform-create :event/transform-update :event/transform-delete} @events-published)))))

(defn- stored-deps [transform-id]
  (t2/select-one-fn :table_dependencies :model/Transform :id transform-id))

(deftest table-dependencies-cache-test
  (testing "table_dependencies is not computed on insert — it is filled lazily on the first read"
    (mt/with-temp [:model/Transform {id :id}
                   {:name   "deps insert"
                    :source {:type  :query
                             :query (lib/query (mt/metadata-provider) (lib.metadata/table (mt/metadata-provider) (mt/id :orders)))}}]
      (is (nil? (stored-deps id)))))
  (testing "changing the source invalidates any cached table_dependencies"
    (mt/with-temp [:model/Transform {id :id}
                   {:name   "deps update"
                    :source {:type  :query
                             :query (lib/query (mt/metadata-provider) (lib.metadata/table (mt/metadata-provider) (mt/id :orders)))}}]
      ;; seed a cached value (as the lazy read path would)
      (t2/update! :model/Transform :id id {:table_dependencies [{:table (mt/id :orders)}]})
      (is (= [{:table (mt/id :orders)}] (stored-deps id)))
      (t2/update! :model/Transform :id id
                  {:source {:type  :query
                            :query (lib/query (mt/metadata-provider) (lib.metadata/table (mt/metadata-provider) (mt/id :people)))}})
      (is (nil? (stored-deps id))))))

(defn- insert-run! [transform-id status months-ago]
  (t2/insert! :model/TransformRun
              {:transform_id transform-id
               :status       status
               :run_method   :cron
               :start_time   (stale-test/datetime-months-ago months-ago)
               :end_time     (stale-test/datetime-months-ago months-ago)}))

(deftest stale-candidates-test
  (testing "a transform is stale when never run past a created_at grace period, or its most recent run predates the cutoff"
    (let [cutoff-months   6
          old-months      (+ cutoff-months 2) ; predates the cutoff
          recent-months   1                   ; within the cutoff
          ;; fires once a year, ~2 months from now — so its previous fire was ~10 months ago,
          ;; before the old runs: nothing has fired since them
          schedule-anchor (-> (java.time.LocalDate/now) (.plusMonths 2) (.withDayOfMonth 15))
          yearly-cron     (format "0 0 0 15 %d ?" (.getMonthValue schedule-anchor))
          daily-cron      "0 0 0 * * ?"]
      (mt/with-temp [:model/Transform {never-new-id :id}       {:name "never-new"}
                     :model/Transform {never-old-id :id}       {:name "never-old"
                                                                :created_at (stale-test/datetime-months-ago old-months)}
                     :model/Transform {old-id :id}             {:name "old-run"}
                     :model/Transform {fresh-id :id}           {:name "fresh-run"}
                     :model/Transform {recent-failed-id :id}   {:name "recent-failed"}
                     :model/Transform {old-failed-id :id}      {:name "old-failed"}
                     :model/Transform {old-then-recent-id :id} {:name "old-then-recent"}
                     :model/Transform {on-schedule-id :id}     {:name "on-schedule"}
                     :model/Transform {missed-schedule-id :id} {:name "missed-schedule"}
                     :model/Transform {never-scheduled-id :id} {:name "never-run-scheduled"
                                                                :created_at (stale-test/datetime-months-ago old-months)}
                     :model/TransformTag {slow-tag-id :id}     {}
                     :model/TransformTag {fast-tag-id :id}     {}
                     :model/TransformJob {slow-job-id :id}     {:name "yearly job" :schedule yearly-cron}
                     :model/TransformJob {fast-job-id :id}     {:name "daily job" :schedule daily-cron}
                     :model/TransformJobTransformTag _ {:job_id slow-job-id :tag_id slow-tag-id :position 0}
                     :model/TransformJobTransformTag _ {:job_id fast-job-id :tag_id fast-tag-id :position 0}
                     :model/TransformTransformTag _ {:transform_id on-schedule-id :tag_id slow-tag-id :position 0}
                     :model/TransformTransformTag _ {:transform_id missed-schedule-id :tag_id fast-tag-id :position 0}
                     :model/TransformTransformTag _ {:transform_id never-scheduled-id :tag_id slow-tag-id :position 0}]
        (insert-run! old-id :succeeded old-months)
        (insert-run! fresh-id :succeeded recent-months)
        ;; status is irrelevant — only the most recent run's start_time matters
        (insert-run! recent-failed-id :failed recent-months)
        (insert-run! old-failed-id :failed old-months)
        ;; two runs: the most recent (recent-months) governs, not the earlier one (old-months)
        (insert-run! old-then-recent-id :succeeded old-months)
        (insert-run! old-then-recent-id :succeeded recent-months)
        ;; both scheduled transforms last ran old-months ago; the yearly schedule hasn't fired since
        ;; (previous fire ~10 months ago), the daily schedule has fired thousands of times since
        (insert-run! on-schedule-id :succeeded old-months)
        (insert-run! missed-schedule-id :succeeded old-months)
        (let [stale-ids (set (map :id (t2/query ((staleness/candidates-fn :model/Transform)
                                                 {:collection-ids :all
                                                  :cutoff-date    (stale-test/date-months-ago cutoff-months)}))))]
          (testing "a never-run transform is stale only once its created_at passes the cutoff"
            (is (contains? stale-ids never-old-id))
            (is (not (contains? stale-ids never-new-id))))
          (testing "a transform whose most recent run started before the cutoff is stale, regardless of status"
            (is (contains? stale-ids old-id))
            (is (contains? stale-ids old-failed-id)))
          (testing "a transform with a recent run is not stale, regardless of status"
            (is (not (contains? stale-ids fresh-id)))
            (is (not (contains? stale-ids recent-failed-id))))
          (testing "the most recent run governs: an old run followed by a recent one is not stale"
            (is (not (contains? stale-ids old-then-recent-id))))
          (testing "an old run is not stale while a slower-than-threshold schedule has not fired since it"
            (is (not (contains? stale-ids on-schedule-id))))
          (testing "an old run is stale when its schedule has fired since it (missed fires)"
            (is (contains? stale-ids missed-schedule-id)))
          (testing "the schedule exception does not shield never-run transforms"
            (is (contains? stale-ids never-scheduled-id))))))))

(deftest stale-candidates-collection-scoping-test
  (testing "the Transform candidates scope transforms to :collection-ids, like the card and dashboard arms"
    (let [cutoff-months 6
          ;; never run and created before the cutoff, so each one is stale on the created_at arm alone
          long-ago      (stale-test/datetime-months-ago (+ cutoff-months 2))]
      (mt/with-temp [:model/Collection {coll-a :id}  {:namespace "transforms"}
                     :model/Collection {coll-b :id}  {:namespace "transforms"}
                     :model/Transform  {in-a :id}    {:name "in-a"    :collection_id coll-a :created_at long-ago}
                     :model/Transform  {in-b :id}    {:name "in-b"    :collection_id coll-b :created_at long-ago}
                     :model/Transform  {at-root :id} {:name "at-root" :created_at long-ago}]
        (let [mine      #{in-a in-b at-root}
              ;; the table carries transforms from elsewhere in the suite, so narrow to this test's rows
              stale-ids (fn [collection-ids]
                          (into #{}
                                (comp (map :id) (filter mine))
                                (t2/query ((staleness/candidates-fn :model/Transform)
                                           {:collection-ids collection-ids
                                            :cutoff-date    (stale-test/date-months-ago cutoff-months)}))))]
          (testing "a named collection returns its own stale transforms and no others"
            (is (= #{in-a} (stale-ids #{coll-a})))
            (is (= #{in-b} (stale-ids #{coll-b}))))
          (testing "several collections return the union"
            (is (= #{in-a in-b} (stale-ids #{coll-a coll-b}))))
          (testing "a nil member selects root-level transforms alongside the named collection"
            (is (= #{in-a at-root} (stale-ids #{coll-a nil}))))
          (testing "an empty set means no collections, not every collection"
            (is (= #{} (stale-ids #{}))))
          (testing ":all searches instance-wide"
            (is (= mine (stale-ids :all)))))))))

(deftest last-run-hydration-omits-heartbeat-test
  (testing "the `:last_run` hydrated onto a transform leaves out the run's internal `last_heartbeat`"
    (mt/with-temp [:model/Transform    {transform-id :id} {}
                   :model/TransformRun {run-id :id}       {:transform_id        transform-id
                                                           :transform_name      "heartbeat"
                                                           :transform_entity_id "eid"
                                                           :status              "started"
                                                           :is_active           true
                                                           :run_method          "manual"
                                                           :last_heartbeat      (t/offset-date-time)}]
      (let [last-run (:last_run (t2/hydrate (t2/select-one :model/Transform :id transform-id) :last_run))]
        (is (=? {:id run-id, :transform_id transform-id} last-run))
        (is (not (contains? last-run :last_heartbeat)))))))

(mt/when-ee-evailable
 (deftest source-references-gate-transform-permissions-test
   (testing "A Card the source query names is required to read, write or create the transform"
     (mt/with-premium-features #{:transforms-basic :hosting :advanced-permissions}
       (mt/with-temp [:model/PermissionsGroup {group-id :id} {}
                      :model/PermissionsGroupMembership _ {:user_id (mt/user->id :rasta) :group_id group-id}
                      :model/Collection collection {}
                      :model/Card {card-id :id}
                      {:collection_id (:id collection)
                       :database_id   (mt/id)
                       :dataset_query (lib/query (mt/metadata-provider)
                                                 (lib.metadata/table (mt/metadata-provider) (mt/id :orders)))}
                      :model/Transform transform
                      {:name   "Reads a Card"
                       :source {:type  :query
                                :query (lib/with-template-tags
                                         (lib/native-query (mt/metadata-provider) (format "SELECT * FROM {{#%d}} AS c" card-id))
                                         {(str "#" card-id)
                                          {:id           (str "#" card-id)
                                           :name         (str "#" card-id)
                                           :display-name (str "#" card-id)
                                           :type         :card
                                           :card-id      card-id}})}}]
         (mt/with-non-admin-groups-no-collection-perms collection
           (let [stored (t2/select-one :model/Transform :id (:id transform))
                 body   (into {} stored)]
             (mt/with-data-analyst-role! (mt/user->id :rasta)
               (mt/with-restored-data-perms!
                 (data-perms/set-database-permission! group-id (mt/id) :perms/view-data :unrestricted)
                 (data-perms/set-database-permission! group-id (mt/id) :perms/create-queries :query-builder-and-native)
                 (data-perms/set-database-permission! group-id (mt/id) :perms/transforms :yes)
                 (testing "while the Card is unreadable"
                   (mt/with-current-user (mt/user->id :rasta)
                     (is (not (mi/can-read? (t2/hydrate stored :can_read))))
                     (is (not (mi/can-write? (t2/hydrate stored :can_write))))
                     (is (not (mi/can-create? :model/Transform body)))))
                 (perms/grant-collection-read-permissions! group-id collection)
                 (testing "once the Card is readable"
                   (mt/with-current-user (mt/user->id :rasta)
                     (is (mi/can-read? (t2/hydrate stored :can_read)))
                     (is (mi/can-write? (t2/hydrate stored :can_write)))
                     (is (mi/can-create? :model/Transform body)))))))))))))

(deftest data-analyst-access-follows-the-advanced-permissions-feature-test
  (testing "a data analyst reads and writes transforms only while advanced-permissions is available"
    (mt/with-temp [:model/PermissionsGroup {group-id :id} {}
                   :model/PermissionsGroupMembership _ {:user_id (mt/user->id :rasta) :group_id group-id}
                   :model/Transform transform
                   {:name   "MBQL Transform"
                    :source {:type  :query
                             :query (lib/query (mt/metadata-provider)
                                               (lib.metadata/table (mt/metadata-provider) (mt/id :orders)))}}]
      (let [stored (t2/select-one :model/Transform :id (:id transform))]
        (mt/with-data-analyst-role! (mt/user->id :rasta)
          (mt/with-restored-data-perms!
            (data-perms/set-database-permission! group-id (mt/id) :perms/view-data :unrestricted)
            (data-perms/set-database-permission! group-id (mt/id) :perms/create-queries :query-builder-and-native)
            (data-perms/set-database-permission! group-id (mt/id) :perms/transforms :yes)
            (mt/with-current-user (mt/user->id :rasta)
              (mt/when-ee-evailable
               (mt/with-premium-features #{:transforms-basic :hosting :advanced-permissions}
                 (is (mi/can-read? (t2/hydrate stored :can_read)))
                 (is (mi/can-write? (t2/hydrate stored :can_write)))
                 (is (mi/can-create? :model/Transform (into {} stored)))))
              (testing "and none once the feature is gone"
                (mt/with-premium-features #{:transforms-basic :hosting}
                  (is (not (mi/can-read? (t2/hydrate stored :can_read))))
                  (is (not (mi/can-write? (t2/hydrate stored :can_write))))
                  (is (not (mi/can-create? :model/Transform (into {} stored)))))))))))))

(deftest delete-while-run-writes-transform-does-not-deadlock-test
  (testing "Deleting a transform while a run writes the transform row succeeds without a deadlock"
    ;; The run updates the transform row, then upserts its search-index row in the same transaction
    ;; (`with-temp-index-table` indexes synchronously). The delete must not take the search-index row before the
    ;; transform row; delete capture purges the search-index row only after the delete commits.
    ;; The redef pauses the run between its two writes while the delete starts and waits on the transform row.
    (search.tu/with-temp-index-table
      (let [transform-id   (t2/insert-returning-pk! :model/Transform
                                                    {:name   "Deleted while running"
                                                     :source {:type :python :source-tables [] :body "pass"}
                                                     :target {:type "table" :schema "public" :name "deadlock_target"}})
            run-updated    (promise)
            search-update! (mt/original-fn #'search/update!)]
        (try
          (mt/with-dynamic-fn-redefs [search/update! (fn [instance & more]
                                                       (when (= :model/Transform (t2/model instance))
                                                         (deliver run-updated true)
                                                         ;; Postgres checks a lock wait for a deadlock once,
                                                         ;; `deadlock_timeout` (1 s by default) after the wait starts.
                                                         ;; A longer pause gives the delete's wait that check before
                                                         ;; the run writes the search-index row.
                                                         (Thread/sleep 1500))
                                                       (apply search-update! instance more))]
            (let [run     (future
                            (transform/update-transforms! [transform-id] {:target_table_id (mt/id :venues)}))
                  delete  (future
                            (deref run-updated 30000 nil)
                            (t2/delete! :model/Transform :id transform-id))
                  outcome (fn [fut]
                            (try (deref fut 90000 ::timed-out)
                                 (catch Exception e (ex-message (or (ex-cause e) e)))))]
              (is (= 1 (outcome delete)))
              (testing "the run ends without a deadlock"
                (let [run-outcome (outcome run)]
                  (is (not= ::timed-out run-outcome))
                  (is (not (re-find #"(?i)deadlock" (str run-outcome))))))
              (is (not (t2/exists? :model/Transform :id transform-id)))))
          (finally
            (t2/delete! :model/Transform :id transform-id)))))))

(defn- cycle-table-query [table-id]
  (let [mp (mt/metadata-provider)]
    (lib/query mp (lib.metadata/table mp table-id))))

(defn- cycle-transform [query name]
  {:source {:type :query :query query}
   :name   (str "transform_" name)
   :target {:schema "PUBLIC" :name name :type "table"}})

(defmacro ^:private with-cycle-scan-count
  "Run `body` and return how many times it scanned the transforms for a cycle."
  [& body]
  `(let [scans# (atom 0)
         scan#  (dynamic-redefs/original-fn #'ordering/get-transform-cycles)]
     (mt/with-dynamic-fn-redefs [ordering/get-transform-cycles (fn [& args#]
                                                                 (swap! scans# inc)
                                                                 (apply scan# args#))]
       ~@body)
     @scans#))

(deftest cycle-check-runs-when-definition-changes-test
  (mt/with-temp [:model/Table {table-1 :id} {:schema "PUBLIC", :name "cycle_1"}
                 :model/Field _ {:table_id table-1, :name "foo"}
                 :model/Table {table-2 :id} {:schema "PUBLIC", :name "cycle_2"}
                 :model/Field _ {:table_id table-2, :name "foo"}
                 :model/Table {table-3 :id} {:schema "PUBLIC", :name "cycle_3"}
                 :model/Field _ {:table_id table-3, :name "foo"}
                 :model/Transform _ (-> (cycle-transform (cycle-table-query table-1) "cycle_2")
                                        (assoc :target_table_id table-2))
                 :model/Transform {reader :id} (cycle-transform (cycle-table-query table-2) "cycle_4")
                 :model/Transform {writer :id} (-> (cycle-transform (cycle-table-query table-3) "cycle_1")
                                                   (assoc :target_table_id table-1))]
    (let [schema "PUBLIC"]
      (testing "an update that leaves the definition alone scans nothing"
        (is (zero? (with-cycle-scan-count
                     (transform/update-transforms! [reader] {:name "renamed" :description "described"})
                     (transform/update-transforms! [reader] {:last_checkpoint_value "5"})))))
      (testing "closing a loop from the target side, with the source untouched, is refused"
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Cyclic transform definitions detected"
                              (transform/update-transforms! [reader] {:target {:schema schema :name "cycle_1" :type "table"}}))))
      (testing "closing a loop from the source side is refused"
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Cyclic transform definitions detected"
                              (transform/update-transforms! [writer] {:source {:type :query :query (cycle-table-query table-2)}}))))
      (testing "an update of the source scans once"
        (is (= 1 (with-cycle-scan-count
                   (transform/update-transforms! [reader] {:source {:type :query :query (cycle-table-query table-3)}}))))))))

(deftest cycle-check-runs-once-per-update-test
  (mt/with-temporary-raw-setting-values [transforms-enabled "true"]
    (mt/with-premium-features #{:transforms-basic}
      (mt/with-temp [:model/Table {table-1 :id} {:schema "PUBLIC", :name "once_1"}
                     :model/Field _ {:table_id table-1, :name "foo"}
                     :model/Table {table-2 :id} {:schema "PUBLIC", :name "once_2"}
                     :model/Field _ {:table_id table-2, :name "foo"}
                     :model/Transform {id :id} (cycle-transform (cycle-table-query table-1) "once_3")]
        (mt/with-dynamic-fn-redefs [driver.u/supports? (fn [& _] true)]
          (mt/with-current-user (mt/user->id :crowberto)
            (testing "an update through the write function scans once"
              (is (= 1 (with-cycle-scan-count
                         (transforms.core/update-transform! id {:source {:type :query :query (cycle-table-query table-2)}})))))
            (testing "writing the stored definition again, as a SerDes reimport does, scans nothing"
              (let [stored (t2/select-one :model/Transform :id id)]
                (is (zero? (with-cycle-scan-count
                             (transform/update-transforms! [id] (select-keys stored [:name :source :target])))))))))))))

(defn- transform-rows
  "`n` Transform rows with distinct names and targets, whose sources hold no query: a query is normalized against the
  metadata provider, which loads metadata lazily, a statement count apart from the write."
  [n]
  (vec (repeatedly n #(let [table-name (mt/random-name)]
                        {:name   (mt/random-name)
                         :source {:type :python :source-tables [] :body "print(1)" :source-database (mt/id)}
                         :target {:type "table" :database (mt/id) :schema "PUBLIC" :name table-name}}))))

(deftest write-function-statement-counts-do-not-grow-with-rows-test
  (let [created (atom [])
        create! (fn [n]
                  (events.tu/statement-count! (fn [] (swap! created into (map :id (transform/create-transforms! (transform-rows n)))))))]
    (try
      (testing "creating transforms"
        (create! 1)
        (is (= (create! 2) (create! 6))))
      (testing "updating transforms with one change set"
        (let [update! (fn [ids]
                        (events.tu/statement-count!
                         (fn [] (transform/update-transforms! ids {:description "described"}))))
              ids     @created]
          (update! (take 1 ids))
          (is (= (update! (take 2 (drop 1 ids))) (update! (take 6 (drop 3 ids)))))))
      (testing "deleting transforms"
        (let [delete! (fn [ids]
                        (events.tu/statement-count! (fn [] (transform/delete-transforms! ids))))
              ids     @created]
          (delete! (take 1 ids))
          (is (= (delete! (take 2 (drop 1 ids))) (delete! (take 6 (drop 3 ids)))))))
      (finally
        (t2/delete! :model/Transform :id [:in @created])))))

(deftest create-transforms-with-different-key-sets-test
  (mt/with-model-cleanup [:model/Transform]
    (let [[plain described] (transform/create-transforms! [(first (transform-rows 1))
                                                           (assoc (first (transform-rows 1)) :description "About")])]
      (is (nil? (t2/select-one-fn :description :model/Transform :id (:id plain))))
      (is (= "About" (t2/select-one-fn :description :model/Transform :id (:id described)))))))

(deftest mixed-state-write-function-statement-counts-do-not-grow-with-rows-test
  (mt/with-temp [:model/Collection {target :id} {:namespace :transforms}
                 :model/Collection {c1 :id} {:namespace :transforms}
                 :model/Collection {c2 :id} {:namespace :transforms}
                 :model/Collection {c3 :id} {:namespace :transforms}
                 :model/Collection {c4 :id} {:namespace :transforms}
                 :model/Collection {c5 :id} {:namespace :transforms}]
    (mt/with-model-cleanup [:model/Transform]
      (let [collections [target c1 c2 c3 c4 c5]
            make!       (fn [n]
                          (mapv :id (transform/create-transforms!
                                     (into [] (map-indexed (fn [i row]
                                                             (cond-> (assoc row :collection_id (nth collections i))
                                                               (zero? i) (assoc :description "moved")))
                                                           (transform-rows n))))))]
        (testing "creating transforms in a Collection each"
          (let [create! (fn [n]
                          (let [rows (into [] (map-indexed (fn [i row] (assoc row :collection_id (nth collections i))) (transform-rows n)))]
                            (events.tu/statement-count! #(transform/create-transforms! rows))))]
            (create! 1)
            (is (= (create! 2) (create! 6)))))
        (testing "moving transforms of several Collections, one already in the target, and describing them"
          (let [move! (fn [ids]
                        (events.tu/statement-count!
                         #(transform/update-transforms! ids {:collection_id target :description "moved"})))]
            (move! (make! 1))
            (is (= (move! (make! 2)) (move! (make! 6))))))))))

(deftest definition-update-statement-count-does-not-grow-with-rows-test
  (mt/with-model-cleanup [:model/Transform]
    (let [counted (fn [n body]
                    (let [ids (mapv :id (transform/create-transforms! (transform-rows n)))]
                      (events.tu/statement-count!
                       #(transform/update-transforms! ids {:source {:type :python :source-tables [] :body body :source-database (mt/id)}}))))]
      (counted 1 "print(2)")
      (is (= (counted 2 "print(3)") (counted 6 "print(4)"))))))

(deftest tag-link-writes-statement-count-does-not-grow-with-tags-test
  (mt/with-model-cleanup [:model/Transform :model/TransformTag]
    (let [tags    (mapv :id (transform-tag/create-transform-tags! (mapv #(hash-map :name (str "tag " % (mt/random-name))) (range 8))))
          counted (fn [n]
                    (let [id (:id (first (transform/create-transforms! (transform-rows 1))))]
                      (transform/update-transform! id {:tag_ids (vec (take n tags))})
                      (events.tu/statement-count!
                       #(transform/update-transform! id {:tag_ids (into [(nth tags n)] (reverse (rest (take n tags))))}))))]
      (counted 2)
      (is (= (counted 2) (counted 6))))))

(deftest create-transforms-refuses-invalid-rows-and-writes-nothing-test
  (mt/with-temp [:model/Collection {regular-id :id} {}
                 :model/Collection {transforms-id :id} {:namespace collection/transforms-ns}]
    (let [missing-id (inc (t2/select-one-fn :id [:model/Collection :id] {:order-by [[:id :desc]]}))
          status-of  (fn [collection-ids]
                       (try (transform/create-transforms!
                             (mapv #(assoc %1 :collection_id %2) (transform-rows (count collection-ids)) collection-ids))
                            nil
                            (catch clojure.lang.ExceptionInfo e (:status-code (ex-data e)))))]
      (mt/with-model-cleanup [:model/Transform]
        (testing "a row in the wrong namespace is refused"
          (is (= 400 (status-of [transforms-id regular-id]))))
        (testing "a row in a missing Collection is refused"
          (is (= 404 (status-of [transforms-id missing-id]))))
        (testing "nothing is written"
          (is (zero? (t2/count :model/Transform :collection_id [:in [regular-id transforms-id missing-id]]))))))))

(deftest refused-transform-rolls-back-to-savepoint-test
  (mt/with-temp [:model/Collection {regular-id :id} {}]
    (mt/with-model-cleanup [:model/Transform]
      (let [[{id :id} {other-id :id}] (transform/create-transforms! (transform-rows 2))]
        (t2/with-transaction [_conn]
          (is (= 400 (try (transform/update-transforms! [id] {:collection_id regular-id})
                          nil
                          (catch clojure.lang.ExceptionInfo e (:status-code (ex-data e))))))
          (transform/update-transforms! [other-id] {:name "renamed in the outer transaction"}))
        (is (nil? (t2/select-one-fn :collection_id :model/Transform :id id)))
        (is (= "renamed in the outer transaction" (t2/select-one-fn :name :model/Transform :id other-id)))))))

(defn- statements-outside-query-analysis!
  "The number of app-DB statements `thunk` runs, leaving out the reads of group memberships and table remappings that
  the query processor makes each time it analyzes a query."
  [thunk]
  (let [statements (atom [])
        reduce-fn  @#'t2.jdbc.query/reduce-jdbc-query]
    (events.tu/without-delivery
     (with-redefs-fn {#'t2.jdbc.query/reduce-jdbc-query
                      (fn [& args]
                        (swap! statements conj (str (first (second (take-last 3 args)))))
                        (apply reduce-fn args))}
       thunk))
    (count (remove #(re-find #"(?i)permissions_group_membership|table_remapping" %) @statements))))

(deftest query-definition-update-statement-count-does-not-grow-with-rows-test
  (mt/with-model-cleanup [:model/Transform]
    (let [mp      (mt/metadata-provider)
          query   (fn [limit] (lib/limit (lib/query mp (lib.metadata/table mp (mt/id :orders))) limit))
          counted (fn [n limit]
                    (let [ids (mapv :id (transform/create-transforms!
                                         (mapv (fn [_] (cycle-transform (query 1) (mt/random-name))) (range n))))]
                      (statements-outside-query-analysis! #(transform/update-transforms! ids {:source {:type :query :query (query limit)}}))))]
      (counted 1 2)
      (is (= (counted 2 3) (counted 6 4))))))
