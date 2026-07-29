(ns metabase-enterprise.semantic-search.db.store-health-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer [deftest is testing]]
   [iapetos.export :as export]
   [java-time.api :as t]
   [metabase-enterprise.semantic-search.db.datasource :as semantic.db.datasource]
   [metabase-enterprise.semantic-search.db.store-health :as semantic.store-health]
   [metabase-enterprise.semantic-search.util :as semantic.u]
   [metabase.analytics-interface.core :as analytics]
   [metabase.analytics.core :as analytics.core]
   [metabase.app-db.core :as mdb]
   [metabase.test :as mt]))

(defn- readiness-gauges
  "Every readiness gauge for both storage labels, as `{storage {:available _ :connected _ :last-success _}}`."
  [system]
  (into {}
        (for [storage ["dedicated" "appdb"]]
          [storage {:available    (mt/metric-value system :metabase-pgvector/store-available
                                                   {:storage storage})
                    :connected    (mt/metric-value system :metabase-pgvector/store-connected
                                                   {:storage storage})
                    :last-success (mt/metric-value
                                   system :metabase-pgvector/store-last-success-timestamp-seconds
                                   {:storage storage})}])))

(deftest pgvector-readiness-metrics-test
  (mt/with-prometheus-system! [_ system]
    (testing "an instance without any pgvector backend is explicitly not ready"
      (mt/with-dynamic-fn-redefs
        [semantic.db.datasource/dedicated-url-configured?   (constantly false)
         semantic.db.datasource/pgvector-mode               (constantly :unavailable)
         semantic.db.datasource/probe-dedicated-connection! #(throw (ex-info "should not connect" {}))]
        (@#'semantic.store-health/collect-pgvector-readiness-metrics!)
        (is (=? {"dedicated" {:available zero?, :connected zero?}
                 "appdb"     {:available zero?, :connected zero?}}
                (readiness-gauges system)))))
    (testing "a connected dedicated store is available and healthy"
      (mt/with-dynamic-fn-redefs
        [semantic.db.datasource/dedicated-url-configured?   (constantly true)
         semantic.db.datasource/probe-dedicated-connection! (constantly {:one 1})]
        (@#'semantic.store-health/collect-pgvector-readiness-metrics!))
      (is (=? {"dedicated" {:available #(== 1 %), :connected #(== 1 %), :last-success pos?}
               "appdb"     {:available zero?, :connected zero?}}
              (readiness-gauges system)))
      (let [last-success (get-in (readiness-gauges system) ["dedicated" :last-success])]
        (testing "a later failure clears connected but preserves the last-success timestamp"
          (mt/with-dynamic-fn-redefs
            [semantic.db.datasource/dedicated-url-configured?   (constantly true)
             semantic.db.datasource/probe-dedicated-connection! #(throw (ex-info "probe failed" {}))]
            (@#'semantic.store-health/collect-pgvector-readiness-metrics!))
          (is (=? {"dedicated" {:available #(== 1 %), :connected zero?, :last-success #(== last-success %)}}
                  (readiness-gauges system))))))
    (testing "a connected app-db pgvector store is available and healthy"
      (mt/with-dynamic-fn-redefs
        [mdb/db-is-set-up?                                (constantly true)
         semantic.db.datasource/dedicated-url-configured? (constantly false)
         semantic.u/semantic-search-configured?           (constantly true)
         semantic.db.datasource/pgvector-mode             (constantly :app-db)
         semantic.db.datasource/probe-app-db-store!       (constantly true)]
        (@#'semantic.store-health/collect-pgvector-readiness-metrics!))
      (is (=? {"dedicated" {:available zero?, :connected zero?}
               "appdb"     {:available #(== 1 %), :connected #(== 1 %), :last-success pos?}}
              (readiness-gauges system))))
    (testing "an app-db store whose vector extension went away reads available but disconnected"
      (mt/with-dynamic-fn-redefs
        [mdb/db-is-set-up?                                (constantly true)
         semantic.db.datasource/dedicated-url-configured? (constantly false)
         semantic.u/semantic-search-configured?           (constantly true)
         semantic.db.datasource/pgvector-mode             (constantly :app-db)
         semantic.db.datasource/probe-app-db-store!       (constantly false)]
        (@#'semantic.store-health/collect-pgvector-readiness-metrics!))
      (is (=? {"appdb" {:available #(== 1 %), :connected zero?}}
              (readiness-gauges system))))))

(def ^:private last-success-sample-re
  #"^metabase_pgvector_store_last_success_timestamp_seconds\{storage=\"([^\"]+)\",?\} (\S+)")

(defn- exposed-last-success
  "The last-success samples a scrape would actually see, as `{storage value}`.
  Read from the exposition rather than [[mt/metric-value]], which creates the child it looks up and so
  reports an absent series as a present zero."
  [system]
  (into {}
        (keep (fn [line]
                (when-let [[_ storage value] (re-find last-success-sample-re line)]
                  [storage (parse-double value)])))
        (str/split-lines (export/text-format (:registry system)))))

(deftest last-success-does-not-outlive-its-storage-test
  (mt/with-prometheus-system! [_ system]
    ;; Scraping runs the pull collectors, this namespace's included. Stub the submit for the whole test so a
    ;; read of the exposition can't spawn a real probe that races it by writing the series being read.
    (mt/with-dynamic-fn-redefs
      [semantic.store-health/submit-pgvector-readiness-refresh! (constantly nil)]
      (mt/with-dynamic-fn-redefs
        [semantic.db.datasource/dedicated-url-configured?   (constantly true)
         semantic.db.datasource/probe-dedicated-connection! (constantly {:one 1})]
        (@#'semantic.store-health/collect-pgvector-readiness-metrics!))
      (is (=? {"dedicated" pos?} (exposed-last-success system)))
      (testing "switching storage drops the old timestamp, which would otherwise never advance again"
        (mt/with-dynamic-fn-redefs
          [mdb/db-is-set-up?                                (constantly true)
           semantic.db.datasource/dedicated-url-configured? (constantly false)
           semantic.u/semantic-search-configured?           (constantly true)
           semantic.db.datasource/pgvector-mode             (constantly :app-db)
           semantic.db.datasource/probe-app-db-store!       (constantly true)]
          (@#'semantic.store-health/collect-pgvector-readiness-metrics!))
        (is (=? {"appdb" pos?} (exposed-last-success system)))
        (is (= #{"appdb"} (set (keys (exposed-last-success system))))
            "the abandoned label is gone rather than zeroed -- a 0 would read as 1970"))
      (testing "losing the store keeps the timestamp: that is when it is worth knowing"
        (mt/with-dynamic-fn-redefs
          [mdb/db-is-set-up?                                (constantly true)
           semantic.db.datasource/dedicated-url-configured? (constantly false)
           semantic.u/semantic-search-configured?           (constantly false)]
          (@#'semantic.store-health/collect-pgvector-readiness-metrics!))
        (is (=? {"appdb" pos?} (exposed-last-success system)))))))

(deftest probe-store-test
  (let [probe @#'semantic.store-health/probe-store]
    (mt/with-dynamic-fn-redefs [semantic.db.datasource/dedicated-url-configured? (constantly true)]
      (testing "an ordinary failure reads as disconnected, but the store is still known"
        (mt/with-dynamic-fn-redefs
          [semantic.db.datasource/probe-dedicated-connection! #(throw (ex-info "nope" {}))]
          (is (=? {:mode :dedicated, :connected? false, :resolved? true} (probe)))))
      (testing "an Error does not escape and abandon the gauge writes"
        (mt/with-dynamic-fn-redefs
          [semantic.db.datasource/probe-dedicated-connection! #(throw (AssertionError. "boom"))]
          (is (=? {:mode :unavailable, :connected? false, :resolved? false} (probe)))))
      (testing "a store that answers reads as connected"
        (mt/with-dynamic-fn-redefs
          [semantic.db.datasource/probe-dedicated-connection! (constantly {:one 1})]
          (is (=? {:mode :dedicated, :connected? true, :resolved? true} (probe))))))
    (testing "a support check that errored is unresolved: unsupported and unknown both read as :unavailable"
      (reset! semantic.db.datasource/app-db-support-check-errored? true)
      (try
        (mt/with-dynamic-fn-redefs
          [mdb/db-is-set-up?                                (constantly true)
           semantic.db.datasource/dedicated-url-configured? (constantly false)
           semantic.u/semantic-search-configured?           (constantly true)
           semantic.db.datasource/pgvector-mode             (constantly :unavailable)]
          (is (=? {:mode :unavailable, :connected? false, :resolved? false} (probe)))
          (testing "one that answered no is an answer, and holds for the interval"
            (reset! semantic.db.datasource/app-db-support-check-errored? false)
            (is (=? {:mode :unavailable, :connected? false, :resolved? true} (probe)))))
        (finally
          (reset! semantic.db.datasource/app-db-support-check-errored? false))))
    (testing "an app db that is not migrated yet is unresolved, not an answer to cache for an hour"
      (mt/with-dynamic-fn-redefs
        [mdb/db-is-set-up?                                (constantly false)
         semantic.db.datasource/dedicated-url-configured? (constantly false)
         semantic.db.datasource/pgvector-mode             #(throw (ex-info "must not probe" {}))]
        (is (=? {:mode :unavailable, :connected? false, :resolved? false} (probe)))))))

(deftest ^:sequential live-probe-is-never-replaced-test
  (testing "a probe stuck on an unresponsive database cannot be cancelled, so no replacement is admitted"
    (let [probe-future @#'semantic.store-health/readiness-probe-future
          request      @#'semantic.store-health/request-pgvector-readiness-refresh!
          started      (promise)
          release      (promise)
          starts       (atom 0)]
      (try
        (reset! probe-future nil)
        (mt/with-dynamic-fn-redefs
          [semantic.store-health/refresh-pgvector-readiness-metrics!
           ;; Counted before it is announced, so awaiting `started` proves the count is in.
           (fn [] (swap! starts inc) (deliver started true) (deref release 10000 ::hung))]
          (let [first-probe (request)]
            (is (identical? first-probe (request)) "the running probe is returned rather than replaced")
            ;; The request only submits, so wait for the body rather than racing the scheduler.
            (is (true? (deref started 10000 ::never-ran)))
            (is (= 1 @starts) "and no second one is started")
            (deliver release true)
            (is (true? (deref first-probe 10000 ::hung)))
            (testing "once it ends, the next request starts a fresh one"
              (let [next-probe (request)]
                (is (not (identical? first-probe next-probe)))
                (is (true? (deref next-probe 10000 ::hung)))
                (is (= 2 @starts))))))
        (finally
          (deliver release true)
          (reset! probe-future nil))))))

(deftest readiness-refresh-due-test
  (let [due? @#'semantic.store-health/readiness-refresh-due?
        now  (quot (t/to-millis-from-epoch (t/instant)) 1000)]
    (is (true? (due? nil)) "nothing probed yet")
    (is (false? (due? {:at now, :resolved? true})) "a fresh answer holds the interval")
    (is (true? (due? {:at now, :resolved? false}))
        "a probe that could not answer is retried rather than holding the hourly slot")
    (is (true? (due? {:at (- now 3601), :resolved? true})) "the interval has passed")))

(deftest pgvector-readiness-skips-unlicensed-app-db-probe-test
  (testing "an unlicensed instance never resolves pgvector-mode, whose app-db arm probes the app db"
    (mt/with-premium-features #{}
      (mt/with-prometheus-system! [_ system]
        (mt/with-dynamic-fn-redefs
          [mdb/db-is-set-up?                                (constantly true)
           semantic.db.datasource/dedicated-url-configured? (constantly false)
           semantic.db.datasource/pgvector-mode             #(throw (ex-info "must not probe" {}))]
          (@#'semantic.store-health/collect-pgvector-readiness-metrics!)
          (is (=? {"dedicated" {:available zero?, :connected zero?}
                   "appdb"     {:available zero?, :connected zero?}}
                  (readiness-gauges system))))))))

(deftest initial-values-test
  (testing "both storage series are seeded at startup, and the timestamp deliberately is not"
    (is (= [{:storage "dedicated"} {:storage "appdb"}]
           (analytics.core/known-labels :metabase-pgvector/store-available)
           (analytics.core/known-labels :metabase-pgvector/store-connected)))
    (is (not (contains? (methods analytics.core/known-labels)
                        :metabase-pgvector/store-last-success-timestamp-seconds))
        "a seeded 0 would read as 1970 and fire any staleness alert forever"))
  (testing "every series is seeded at 0, even one a configured dedicated URL already makes available"
    (mt/with-dynamic-fn-redefs [semantic.db.datasource/dedicated-url-configured? (constantly true)]
      (doseq [storage ["dedicated" "appdb"]]
        (is (zero? (analytics.core/initial-value :metabase-pgvector/store-available {:storage storage}))
            "observe-initial-values increments, so a non-zero seed doubles a gauge a scrape already set")))))

(defn- fresh-probe
  [m]
  (assoc m :at (quot (t/to-millis-from-epoch (t/instant)) 1000)))

(deftest pgvector-store-health-check-test
  (let [check    @#'semantic.store-health/pgvector-store-health-check
        probe    @#'semantic.store-health/last-readiness-probe
        collects (atom 0)]
    (mt/with-dynamic-fn-redefs
      [semantic.store-health/collect-pgvector-readiness-metrics! #(swap! collects inc)]
      (testing "a fresh probe is reported as-is, without running another"
        (reset! probe (fresh-probe {:storage nil, :connected? false, :resolved? true}))
        (is (nil? (check)) "omitted when there is no store to reach")
        (reset! probe (fresh-probe {:storage "dedicated", :connected? true, :resolved? true}))
        (is (=? {:health 100, :message #"pgvector store \(dedicated\) reachable\."} (check)))
        (reset! probe (fresh-probe {:storage "appdb", :connected? false, :resolved? true}))
        (is (=? {:health 0, :message #"pgvector store \(appdb\) unreachable\."} (check)))
        (is (zero? @collects)))
      (testing "a probe that could not answer is degraded, not omitted as inapplicable"
        (reset! probe (fresh-probe {:storage nil, :connected? false, :resolved? false}))
        (is (=? {:health 0, :message #"Could not determine whether a pgvector store is reachable\."} (check))))
      (testing "a missing or stale probe is refreshed, so an unscraped instance still reports"
        (reset! probe nil)
        ;; The refresh is stubbed, so the atom is still empty when the wait ends -- the case where a probe
        ;; is still out there, which must not read as an absent store.
        (is (=? {:health 0, :message #"Could not determine whether a pgvector store is reachable\."} (check)))
        (reset! probe {:storage "dedicated", :connected? true, :resolved? true, :at 0})
        (check)
        (is (= 2 @collects))))))

(deftest ^:sequential pull-collector-refreshes-pgvector-metrics-on-each-instance-test
  (let [probe-future @#'semantic.store-health/readiness-probe-future
        probe        @#'semantic.store-health/last-readiness-probe
        prior-probe  @probe
        collector    (analytics.core/pull-collector ::semantic.store-health/pgvector-readiness-gauges)
        gauge-calls  (atom [])
        refreshes    (atom 0)
        submitted    (atom [])
        ;; The submitted probe has to stay unrealized, or the second scrape sees a finished one and starts
        ;; its own -- which is the single-flight behaviour under test.
        hold         (promise)]
    (try
      (reset! probe-future nil)
      ;; Nothing probed yet, so the refresh is due.
      (reset! probe nil)
      (mt/with-dynamic-fn-redefs
        [analytics/set-gauge!                                      #(swap! gauge-calls conj (vec %&))
         semantic.store-health/collect-pgvector-readiness-metrics! #(swap! refreshes inc)
         semantic.store-health/submit-pgvector-readiness-refresh!  #(do (swap! submitted conj %)
                                                                        (future (deref hold 10000 ::hung)))]
        ((:f collector))
        ((:f collector))
        (is (= 1 (count @submitted)) "overlapping scrapes share one local refresh")
        (is (empty? @gauge-calls) "the scrape path writes no gauges of its own")
        (is (zero? @refreshes) "the database probe does not run on the synchronous scrape path")
        ((first @submitted)))
      (is (= 60 (:min-interval-s collector))
          "the scrape reconsiders often; the hourly cadence is readiness-refresh-due?'s job")
      (is (= 1 @refreshes))
      (finally
        (deliver hold true)
        (reset! probe-future nil)
        (reset! probe prior-probe)))))
