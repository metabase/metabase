(ns metabase-enterprise.similarity.views.co-execution-test
  "Tests for the `:co-execution` behavioral similarity view.

   The view's CTE chain (parameterized WHERE → LAG window → SUM(CASE) window
   → joins) hits an H2 prepared-statement / window-function planner quirk on
   the default test appdb. Postgres is the target appdb engine for this PoC,
   so each test is gated on `(= :postgres (mdb/db-type))` and is a no-op on
   other engines. CI runs both lanes; the postgres lane exercises this view."
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase-enterprise.similarity.runner :as runner]
   [metabase-enterprise.similarity.views.co-execution :as co-execution]
   [metabase.app-db.core :as mdb]
   [metabase.query-processor.util :as qp.util]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db))

(set! *warn-on-reflection* true)

(def ^:private base-time
  "Pin a base time so all relative offsets in a test live in a stable window."
  (t/offset-date-time 2024 1 15 12 0 0 0 (t/zone-offset 0)))

(defn- minutes-from-base [n]
  (t/plus base-time (t/minutes n)))

(defn- qe-row
  "Default-filled `:model/QueryExecution` map for `mt/with-temp`."
  [{:keys [card-id user-id ts context error]
    :or   {context :question}}]
  {:hash         (qp.util/query-hash {})
   :running_time 1
   :result_rows  1
   :native       false
   :executor_id  user-id
   :card_id      card-id
   :context      context
   :error        error
   :started_at   ts})

(defn- edge-between [card-x card-y]
  (t2/select-one :model/SimilarEdge
                 :view :co-execution
                 :from_entity_type :card :from_entity_id card-x
                 :to_entity_type   :card :to_entity_id   card-y))

(def ^:private permissive-density
  "Thresholds set low so the gate passes on tiny test fixtures."
  {:min-rows 0 :min-distinct-sessions 0 :min-distinct-cards 0})

(defn- run-with-permissive-density! []
  (with-redefs [co-execution/density-thresholds permissive-density]
    (runner/run-view! :co-execution)))

(deftest ^:sequential same-session-co-execution-emits-symmetric-edges-test
  (when (= :postgres (mdb/db-type))
    (testing "two cards run within 30 min of each other emit a symmetric edge pair"
      (mt/with-model-cleanup [:model/Card :model/QueryExecution
                              :model/SimilarEdge :model/SimilarEdgeStatus]
        (mt/with-temp [:model/User {u :id} {}
                       :model/Card {ca :id} {}
                       :model/Card {cb :id} {}
                       ;; session 1
                       :model/QueryExecution _ (qe-row {:card-id ca :user-id u :ts (minutes-from-base 0)})
                       :model/QueryExecution _ (qe-row {:card-id cb :user-id u :ts (minutes-from-base 5)})
                       ;; session 2 (gap > 30 min from session 1)
                       :model/QueryExecution _ (qe-row {:card-id ca :user-id u :ts (minutes-from-base 90)})
                       :model/QueryExecution _ (qe-row {:card-id cb :user-id u :ts (minutes-from-base 95)})]
          (let [result (run-with-permissive-density!)]
            (is (= :ok (:status result)))
            (is (not (:skipped? result))))
          (let [a->b (edge-between ca cb)
                b->a (edge-between cb ca)]
            (is (some? a->b))
            (is (some? b->a))
            (is (= (:score a->b) (:score b->a))
                "symmetric edge pair carries the same score")
            (is (= 2 (-> a->b :contributing_data :metric :co-session-count)))))))))

(deftest ^:sequential gap-splits-sessions-test
  (when (= :postgres (mdb/db-type))
    (testing "executions separated by > 30 min belong to different sessions"
      (mt/with-model-cleanup [:model/Card :model/QueryExecution
                              :model/SimilarEdge :model/SimilarEdgeStatus]
        (mt/with-temp [:model/User {u :id} {}
                       :model/Card {ca :id} {}
                       :model/Card {cb :id} {}
                       ;; A in session 1, B in session 2 — never co-occur
                       :model/QueryExecution _ (qe-row {:card-id ca :user-id u :ts (minutes-from-base 0)})
                       :model/QueryExecution _ (qe-row {:card-id cb :user-id u :ts (minutes-from-base 35)})]
          (run-with-permissive-density!)
          (is (nil? (edge-between ca cb)))
          (is (nil? (edge-between cb ca))))))))

(deftest ^:sequential min-co-sessions-filter-test
  (when (= :postgres (mdb/db-type))
    (testing "a pair appearing in only one session is filtered out by min-co-sessions"
      (mt/with-model-cleanup [:model/Card :model/QueryExecution
                              :model/SimilarEdge :model/SimilarEdgeStatus]
        (mt/with-temp [:model/User {u :id} {}
                       :model/Card {ca :id} {}
                       :model/Card {cb :id} {}
                       :model/QueryExecution _ (qe-row {:card-id ca :user-id u :ts (minutes-from-base 0)})
                       :model/QueryExecution _ (qe-row {:card-id cb :user-id u :ts (minutes-from-base 5)})]
          (run-with-permissive-density!)
          (is (nil? (edge-between ca cb))
              "co=1 < min-co-sessions=2 → filtered"))))))

(deftest ^:sequential cross-user-pooling-test
  (when (= :postgres (mdb/db-type))
    (testing "co-occurrence across users contributes to the same pair count"
      (mt/with-model-cleanup [:model/Card :model/QueryExecution
                              :model/SimilarEdge :model/SimilarEdgeStatus]
        (mt/with-temp [:model/User {u1 :id} {}
                       :model/User {u2 :id} {}
                       :model/Card {ca :id} {}
                       :model/Card {cb :id} {}
                       ;; user 1 session
                       :model/QueryExecution _ (qe-row {:card-id ca :user-id u1 :ts (minutes-from-base 0)})
                       :model/QueryExecution _ (qe-row {:card-id cb :user-id u1 :ts (minutes-from-base 5)})
                       ;; user 2 session (different user → different partition, own session)
                       :model/QueryExecution _ (qe-row {:card-id ca :user-id u2 :ts (minutes-from-base 200)})
                       :model/QueryExecution _ (qe-row {:card-id cb :user-id u2 :ts (minutes-from-base 205)})]
          (run-with-permissive-density!)
          (let [edge (edge-between ca cb)]
            (is (some? edge))
            (is (= 2 (-> edge :contributing_data :metric :co-session-count)))))))))

(deftest ^:sequential errored-executions-excluded-test
  (when (= :postgres (mdb/db-type))
    (testing "rows with non-NULL error do not contribute to sessions"
      (mt/with-model-cleanup [:model/Card :model/QueryExecution
                              :model/SimilarEdge :model/SimilarEdgeStatus]
        (mt/with-temp [:model/User {u :id} {}
                       :model/Card {ca :id} {}
                       :model/Card {cb :id} {}
                       :model/QueryExecution _ (qe-row {:card-id ca :user-id u :ts (minutes-from-base 0)
                                                        :error "boom"})
                       :model/QueryExecution _ (qe-row {:card-id cb :user-id u :ts (minutes-from-base 5)
                                                        :error "boom"})
                       :model/QueryExecution _ (qe-row {:card-id ca :user-id u :ts (minutes-from-base 90)
                                                        :error "boom"})
                       :model/QueryExecution _ (qe-row {:card-id cb :user-id u :ts (minutes-from-base 95)
                                                        :error "boom"})]
          (run-with-permissive-density!)
          (is (nil? (edge-between ca cb))))))))

(deftest ^:sequential dashboard-context-excluded-test
  (when (= :postgres (mdb/db-type))
    (testing "executions in :dashboard context are not counted as user-driven"
      (mt/with-model-cleanup [:model/Card :model/QueryExecution
                              :model/SimilarEdge :model/SimilarEdgeStatus]
        (mt/with-temp [:model/User {u :id} {}
                       :model/Card {ca :id} {}
                       :model/Card {cb :id} {}
                       :model/QueryExecution _ (qe-row {:card-id ca :user-id u :ts (minutes-from-base 0)
                                                        :context :dashboard})
                       :model/QueryExecution _ (qe-row {:card-id cb :user-id u :ts (minutes-from-base 5)
                                                        :context :dashboard})
                       :model/QueryExecution _ (qe-row {:card-id ca :user-id u :ts (minutes-from-base 90)
                                                        :context :dashboard})
                       :model/QueryExecution _ (qe-row {:card-id cb :user-id u :ts (minutes-from-base 95)
                                                        :context :dashboard})]
          (run-with-permissive-density!)
          (is (nil? (edge-between ca cb))))))))

(deftest ^:sequential anonymous-executions-excluded-test
  (when (= :postgres (mdb/db-type))
    (testing "rows with NULL executor_id do not contribute"
      (mt/with-model-cleanup [:model/Card :model/QueryExecution
                              :model/SimilarEdge :model/SimilarEdgeStatus]
        (mt/with-temp [:model/Card {ca :id} {}
                       :model/Card {cb :id} {}
                       :model/QueryExecution _ (qe-row {:card-id ca :user-id nil :ts (minutes-from-base 0)})
                       :model/QueryExecution _ (qe-row {:card-id cb :user-id nil :ts (minutes-from-base 5)})
                       :model/QueryExecution _ (qe-row {:card-id ca :user-id nil :ts (minutes-from-base 90)})
                       :model/QueryExecution _ (qe-row {:card-id cb :user-id nil :ts (minutes-from-base 95)})]
          (run-with-permissive-density!)
          (is (nil? (edge-between ca cb))))))))

(deftest ^:sequential repeated-within-session-counts-once-test
  (when (= :postgres (mdb/db-type))
    (testing "re-running a card within a session does not inflate co-session count"
      (mt/with-model-cleanup [:model/Card :model/QueryExecution
                              :model/SimilarEdge :model/SimilarEdgeStatus]
        (mt/with-temp [:model/User {u :id} {}
                       :model/Card {ca :id} {}
                       :model/Card {cb :id} {}
                       ;; session 1: A run 3 times, B run 2 times
                       :model/QueryExecution _ (qe-row {:card-id ca :user-id u :ts (minutes-from-base 0)})
                       :model/QueryExecution _ (qe-row {:card-id ca :user-id u :ts (minutes-from-base 1)})
                       :model/QueryExecution _ (qe-row {:card-id ca :user-id u :ts (minutes-from-base 2)})
                       :model/QueryExecution _ (qe-row {:card-id cb :user-id u :ts (minutes-from-base 3)})
                       :model/QueryExecution _ (qe-row {:card-id cb :user-id u :ts (minutes-from-base 4)})
                       ;; session 2: A and B once each
                       :model/QueryExecution _ (qe-row {:card-id ca :user-id u :ts (minutes-from-base 90)})
                       :model/QueryExecution _ (qe-row {:card-id cb :user-id u :ts (minutes-from-base 91)})]
          (run-with-permissive-density!)
          (let [edge (edge-between ca cb)]
            (is (some? edge))
            (is (= 2 (-> edge :contributing_data :metric :co-session-count))
                "two distinct sessions, not five (= 3 A * 2 B + ...)")))))))

(deftest ^:sequential popularity-normalization-test
  (when (= :postgres (mdb/db-type))
    (testing "score is reduced when a card is broadly popular"
      (mt/with-model-cleanup [:model/Card :model/QueryExecution
                              :model/SimilarEdge :model/SimilarEdgeStatus]
        ;; B + D each appear in two sessions, both shared.
        ;; B + C each appear in two sessions, both shared, AND C appears solo in
        ;; an extra session — making n_sessions(C) > n_sessions(D).
        (mt/with-temp [:model/User {ub :id} {}
                       :model/User {uc :id} {}
                       :model/User {ud :id} {}
                       :model/Card {b :id} {}
                       :model/Card {c :id} {}
                       :model/Card {d :id} {}
                       ;; user-b runs B + C, then B + D — two sessions.
                       :model/QueryExecution _ (qe-row {:card-id b :user-id ub :ts (minutes-from-base 0)})
                       :model/QueryExecution _ (qe-row {:card-id c :user-id ub :ts (minutes-from-base 5)})
                       :model/QueryExecution _ (qe-row {:card-id b :user-id ub :ts (minutes-from-base 90)})
                       :model/QueryExecution _ (qe-row {:card-id d :user-id ub :ts (minutes-from-base 95)})
                       ;; user-c gives B+C a 2nd co-session, B+D a 2nd co-session
                       :model/QueryExecution _ (qe-row {:card-id b :user-id uc :ts (minutes-from-base 200)})
                       :model/QueryExecution _ (qe-row {:card-id c :user-id uc :ts (minutes-from-base 205)})
                       :model/QueryExecution _ (qe-row {:card-id b :user-id uc :ts (minutes-from-base 290)})
                       :model/QueryExecution _ (qe-row {:card-id d :user-id uc :ts (minutes-from-base 295)})
                       ;; user-d runs C alone in an extra session (no edge contribution,
                       ;; just bumps n_sessions(C))
                       :model/QueryExecution _ (qe-row {:card-id c :user-id ud :ts (minutes-from-base 400)})]
          (run-with-permissive-density!)
          (let [bc (edge-between b c)
                bd (edge-between b d)]
            (is (some? bc))
            (is (some? bd))
            (is (< (:score bc) (:score bd))
                "C is more popular than D ⇒ score(B,C) < score(B,D) at equal co-count")))))))

(deftest ^:sequential density-gate-skip-on-empty-test
  (when (= :postgres (mdb/db-type))
    (testing "no user-driven query_execution rows ⇒ runner skips with status :ok :skipped? true"
      (mt/with-model-cleanup [:model/QueryExecution :model/SimilarEdge :model/SimilarEdgeStatus]
        (let [result (runner/run-view! :co-execution)]
          (is (= :ok (:status result)))
          (is (true? (:skipped? result)))
          (is (= :skipped (:status (t2/select-one :model/SimilarEdgeStatus :view :co-execution)))))))))

(deftest ^:sequential density-gate-skip-on-sparse-test
  (when (= :postgres (mdb/db-type))
    (testing "with a high `:min-rows` threshold the gate skips even with some data"
      (mt/with-model-cleanup [:model/Card :model/QueryExecution
                              :model/SimilarEdge :model/SimilarEdgeStatus]
        (mt/with-temp [:model/User {u :id} {}
                       :model/Card {ca :id} {}
                       :model/QueryExecution _ (qe-row {:card-id ca :user-id u :ts (minutes-from-base 0)})]
          (with-redefs [co-execution/density-thresholds {:min-rows              1000000
                                                         :min-distinct-sessions 1
                                                         :min-distinct-cards    1}]
            (let [result (runner/run-view! :co-execution)]
              (is (true? (:skipped? result)))
              (is (pos? (-> result :metrics :rows))
                  "metrics carry the actual probe row count, not 0"))
            (is (= :skipped (:status (t2/select-one :model/SimilarEdgeStatus
                                                    :view :co-execution))))))))))

(deftest ^:sequential density-gate-pass-records-source-in-contributing-data-test
  (when (= :postgres (mdb/db-type))
    (testing "edges produced by co-execution carry :source :query-execution"
      (mt/with-model-cleanup [:model/Card :model/QueryExecution
                              :model/SimilarEdge :model/SimilarEdgeStatus]
        (mt/with-temp [:model/User {u :id} {}
                       :model/Card {ca :id} {}
                       :model/Card {cb :id} {}
                       :model/QueryExecution _ (qe-row {:card-id ca :user-id u :ts (minutes-from-base 0)})
                       :model/QueryExecution _ (qe-row {:card-id cb :user-id u :ts (minutes-from-base 5)})
                       :model/QueryExecution _ (qe-row {:card-id ca :user-id u :ts (minutes-from-base 90)})
                       :model/QueryExecution _ (qe-row {:card-id cb :user-id u :ts (minutes-from-base 95)})]
          (run-with-permissive-density!)
          (let [edge (edge-between ca cb)]
            (is (some? edge))
            (is (= "query-execution"
                   (-> edge :contributing_data :source name)))))))))
