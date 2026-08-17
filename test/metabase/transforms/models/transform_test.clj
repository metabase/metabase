(ns metabase.transforms.models.transform-test
  (:require
   [clojure.test :refer :all]
   [metabase.events.core :as events]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.models.interface :as mi]
   [metabase.permissions.models.data-permissions :as data-perms]
   [metabase.permissions.models.permissions-group :as perms-group]
   [metabase.stale-test :as stale-test]
   [metabase.staleness.core :as staleness]
   [metabase.test :as mt]
   [metabase.transforms-base.query :as transforms-base.query]
   [metabase.transforms.query-test-util :as query-test-util]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(deftest source-database-id-set-test
  (testing "inserting a transform correctly sets the source-database-id column"
    (mt/with-temp [:model/Transform transform
                   {:name   "Test Transform"
                    :source {:type  "query"
                             :query {:database (mt/id)
                                     :type     "native"
                                     :native   {:query "SELECT 1"}}}}]
      (is (= (mt/id) (:source_database_id transform)))))
  (testing "A transform with no source database has a nil source_database_id"
    (mt/with-temp [:model/Transform transform
                   {:name   "Test Transform"
                    :source {:type "python"
                             :body "print(\"hello\")"}}]
      (is (nil? (:source_database_id transform)))))
  (testing "updating a transform recomputes the source-database-id column from the source"
    (mt/with-temp [:model/Transform transform
                   {:name   "Test Transform"
                    :source {:type "python"
                             :body "print(\"hello\")"}}]
      (is (nil? (:source_database_id transform)))
      (t2/update! :model/Transform (:id transform) {:source {:type  "query"
                                                             :query {:database (mt/id)
                                                                     :type     "native"
                                                                     :native   {:query "SELECT 1"}}}})
      (is (= (mt/id) (t2/select-one-fn :source_database_id :model/Transform (:id transform)))))))

(deftest source-database-deletion-sets-null-test
  (testing "deleting a database referenced by a transform nulls the transform's source_database_id (ON DELETE SET NULL)"
    (mt/with-temp [:model/Database {db-id :id} {}
                   :model/Transform transform
                   {:name   "Test Transform"
                    :source {:type  "query"
                             :query {:database db-id
                                     :type     "native"
                                     :native   {:query "SELECT 1"}}}}]
      (is (= db-id (:source_database_id transform)))
      (t2/delete! :model/Database db-id)
      (is (nil? (t2/select-one-fn :source_database_id :model/Transform (:id transform))))
      ;; transform itself still exists
      (is (some? (t2/select-one :model/Transform (:id transform)))))))

(defn- temp-transform-with-index! [thunk]
  (mt/with-temp [:model/Transform {transform-id :id}
                 {:name   (mt/random-name)
                  :source {:type "query" :query (query-test-util/make-query :source-table "venues")}
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
       (t2/update! :model/Transform transform-id
                   {:source {:type "query" :query (query-test-util/make-query :source-table "checkins")}})
       (is (= :update-pending (t2/select-one-fn :status :model/TableIndex index-id))))))
  (testing "retargeting to a different table marks the transform's managed indexes for revalidation"
    (temp-transform-with-index!
     (fn [transform-id index-id]
       (t2/update! :model/Transform transform-id
                   {:target {:database (mt/id) :type "table" :schema "public" :name (mt/random-name)}})
       (is (= :update-pending (t2/select-one-fn :status :model/TableIndex index-id))))))
  (testing "an unrelated edit (renaming the transform) leaves the indexes alone"
    (temp-transform-with-index!
     (fn [transform-id index-id]
       (t2/update! :model/Transform transform-id {:name "renamed"})
       (is (= :succeeded (t2/select-one-fn :status :model/TableIndex index-id)))))))

(deftest can-read-write-on-orphaned-transform-test
  (testing "superusers can read/write a transform whose source database has been deleted, data analysts cannot"
    (mt/with-premium-features #{:transforms-basic :hosting}
      (mt/with-temp [:model/Database {db-id :id} {}
                     :model/Transform transform
                     {:name   "Orphan Transform"
                      :source {:type  "query"
                               :query {:database db-id
                                       :type     "native"
                                       :native   {:query "SELECT 1"}}}}]
        (t2/delete! :model/Database db-id)
        (let [reloaded (t2/select-one :model/Transform (:id transform))]
          (is (nil? (:source_database_id reloaded)))
          (mt/with-current-user (mt/user->id :crowberto)
            (is (mi/can-read? reloaded))
            (is (mi/can-write? reloaded)))
          (mt/with-current-user (mt/user->id :rasta)
            (is (not (mi/can-read? reloaded)))
            (is (not (mi/can-write? reloaded)))))))))

(deftest native-transform-requires-query-builder-and-native-test
  (testing "Writing a native-query transform requires \"Query builder and native\" on the source database, even if the
            group was misconfigured with transforms permission but only query-builder access (no native)."
    (mt/with-premium-features #{:transforms-basic :hosting}
      (mt/with-temp [:model/PermissionsGroup {group-id :id} {}
                     :model/PermissionsGroupMembership _ {:user_id (mt/user->id :rasta) :group_id group-id}
                     :model/Transform native-transform
                     {:name   "Native Transform"
                      :source {:type  "query"
                               :query {:database (mt/id)
                                       :type     "native"
                                       :native   {:query "SELECT 1"}}}}
                     :model/Transform mbql-transform
                     {:name   "MBQL Transform"
                      :source {:type  "query"
                               :query (lib/query (mt/metadata-provider)
                                                 (lib.metadata/table (mt/metadata-provider) (mt/id :orders)))}}]
        (let [native (t2/select-one :model/Transform (:id native-transform))
              mbql   (t2/select-one :model/Transform (:id mbql-transform))]
          (mt/with-data-analyst-role! (mt/user->id :rasta)
            (mt/with-restored-data-perms!
              ;; Remove native access granted to All Users by default so the user's only path to native would be
              ;; the (mis)configured transforms group.
              (data-perms/set-database-permission! (perms-group/all-users) (mt/id) :perms/view-data :unrestricted)
              (data-perms/set-database-permission! (perms-group/all-users) (mt/id) :perms/create-queries :query-builder)
              (testing "transforms granted, but create-queries only query-builder (no native) — preexisting misconfiguration"
                (data-perms/set-database-permission! group-id (mt/id) :perms/view-data :unrestricted)
                (data-perms/set-database-permission! group-id (mt/id) :perms/create-queries :query-builder)
                (data-perms/set-database-permission! group-id (mt/id) :perms/transforms :yes)
                (mt/with-current-user (mt/user->id :rasta)
                  (testing "native transform cannot be written"
                    (is (not (mi/can-write? native))))
                  (testing "non-native (MBQL) transform is unaffected"
                    (is (mi/can-write? mbql)))))
              (testing "with query-builder-and-native, native transform can be written"
                (data-perms/set-database-permission! group-id (mt/id) :perms/create-queries :query-builder-and-native)
                (data-perms/set-database-permission! group-id (mt/id) :perms/transforms :yes)
                (mt/with-current-user (mt/user->id :rasta)
                  (is (mi/can-write? native)))))))))))

(deftest execute-fails-clearly-when-source-db-deleted-test
  (testing "running a query transform whose source database has been deleted fails with a clear error"
    (mt/with-premium-features #{:transforms-basic}
      (mt/with-temp [:model/Database {db-id :id} {}
                     :model/Transform transform
                     {:name "Will be orphaned"
                      :source {:type  :query
                               :query {:database db-id
                                       :type     :native
                                       :native   {:query "SELECT 1"}}}}]
        (t2/delete! :model/Database db-id)
        (let [reloaded (t2/select-one :model/Transform (:id transform))
              {:keys [status error]} (transforms-base.query/run-query-transform! reloaded nil)]
          (is (= :failed status))
          (is (re-find #"Source database for this transform has been deleted"
                       (ex-message error))))))))

(deftest no-events-during-deserialization-test
  (testing "Transform lifecycle hooks do not publish events during deserialization"
    (let [events-published (atom [])
          source           {:type  "query"
                            :query {:database (mt/id)
                                    :type     "native"
                                    :native   {:query "SELECT 1"}}}]
      (with-redefs [events/publish-event! (fn [topic event]
                                            (swap! events-published conj [topic event]))]
        (testing "events fire normally for insert/update/delete"
          (mt/with-temp [:model/Transform {transform-id :id} {:name "Test Transform" :source source}]
            (is (some #(= :event/create-transform (first %)) @events-published))
            (reset! events-published [])
            (t2/update! :model/Transform transform-id {:name "Updated Name"})
            (is (some #(= :event/update-transform (first %)) @events-published))
            (reset! events-published [])
            (t2/delete! :model/Transform transform-id)
            (is (some #(= :event/delete-transform (first %)) @events-published))))
        (reset! events-published [])
        (testing "events are suppressed during deserialization"
          (binding [mi/*deserializing?* true]
            (mt/with-temp [:model/Transform {transform-id :id} {:name "Deserialized Transform" :source source}]
              (t2/update! :model/Transform transform-id {:name "Deserialized Update"})
              (t2/delete! :model/Transform transform-id)))
          (is (empty? @events-published)))))))

(defn- stored-deps [transform-id]
  (t2/select-one-fn :table_dependencies :model/Transform transform-id))

(deftest table-dependencies-cache-test
  (testing "table_dependencies is not computed on insert — it is filled lazily on the first read"
    (mt/with-temp [:model/Transform {id :id}
                   {:name   "deps insert"
                    :source {:type  "query"
                             :query {:database (mt/id)
                                     :type     "query"
                                     :query    {:source-table (mt/id :orders)}}}}]
      (is (nil? (stored-deps id)))))
  (testing "changing the source invalidates any cached table_dependencies"
    (mt/with-temp [:model/Transform {id :id}
                   {:name   "deps update"
                    :source {:type  "query"
                             :query {:database (mt/id)
                                     :type     "query"
                                     :query    {:source-table (mt/id :orders)}}}}]
      ;; seed a cached value (as the lazy read path would)
      (t2/update! :model/Transform id {:table_dependencies [{:table (mt/id :orders)}]})
      (is (= [{:table (mt/id :orders)}] (stored-deps id)))
      (t2/update! :model/Transform id
                  {:source {:type  "query"
                            :query {:database (mt/id)
                                    :type     "query"
                                    :query    {:source-table (mt/id :people)}}}})
      (is (nil? (stored-deps id))))))

(defn- insert-run! [transform-id status months-ago]
  (t2/insert! :model/TransformRun
              {:transform_id transform-id
               :status       status
               :run_method   :cron
               :start_time   (stale-test/datetime-months-ago months-ago)
               :end_time     (stale-test/datetime-months-ago months-ago)}))

(deftest find-stale-query-test
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
        (let [stale-ids (set (map :id (t2/query (staleness/find-stale-query
                                                 :model/Transform
                                                 {:collection-ids #{}
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
