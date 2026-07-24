(ns metabase.explorations.derived-perms-test
  "Thread-granularity rollup of the per-snapshot data-access gate. The sandbox/impersonation/routing
  lens dimensions are covered end-to-end in `metabase-enterprise.sandbox.explorations-test`; these
  cover the rollup itself — the fail-closed default (which the creator gets no exemption from), and
  the batching that must not merge snapshots requiring different permissions."
  (:require
   [clojure.test :refer :all]
   [metabase.explorations.derived-perms :as derived-perms]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.permissions.core :as perms]
   [metabase.permissions.models.permissions-group :as perms-group]
   [metabase.request.core :as request]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- count-query
  "A count metric over `table-kw`, so different tables mean genuinely different required perms."
  [table-kw]
  (let [mp (mt/metadata-provider)]
    (lib/->legacy-MBQL (-> (lib/query mp (lib.metadata/table mp (mt/id table-kw)))
                           (lib/aggregate (lib/count))))))

(defn- thread-with-snapshots!
  "A thread whose queries are each backed by one StoredResult built from `snapshot-specs`
  (`{:creator-id, :table, :token}`). Returns the thread id."
  [snapshot-specs]
  (let [creator (mt/user->id :lucky)
        card    (t2/insert-returning-pk! :model/Card
                                         {:name "m" :type :metric :creator_id creator
                                          :database_id (mt/id) :dataset_query (count-query :venues)
                                          :display "table" :visualization_settings {}})
        expl    (t2/insert-returning-pk! :model/Exploration {:name "derived" :creator_id creator})
        thread  (t2/insert-returning-pk! :model/ExplorationThread {:exploration_id expl :position 0})
        block   (t2/insert-returning-pk! :model/ExplorationBlock {:exploration_thread_id thread})]
    (doseq [[i {:keys [creator-id table token]}] (map-indexed vector snapshot-specs)]
      (let [dq   (count-query table)
            page (t2/insert-returning-pk! :model/ExplorationPage
                                          {:exploration_block_id block :card_id card
                                           :dimension_id "d1" :query_type "default"})
            q    (t2/insert-returning-pk! :model/ExplorationQuery
                                          {:exploration_thread_id thread :card_id card
                                           :database_id (mt/id) :page_id page
                                           :dimension_id "d1" :dataset_query dq
                                           :status "done" :position i})
            sr   (t2/insert-returning-pk! :model/StoredResult
                                          {:result_data       (byte-array [0])
                                           :creator_id        creator-id
                                           :database_id       (mt/id)
                                           :dataset_query     dq
                                           :row_count         1
                                           :data_access_token token})]
        (t2/insert! :model/ExplorationQueryResult
                    {:exploration_query_id q :stored_result_id sr})))
    thread))

(defn- visible? [thread-id user-kw]
  (request/with-current-user (mt/user->id user-kw)
    (contains? (derived-perms/thread-ids-with-visible-derived-data [thread-id]) thread-id)))

(deftest thread-with-no-results-stays-visible-test
  (testing "a thread with nothing materialized has no values computed under anyone's lens"
    (let [thread (thread-with-snapshots! [])]
      (is (true? (visible? thread :rasta))))))

(deftest nil-token-is-fail-closed-including-for-the-creator-test
  (testing "a snapshot with no captured lens can't be compared against, so it is fail-closed for
            everyone but an admin. Being the snapshot's creator is NOT an exemption: the creator's
            permissions may have changed since the snapshot, and with no token we can't tell — so a
            non-admin creator is denied exactly like any other non-admin viewer."
    (let [creator-thread (thread-with-snapshots! [{:creator-id (mt/user->id :rasta) :table :venues :token nil}])]
      (is (false? (visible? creator-thread :rasta))
          "the creator gets no bypass — a nil token is fail-closed for them too")
      (is (true? (visible? creator-thread :crowberto)) "superuser"))
    (let [other-thread (thread-with-snapshots! [{:creator-id (mt/user->id :lucky) :table :venues :token nil}])]
      (is (false? (visible? other-thread :rasta)) "and for a non-creator")
      (is (true? (visible? other-thread :crowberto)) "superuser"))))

(deftest batching-does-not-merge-snapshots-needing-different-perms-test
  (testing "the rollup evaluates one verdict per distinct permission shape rather than per snapshot.
            Two snapshots in a thread that differ ONLY by source table must not share a verdict: if
            the viewer can query one table but not the other, the thread is blocked"
    (mt/with-no-data-perms-for-all-users!
      (let [group (perms-group/all-users)]
        (perms/set-table-permission! group (mt/id :venues) :perms/view-data :unrestricted)
        (perms/set-table-permission! group (mt/id :venues) :perms/create-queries :query-builder)
        (testing "control: a thread backed only by the readable table is visible"
          (let [thread (thread-with-snapshots! [{:creator-id (mt/user->id :lucky) :table :venues :token {}}])]
            (is (true? (visible? thread :rasta)))))
        (testing "a second snapshot over an unreadable table blocks the whole thread"
          (let [thread (thread-with-snapshots! [{:creator-id (mt/user->id :lucky) :table :venues :token {}}
                                                {:creator-id (mt/user->id :lucky) :table :checkins :token {}}])]
            (is (false? (visible? thread :rasta))
                "if the two snapshots were collapsed into one verdict this would wrongly pass")))))))

(deftest verdict-cost-does-not-scale-with-chart-count-test
  (testing "this rollup runs on polled read paths, so its app-DB cost must stay flat as a thread
            grows charts — the underlying permission check is worth ~a dozen queries each time it
            runs, and an exploration's charts all require the same permissions"
    (let [specs   (fn [n] (repeat n {:creator-id (mt/user->id :lucky) :table :venues :token {}}))
          measure (fn [n]
                    (let [thread (thread-with-snapshots! (specs n))]
                      (request/with-current-user (mt/user->id :rasta)
                        (t2/with-call-count [call-count]
                          (derived-perms/thread-ids-with-visible-derived-data [thread])
                          (call-count)))))
          small   (measure 2)
          large   (measure 25)]
      ;; Exact equality is too strict — wider `IN` lists shift the count by a query or so. What
      ;; matters is that the expensive per-snapshot check is not re-run per chart: before this was
      ;; batched, 25 charts cost ~13 queries each (~325 total) against ~26 for 2.
      (is (<= large (+ small 3))
          (format "cost must stay flat as charts grow (2 charts: %d queries, 25 charts: %d)"
                  small large)))))
