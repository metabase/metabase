(ns metabase-enterprise.remote-sync.load-round-trips-test
  "App-DB round trips per entity while a pull loads content (card 4 of the git-sync perf work).

  Counts are taken on the thread that runs the import (the imports here run synchronously on the test thread), so
  scheduler and other background activity don't leak in. Per-entity cost is the difference between two sizes of
  the same content, which cancels the fixed per-pull overhead. Not ^:parallel: the JDBC counter is JVM-wide.

  The test app DB is H2, which never sends `DISCARD ALL`; Postgres sends one on every connection check-in. So the
  budgets below are on connection check-outs as well as statements: a check-out is a pool round trip plus a
  `DISCARD ALL` on Postgres."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.remote-sync.pull-cost-test :as pull-cost]
   [metabase-enterprise.remote-sync.test-helpers :as rs.test]
   [metabase.search.test-util :as search.tu]
   [metabase.test.fixtures :as fixtures]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))
(use-fixtures :each rs.test/clean-remote-sync-state rs.test/commit-with-temp)

(def ^:private cost-keys [:statements :checkouts :savepoints :releases :commits :rollbacks])

(defn- this-thread
  "The counts made on the calling thread, from a `pull-cost/measure` result."
  [m]
  (merge (zipmap cost-keys (repeat 0))
         (get-in m [:by-thread (.threadId (Thread/currentThread))])))

(defn- per-entity
  "Per-entity cost on this thread between measurements `small` and `large` of `n-small` and `n-large` entities.
  `:pg-round-trips` estimates the Postgres round trips: statements, savepoint/commit/rollback calls, and one
  `DISCARD ALL` per connection check-in (a check-in follows every check-out)."
  [small large n-small n-large]
  (let [s (this-thread small)
        l (this-thread large)
        d (into {} (for [k cost-keys] [k (double (/ (- (k l) (k s)) (- n-large n-small)))]))]
    (assoc d :pg-round-trips (reduce + (map d [:statements :checkouts :savepoints :releases :commits :rollbacks])))))

(defn- forced-reload-of-unchanged! [shape]
  (#'pull-cost/forced-reload-of-unchanged! shape))

(defn- rename-dashboards
  "`tree` with every dashboard renamed, so only the dashboard files change."
  [tree]
  (into {} (for [[path content] tree]
             [path (cond-> content
                     (str/includes? content "Cost dash") (str/replace "Cost dash" "Renamed dash"))])))

(defn- incremental-pull-of-changed-dashboards!
  "Load `shape` once, then measure a normal (not forced) pull in which only the dashboard files changed."
  [shape]
  (search.tu/with-index-disabled
    (#'pull-cost/do-with-content!
     shape
     (fn [tree]
       (let [src (rs.test/versioned-source :trees {"v0" tree "v1" (rename-dashboards tree)} :current "v0")]
         (is (= :success (:status (#'pull-cost/import-at! src "v0" :force? true))) "baseline load")
         (let [m (pull-cost/measure #(#'pull-cost/import-at! src "v1"))]
           (is (= :success (get-in m [:result :status])) "incremental pull")
           m))))))

(deftest forced-reload-round-trips-per-card-test
  (testing "A forced reload of unchanged MBQL cards: per card, no connection check-outs and at most 15 statements
            (H2). Before this change: 3 check-outs (3 `DISCARD ALL` on Postgres) and 16 statements, one of which
            re-looked-up the card's Database by name."
    (let [cost (per-entity (forced-reload-of-unchanged! {:cards 10})
                           (forced-reload-of-unchanged! {:cards 20})
                           10 20)]
      (log/infof "per MBQL card, forced reload of unchanged content (this thread): %s" cost)
      (is (= 0.0 (:checkouts cost)))
      (is (<= (:statements cost) 15.0)))))

(deftest incremental-pull-round-trips-per-dashboard-test
  (testing "An incremental pull where only dashboards changed. Each dashboard has 4 dashboard cards on the same 4
            cards, which are not in the pulled files, so they are checked locally. Per dashboard: no connection
            check-outs, and at most 33 statements (H2). Before this change: 7 check-outs and 37 statements, because
            each card was looked up again by every dashboard that uses it."
    (let [cost (per-entity (incremental-pull-of-changed-dashboards! {:cards 4 :dashboards 2 :dashcards 4})
                           (incremental-pull-of-changed-dashboards! {:cards 4 :dashboards 6 :dashcards 4})
                           2 6)]
      (log/infof "per dashboard (4 dashboard cards), incremental pull of changed dashboards (this thread): %s" cost)
      (is (= 0.0 (:checkouts cost)))
      (is (<= (:statements cost) 33.0)))))
