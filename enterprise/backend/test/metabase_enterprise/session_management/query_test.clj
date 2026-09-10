(ns metabase-enterprise.session-management.query-test
  "Tests for the shared live-session query fragments. `metabase.server.middleware.session-test` covers the same
  predicates from the authentication side; these cover them from the listing side, so that a change which makes a
  session stop authenticating also makes it stop being listed. They run the fragments through
  `metabase-enterprise.session-management.db`, which is what executes them."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.session-management.db :as sm.db]
   [metabase-enterprise.session-management.query :as sm.query]
   [metabase.app-db.core :as mdb]
   [metabase.session.core :as session]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util.honey-sql-2 :as h2x]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db))

(defn- liveness
  "Liveness params with everything switched off but `max-age-minutes`, so a test only opts into the predicate it is
  about."
  [& {:as overrides}]
  (merge {:db-type                 (mdb/db-type)
          :max-age-minutes         20160
          :enable-tenants?         false
          :session-timeout-seconds nil}
         overrides))

(defn- insert-session!
  "Insert a `core_session` row directly, bypassing the model hooks so `created_at`, `expires_at` and friends can be
  arbitrary (including DB-side) expressions. Returns the session id."
  [user-id & {:as extra-cols}]
  (let [id (session/generate-session-id)]
    (t2/insert! (t2/table-name :model/Session)
                (merge {:id         id
                        :key_hashed (session/hash-session-key (str (random-uuid)))
                        :user_id    user-id
                        :created_at :%now}
                       extra-cols))
    id))

(defn- listed-ids
  "The ids of the live sessions matching `filters`. Every caller passes `:user-id` so a test never sees sessions other
  tests left lying around."
  [liveness-params & {:as filters}]
  (into #{}
        (map :id)
        (sm.db/live-sessions liveness-params filters :created_at :desc nil nil nil)))

(defn- ago [amount unit]
  (h2x/add-interval-honeysql-form (mdb/db-type) (h2x/current-datetime-honeysql-form (mdb/db-type)) (- amount) unit))

(defn- from-now [amount unit]
  (h2x/add-interval-honeysql-form (mdb/db-type) (h2x/current-datetime-honeysql-form (mdb/db-type)) amount unit))

(deftest live-session-conditions-max-age-test
  (testing "a session past `max-session-age` is neither listed nor counted"
    (mt/with-temp [:model/User {user-id :id} {}]
      (let [fresh (insert-session! user-id)
            old   (insert-session! user-id :created_at (ago 61 :second))
            lp    (liveness :max-age-minutes 1)]
        (is (= #{fresh} (listed-ids lp :user-id user-id)))
        (is (= 1 (sm.db/live-session-count lp {:user-id user-id})))
        (testing "and is listed again once the cap is wide enough to cover it"
          (let [lp (liveness :max-age-minutes 20160)]
            (is (= #{fresh old} (listed-ids lp :user-id user-id)))
            (is (= 2 (sm.db/live-session-count lp {:user-id user-id})))))))))

(deftest live-session-conditions-expires-at-test
  (testing "`expires_at` in the past excludes a session even when it is well within `max-session-age`"
    (mt/with-temp [:model/User {user-id :id} {}]
      (let [no-expiry   (insert-session! user-id)
            not-yet     (insert-session! user-id :expires_at (from-now 60 :second))
            expired     (insert-session! user-id :expires_at (ago 1 :second))
            lp          (liveness)]
        (is (= #{no-expiry not-yet} (listed-ids lp :user-id user-id)))
        (is (not (contains? (listed-ids lp :user-id user-id) expired)))
        (is (= 2 (sm.db/live-session-count lp {:user-id user-id})))))))

(deftest live-session-conditions-idle-timeout-test
  (testing "with a session timeout configured, an idle session drops out — and `last_active_at` nil falls back to
           `created_at` rather than counting as idle forever"
    (mt/with-temp [:model/User {user-id :id} {}]
      (let [never-touched   (insert-session! user-id)
            recently-active (insert-session! user-id
                                             :created_at     (ago 10 :minute)
                                             :last_active_at (ago 10 :second))
            idle            (insert-session! user-id
                                             :created_at     (ago 10 :minute)
                                             :last_active_at (ago 10 :minute))
            lp              (liveness :session-timeout-seconds 60)]
        (is (= #{never-touched recently-active} (listed-ids lp :user-id user-id)))
        (is (not (contains? (listed-ids lp :user-id user-id) idle)))
        (is (= 2 (sm.db/live-session-count lp {:user-id user-id})))))))

(deftest live-session-conditions-inactive-user-test
  (testing "a deactivated user's surviving session rows are dead"
    (mt/with-temp [:model/User {user-id :id} {:is_active true}]
      (let [id (insert-session! user-id)
            lp (liveness)]
        (is (= #{id} (listed-ids lp :user-id user-id)))
        ;; the raw table, not `:model/User`: the model's before-update publishes
        ;; `:event/user-credentials-revoked`, whose handler deletes the user's sessions outright (SEC-863). Going
        ;; through the model would leave nothing for `[:= :user.is_active true]` to reject, and this test would pass
        ;; with that predicate deleted.
        (t2/update! (t2/table-name :model/User) user-id {:is_active false})
        (is (t2/exists? (t2/table-name :model/Session) :id id)
            "the session row survives deactivation; it is the predicate that must reject it")
        (is (= #{} (listed-ids lp :user-id user-id)))
        (is (zero? (sm.db/live-session-count lp {:user-id user-id})))))))

(deftest live-session-conditions-mcp-test
  (testing "a session stamped with the `mcp` provider is never live, whatever the filters"
    (mt/with-temp [:model/User         {user-id :id} {}
                   :model/AuthIdentity {mcp-id :id}  {:user_id user-id :provider "mcp"}]
      (let [normal (insert-session! user-id)
            _mcp   (insert-session! user-id :auth_identity_id mcp-id)
            lp     (liveness)]
        (is (= #{normal} (listed-ids lp :user-id user-id)))
        (is (= 1 (sm.db/live-session-count lp {:user-id user-id})))
        (testing "not even when explicitly asking for the `unknown` provider bucket, which is what a null provider is"
          (is (= #{normal} (listed-ids lp :user-id user-id :provider "unknown"))))))))

(deftest filters->where-test
  (testing "an explicitly empty id list matches nothing rather than everything — `IN ()` is not valid SQL"
    (mt/with-temp [:model/User {user-id :id} {}]
      (let [id (insert-session! user-id)
            lp (liveness)]
        (is (= #{id} (listed-ids lp :user-id user-id)))
        (is (= #{id} (listed-ids lp :user-id user-id :ids [id])))
        (is (= #{}   (listed-ids lp :user-id user-id :ids [])))
        (is (= 0     (sm.db/live-session-count lp {:user-id user-id :ids []}))))))
  (testing "`filters->where` is request-independent: the same map produces the same clauses"
    (is (= (sm.query/filters->where {:user-id 1 :tenancy :internal})
           (sm.query/filters->where {:user-id 1 :tenancy :internal})))
    (is (empty? (sm.query/filters->where {})))
    (is (empty? (sm.query/filters->where {:tenancy :all})))))

(deftest filters->where-date-ranges-are-half-open-test
  (testing "`created-after` is inclusive and `created-before` exclusive, so adjacent ranges neither overlap nor gap"
    (mt/with-temp [:model/User {user-id :id} {}]
      (let [t   #t "2024-03-05T12:00:00Z"
            id  (insert-session! user-id :created_at t)
            ;; no max-age cap, or the fixed timestamp above would age out and the range filter would never be reached
            lp  (liveness :max-age-minutes nil)]
        (is (= #{id} (listed-ids lp :user-id user-id :created-after t)))
        (is (= #{}   (listed-ids lp :user-id user-id :created-before t)))
        (is (= #{id} (listed-ids lp :user-id user-id
                                 :created-after  #t "2024-03-05T11:00:00Z"
                                 :created-before #t "2024-03-05T13:00:00Z")))))))
