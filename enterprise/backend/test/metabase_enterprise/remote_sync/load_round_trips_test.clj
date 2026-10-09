(ns metabase-enterprise.remote-sync.load-round-trips-test
  "App-DB round trips per entity while a pull loads content.

  Counts are taken on the thread that runs the import (the imports here run synchronously on the test thread), so
  scheduler and other background activity don't leak in. Per-entity cost is the difference between two sizes of
  the same content, which cancels the fixed per-pull overhead. Not ^:parallel: the JDBC counter is JVM-wide.

  The JDBC counter does not see the `DISCARD ALL` that the pool sends at each Postgres check-in, so the budgets
  bound check-outs as well as statements."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.remote-sync.cost-test-util :as cost]
   [metabase-enterprise.remote-sync.test-helpers :as rs.test]
   [metabase.app-db.core :as mdb]
   [metabase.search.test-util :as search.tu]
   [metabase.test.fixtures :as fixtures]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))
(use-fixtures :each rs.test/clean-remote-sync-state rs.test/commit-with-temp)

(def ^:private cost-keys [:statements :checkouts :savepoints :releases :commits :rollbacks])

(defn- this-thread
  "The counts made on the calling thread, from a `cost/measure!` result."
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
    (cost/do-with-content!
     shape
     (fn [tree]
       (let [src (rs.test/versioned-source :trees {"v0" tree "v1" (rename-dashboards tree)} :current "v0")]
         (is (= :success (:status (rs.test/import-at! src "v0" :force? true))) "baseline load")
         (let [m (cost/measure! #(rs.test/import-at! src "v1"))]
           (is (= :success (get-in m [:result :status])) "incremental pull")
           m))))))

(def ^:private statement-margin
  "Statements per entity that a bound allows over the measured count, so that one or two statements that an unrelated
  change adds per entity do not fail the test."
  2.0)

(def ^:private statements-per-card
  "The measured statement count per card, by app DB type. MySQL and MariaDB (app DB type `:mysql`) send one
  statement more than H2 and Postgres per entity."
  {:h2 15.0 :postgres 15.0 :mysql 16.0})

(deftest forced-reload-round-trips-per-card-test
  (testing "A forced reload of unchanged MBQL cards: per card, no connection check-outs and at most the measured
            count for this app DB plus a margin of 2 statements."
    (let [cost (per-entity (cost/forced-reload-of-unchanged! {:cards 10})
                           (cost/forced-reload-of-unchanged! {:cards 20})
                           10 20)]
      (log/infof "per MBQL card, forced reload of unchanged content (this thread): %s" cost)
      (is (= 0.0 (:checkouts cost)) (pr-str cost))
      (is (<= (:statements cost) (+ (get statements-per-card (mdb/db-type) 16.0) statement-margin))
          (pr-str cost)))))

(def ^:private statements-per-dashboard
  "The measured statement count per changed dashboard, by app DB type."
  {:h2 32.0 :postgres 32.0 :mysql 33.0})

(deftest incremental-pull-round-trips-per-dashboard-test
  (testing "An incremental pull where only dashboards changed. Each dashboard has 4 dashboard cards on the same 4
            cards, which are not in the pulled files, so they are checked locally. Per dashboard: no connection
            check-outs and at most the measured count for this app DB plus a margin of 2 statements."
    (let [cost (per-entity (incremental-pull-of-changed-dashboards! {:cards 4 :dashboards 2 :dashcards 4})
                           (incremental-pull-of-changed-dashboards! {:cards 4 :dashboards 6 :dashcards 4})
                           2 6)]
      (log/infof "per dashboard (4 dashboard cards), incremental pull of changed dashboards (this thread): %s" cost)
      (is (= 0.0 (:checkouts cost)) (pr-str cost))
      (is (<= (:statements cost) (+ (get statements-per-dashboard (mdb/db-type) 33.0) statement-margin))
          (pr-str cost)))))
