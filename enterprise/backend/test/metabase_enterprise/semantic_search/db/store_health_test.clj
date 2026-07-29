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
        [semantic.db.datasource/dedicated-url-configured? (constantly false)
         semantic.u/semantic-search-configured?           (constantly true)
         semantic.db.datasource/pgvector-mode             (constantly :app-db)
         semantic.db.datasource/probe-app-db-store!       (constantly true)]
        (@#'semantic.store-health/collect-pgvector-readiness-metrics!))
      (is (=? {"dedicated" {:available zero?, :connected zero?}
               "appdb"     {:available #(== 1 %), :connected #(== 1 %), :last-success pos?}}
              (readiness-gauges system))))
    (testing "an app-db store whose vector extension went away reads available but disconnected"
      (mt/with-dynamic-fn-redefs
        [semantic.db.datasource/dedicated-url-configured? (constantly false)
         semantic.u/semantic-search-configured?           (constantly true)
         semantic.db.datasource/pgvector-mode             (constantly :app-db)
         semantic.db.datasource/probe-app-db-store!       (constantly false)]
        (@#'semantic.store-health/collect-pgvector-readiness-metrics!))
      (is (=? {"appdb" {:available #(== 1 %), :connected zero?}}
              (readiness-gauges system))))))

(defn- exposed-last-success
  "The last-success samples a scrape would actually see, as `{storage value}`.
  Read from the exposition rather than [[mt/metric-value]], which creates the child it looks up and so
  reports an absent series as a present zero."
  [system]
  (into {}
        (keep (fn [line]
                (when-let [[_ storage value]
                           (re-find #"^metabase_pgvector_store_last_success_timestamp_seconds\{storage=\"([^\"]+)\",?\} (\S+)"
                                    line)]
                  [storage (parse-double value)])))
        (str/split-lines (export/text-format (:registry system)))))

(deftest last-success-does-not-outlive-its-storage-test
  (mt/with-prometheus-system! [_ system]
    (mt/with-dynamic-fn-redefs
      [semantic.db.datasource/dedicated-url-configured?   (constantly true)
       semantic.db.datasource/probe-dedicated-connection! (constantly {:one 1})]
      (@#'semantic.store-health/collect-pgvector-readiness-metrics!))
    (is (=? {"dedicated" pos?} (exposed-last-success system)))
    (testing "switching storage drops the old timestamp, which would otherwise never advance again"
      (mt/with-dynamic-fn-redefs
        [semantic.db.datasource/dedicated-url-configured? (constantly false)
         semantic.u/semantic-search-configured?           (constantly true)
         semantic.db.datasource/pgvector-mode             (constantly :app-db)
         semantic.db.datasource/probe-app-db-store!       (constantly true)]
        (@#'semantic.store-health/collect-pgvector-readiness-metrics!))
      (is (=? {"appdb" pos?} (exposed-last-success system)))
      (is (= #{"appdb"} (set (keys (exposed-last-success system))))
          "the abandoned label is gone rather than zeroed -- a 0 would read as 1970"))))

(deftest probe-deadline-test
  (let [probe @#'semantic.store-health/probe-connected?]
    (testing "a probe that outruns the deadline reads as disconnected instead of stranding the caller"
      (let [released (promise)]
        (mt/with-dynamic-fn-redefs
          [semantic.db.datasource/probe-dedicated-connection!
           ;; Never returns on its own, so the deadline is the only thing that can end it.
           (fn [] (try
                    @(promise)
                    (catch InterruptedException _ (deliver released true))))]
          (is (false? (probe :dedicated 50)))
          (is (true? (deref released 5000 ::still-hung))
              "the abandoned probe is interrupted, not left holding a pool thread forever"))))
    (testing "an ordinary failure still reads as disconnected"
      (mt/with-dynamic-fn-redefs
        [semantic.db.datasource/probe-dedicated-connection! #(throw (ex-info "nope" {}))]
        (is (false? (probe :dedicated 60000)))))
    (testing "a store that answers reads as connected"
      (mt/with-dynamic-fn-redefs
        [semantic.db.datasource/probe-dedicated-connection! (constantly {:one 1})]
        (is (true? (probe :dedicated 60000)))))))

(deftest pgvector-readiness-skips-unlicensed-app-db-probe-test
  (testing "an unlicensed instance never resolves pgvector-mode, whose app-db arm probes the app db"
    (mt/with-premium-features #{}
      (mt/with-prometheus-system! [_ system]
        (mt/with-dynamic-fn-redefs
          [semantic.db.datasource/dedicated-url-configured? (constantly false)
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
  (testing "a configured dedicated store starts available without being probed"
    (mt/with-dynamic-fn-redefs [semantic.db.datasource/dedicated-url-configured? (constantly true)]
      (is (= 1 (analytics.core/initial-value :metabase-pgvector/store-available {:storage "dedicated"})))
      (is (zero? (analytics.core/initial-value :metabase-pgvector/store-available {:storage "appdb"})))))
  (testing "app-db availability is left to the background probe"
    (mt/with-dynamic-fn-redefs [semantic.db.datasource/dedicated-url-configured? (constantly false)]
      (is (zero? (analytics.core/initial-value :metabase-pgvector/store-available {:storage "dedicated"})))
      (is (zero? (analytics.core/initial-value :metabase-pgvector/store-available {:storage "appdb"}))))))

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
        (reset! probe (fresh-probe {:storage nil, :connected? false}))
        (is (nil? (check)) "omitted when there is no store to reach")
        (reset! probe (fresh-probe {:storage "dedicated", :connected? true}))
        (is (=? {:health 100, :message #"pgvector store \(dedicated\) reachable\."} (check)))
        (reset! probe (fresh-probe {:storage "appdb", :connected? false}))
        (is (=? {:health 0, :message #"pgvector store \(appdb\) unreachable\."} (check)))
        (is (zero? @collects)))
      (testing "a missing or stale probe is refreshed, so an unscraped instance still reports"
        (reset! probe nil)
        (check)
        (reset! probe {:storage "dedicated", :connected? true, :at 0})
        (check)
        (is (= 2 @collects))))))

(deftest ^:sequential pull-collector-refreshes-pgvector-metrics-on-each-instance-test
  (let [running?    @#'semantic.store-health/readiness-refresh-running?
        collector   (analytics.core/pull-collector ::semantic.store-health/pgvector-readiness-gauges)
        gauge-calls (atom [])
        refreshes   (atom 0)
        submitted   (atom [])]
    (try
      (reset! running? false)
      (mt/with-dynamic-fn-redefs
        [analytics/set-gauge!                                       #(swap! gauge-calls conj (vec %&))
         semantic.store-health/collect-pgvector-readiness-metrics!  #(swap! refreshes inc)
         semantic.store-health/submit-pgvector-readiness-refresh!   #(swap! submitted conj %)]
        ((:f collector))
        ((:f collector))
        (is (= 1 (count @submitted)) "overlapping scrapes share one local refresh")
        (is (empty? @gauge-calls) "the scrape path writes no gauges of its own")
        (is (zero? @refreshes) "the database probe does not run on the synchronous scrape path")
        ((first @submitted)))
      (is (= 3600 (:min-interval-s collector)))
      (is (= 1 @refreshes))
      (is (false? @running?))
      (finally
        (reset! running? false)))))
