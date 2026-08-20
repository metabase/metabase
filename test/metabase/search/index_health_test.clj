(ns metabase.search.index-health-test
  (:require
   [clojure.test :refer :all]
   [metabase.analytics-interface.core :as analytics]
   [metabase.analytics.core :as analytics.core]
   [metabase.health-inspector.core :as health-inspector]
   [metabase.search.index-health :as index-health]
   [metabase.test :as mt]
   [metabase.util :as u]))

(set! *warn-on-reflection* true)

(deftest ^:synchronized register-index-check!-migrates-a-legacy-registry-test
  (testing "a live upgrade migrates the defonce'd registry's former vector value"
    (let [measures (atom [{:check-name :legacy-measure, :collect (constantly nil)}])
          checks   (atom {})]
      (with-redefs [index-health/index-measures measures
                    health-inspector/checks     checks]
        (let [{:keys [check-name]}
              (index-health/register-index-check! :test-migration :coverage (constantly nil))]
          (is (= #{:legacy-measure check-name} (set (keys @measures))))
          (is (contains? @checks check-name)))))))

(deftest ^:parallel coverage-result-test
  (testing "coverage health is the percentage; the ratio feeds the gauge"
    (is (=? {:value 0.5 :health 50 :message #"5 of 10 expected items indexed \(50%\)\."}
            (index-health/coverage-result 5 10))))
  (testing "an empty candidate set is fully covered"
    (is (=? {:value 1.0 :health 100 :message #"0 of 0 .*100%.*"}
            (index-health/coverage-result 0 0))))
  (testing "coverage clamps over-counts to 100 percent"
    (is (=? {:value 1.0 :health 100} (index-health/coverage-result 12 10))))
  (testing "only exact endpoints score 0 or 100"
    (is (=? {:health 99} (index-health/coverage-result 999 1000)))
    (is (=? {:health 1} (index-health/coverage-result 1 1000)))
    (is (=? {:health 0} (index-health/coverage-result 0 1000)))))

(deftest ^:parallel garbage-result-test
  (testing "zero orphans is healthy"
    (is (=? {:value 0 :health 100 :message #"No orphaned items.*"}
            (index-health/garbage-result 0 5 100))))
  (testing "the value is an absolute count"
    (is (=? {:value 42 :message #"42 orphaned item\(s\) in the index\."}
            (index-health/garbage-result 42 5 100))))
  (testing "health is linear between the warning and critical thresholds"
    (is (=? {:health 100} (index-health/garbage-result 5 5 100)))
    (is (=? {:health 0}   (index-health/garbage-result 100 5 100)))
    (is (=? {:health 50}  (index-health/garbage-result 52 4 100))))
  (testing "intermediate values do not round to an endpoint"
    (is (=? {:health 99} (index-health/garbage-result 1 0 1000)))
    (is (=? {:health 1} (index-health/garbage-result 999 0 1000)))))

(deftest ^:parallel staleness-result-test
  (testing "values at or below the warning threshold are healthy"
    (is (=? {:value 0 :health 100 :message #"Index current\. more"}
            (index-health/staleness-result 0 60 600 "more")))
    (is (=? {:health 100} (index-health/staleness-result 60 60 600 nil))))
  (testing "values at or above the critical threshold are degraded"
    (is (=? {:health 0, :message #"Oldest pending change is 2\.8h old\."}
            (index-health/staleness-result 9999 60 600 nil))))
  (testing "health is linear between the warning and critical thresholds"
    (is (=? {:health 50} (index-health/staleness-result 330 60 600 nil)))))

(deftest ^:synchronized run-measure!-test
  (let [calls (atom [])
        live  (atom {})]
    (with-redefs [index-health/live-gauge-series live]
      (mt/with-dynamic-fn-redefs [analytics/set-gauge!     (fn [& args] (swap! calls conj (vec args)))
                                  analytics/remove-series! (fn [& args] (swap! calls conj (into [:removed] args)))]
        (testing "a collector result updates the gauge and returns the health row"
          (is (= {:health 75 :message "ok"}
                 (#'index-health/run-measure! {:gauge-key :metabase-search/index-coverage-ratio
                                               :index    :semantic
                                               :collect   (constantly {:value   0.75
                                                                       :health  75
                                                                       :message "ok"})})))
          (is (= [[:metabase-search/index-coverage-ratio {:index "semantic"} 0.75]] @calls)))
        (testing "an inapplicable collector stops exporting a live gauge and returns nil"
          (reset! calls [])
          (is (nil? (#'index-health/run-measure! {:gauge-key :metabase-search/index-coverage-ratio
                                                  :index    :semantic
                                                  :collect   (constantly nil)})))
          (is (= [[:removed :metabase-search/index-coverage-ratio {:index "semantic"}]] @calls)))
        (testing "a throwing collector stops exporting the gauge and returns a degraded row"
          (#'index-health/run-measure! {:gauge-key :metabase-search/index-coverage-ratio
                                        :index    :throwing-collector-test
                                        :collect   (constantly {:value 0.9 :health 90 :message "was fine"})})
          (reset! calls [])
          (is (=? {:health 0, :message #"Metric collector errored: collector boom"}
                  (#'index-health/run-measure! {:gauge-key :metabase-search/index-coverage-ratio
                                                :index    :throwing-collector-test
                                                :collect   (fn []
                                                             (throw (ex-info "collector boom" {})))})))
          (is (= [[:removed :metabase-search/index-coverage-ratio {:index "throwing-collector-test"}]]
                 @calls)))))))

(deftest run-measure!-propagates-interruption-test
  (is (thrown? InterruptedException
               (#'index-health/run-measure! {:gauge-key :metabase-search/index-coverage-ratio
                                             :index     :interrupted-test
                                             :collect   #(throw (InterruptedException.))}))))

(deftest ^:synchronized inapplicable-measure-does-not-create-series-test
  (testing "an inapplicable measure does not create a NaN-only series"
    (let [calls (atom [])]
      (mt/with-dynamic-fn-redefs [analytics/set-gauge! (fn [& args] (swap! calls conj (vec args)))]
        (#'index-health/run-measure! {:gauge-key :metabase-search/index-coverage-ratio
                                      :index    :never-emitted-test-engine
                                      :collect   (constantly nil)}))
      (is (empty? @calls)))))

(deftest ^:synchronized failed-first-write-does-not-mark-series-live-test
  (testing "a failed first gauge write does not make later clears create a NaN-only series"
    (let [publish! index-health/publish-gauge!
          live     @#'index-health/live-gauge-series
          labels   {:index "failed-write-test-engine"}
          series   [:metabase-search/index-coverage-ratio labels]
          calls    (atom [])]
      (try
        (mt/with-dynamic-fn-redefs [analytics/set-gauge! (fn [& _]
                                                           (throw (ex-info "prometheus down" {})))]
          (is (thrown? Exception (publish! (first series) labels 1.0)))
          (is (not (contains? @live series))))
        (mt/with-dynamic-fn-redefs [analytics/set-gauge! (fn [& args] (swap! calls conj (vec args)))]
          (publish! (first series) labels nil)
          (is (empty? @calls))
          (publish! (first series) labels 0.5)
          (is (contains? @live series)))
        (finally
          (swap! live dissoc series))))))

(deftest ^:synchronized refresh-isolates-measure-failures-test
  (testing "one collector failure does not stop later measures from refreshing"
    (let [calls (atom [])
          live  (atom {})
          boom  {:check-name :test-boom
                 :gauge-key  :metabase-search/index-staleness-seconds
                 :index     :refresh-isolation-test
                 :collect    (fn [] (throw (ex-info "collector boom" {})))}
          ok    {:check-name :test-ok
                 :gauge-key  :metabase-search/index-coverage-ratio
                 :index     :refresh-isolation-test
                 :collect    (constantly {:value 1.0 :health 100 :message "ok"})}]
      (with-redefs [index-health/live-gauge-series live]
        (mt/with-dynamic-fn-redefs [analytics/set-gauge!      (fn [& args] (swap! calls conj (vec args)))
                                    analytics/remove-series!  (fn [& args] (swap! calls conj (into [:removed] args)))
                                    health-inspector/enabled? (constantly false)]
          (#'index-health/run-measure! (assoc boom :collect
                                              (constantly {:value 5 :health 100 :message "was fine"})))
          (reset! calls [])
          (run! #'index-health/refresh-index-check! [boom ok])))
      (is (= [[:removed :metabase-search/index-staleness-seconds {:index "refresh-isolation-test"}]
              [:metabase-search/index-coverage-ratio {:index "refresh-isolation-test"} 1.0]]
             @calls)))))

(deftest ^:synchronized pull-collector-refreshes-gauges-on-each-instance-test
  (let [measures  @#'index-health/index-measures
        in-flight @#'index-health/refreshes-in-flight
        before    @measures
        seen      (atom [])
        submitted (atom [])
        one       {:check-name :one}
        two       {:check-name :two}
        collector (analytics.core/pull-collector :metabase.search.index-health/index-health-gauges)]
    (try
      (reset! measures {:one one, :two two})
      (reset! in-flight #{})
      (mt/with-dynamic-fn-redefs
        [index-health/run-measure!          #(swap! seen conj %)
         index-health/submit-gauge-refresh! #(swap! submitted conj %)
         health-inspector/save-check-result! #(throw (ex-info "must not persist from a scrape" {}))]
        ((:f collector))
        ((:f collector))
        (is (empty? @seen) "the scrape path does not run index scans")
        (is (= 1 (count @submitted)) "overlapping scrapes share one refresh")
        ((first @submitted)))
      (is (= 600 (:min-interval-s collector)))
      (is (= #{one two} (set @seen)))
      (is (empty? @in-flight))
      (finally
        (reset! in-flight #{})
        (reset! measures before)))))

(deftest ^:synchronized background-gauge-refresh-isolates-write-failures-test
  (let [measures (atom {:one {:check-name :one}, :two {:check-name :two}})
        seen     (atom [])]
    (with-redefs [index-health/index-measures measures]
      (mt/with-dynamic-fn-redefs
        [index-health/run-measure! (fn [{:keys [check-name]}]
                                     (swap! seen conj check-name)
                                     (when (= :one check-name)
                                       (throw (ex-info "prometheus down" {}))))]
        (#'index-health/refresh-search-index-gauges!)))
    (is (= #{:one :two} (set @seen))))
  (testing "interruption still escapes the per-descriptor boundary"
    (is (thrown? InterruptedException
                 (#'index-health/refresh-index-gauge! {:check-name :interrupted
                                                       :gauge-key  :metabase-search/index-coverage-ratio
                                                       :index      :interrupted
                                                       :collect    #(throw (InterruptedException.))})))))

(deftest ^:sequential expire-stale-gauges!-test
  (let [calls (atom [])
        live  (atom {[:metabase-search/index-coverage-ratio {:index "fresh"}] ::fresh
                     [:metabase-search/index-coverage-ratio {:index "stale"}] ::stale})]
    ;; a map is a function of its keys, so this stands in for the timers' ages
    (with-redefs [index-health/live-gauge-series live
                  u/since-ms                    {::fresh 1000, ::stale 3600000}]
      (mt/with-dynamic-fn-redefs [analytics/remove-series! (fn [& args] (swap! calls conj (vec args)))]
        (#'index-health/expire-stale-gauges!)
        (testing "a series this node stopped refreshing stops being exported"
          (is (= [[:metabase-search/index-coverage-ratio {:index "stale"}]] @calls))
          (is (= #{[:metabase-search/index-coverage-ratio {:index "fresh"}]} (set (keys @live)))))
        (testing "and only once"
          (reset! calls [])
          (#'index-health/expire-stale-gauges!)
          (is (empty? @calls)))))))

(deftest ^:sequential expiry-covers-unlabelled-series-test
  (testing "the semantic store gauges publish with no labels, and must expire like any other"
    (let [calls (atom [])
          stale [:metabase-search/semantic-gate-size nil]
          live  (atom {stale ::stale})]
      (with-redefs [index-health/live-gauge-series live
                    u/since-ms                    {::stale 3600000}]
        (mt/with-dynamic-fn-redefs [analytics/remove-series! (fn [& args] (swap! calls conj (vec args)))]
          (#'index-health/expire-stale-gauges!)
          (is (= [[:metabase-search/semantic-gate-size nil]] @calls))
          (is (empty? @live)))))))

(deftest ^:sequential sweep-iterates-its-own-snapshot-test
  (testing "a pre-reload writer doesn't hold the lock, so a late malformed entry must not reach the sweep"
    (let [calls     (atom [])
          stale     [:metabase-search/index-coverage-ratio {:index "stale"}]
          live      (atom {stale ::stale})
          normalize @#'index-health/normalize-tracker!]
      (with-redefs [index-health/live-gauge-series live
                    u/since-ms                    {::stale 3600000}]
        ;; land the malformed entry in the window the fix closes: after normalizing, before the sweep would
        ;; have re-read the atom. Iterating the returned snapshot is what makes it invisible here.
        (with-redefs-fn {#'index-health/normalize-tracker!
                         (fn []
                           (let [normalized (normalize)]
                             (swap! live assoc :metabase-search/index-garbage-count :semantic-search)
                             normalized))}
          (fn []
            (mt/with-dynamic-fn-redefs [analytics/remove-series! (fn [& args] (swap! calls conj (vec args)))]
              (#'index-health/expire-stale-gauges!)
              (is (= [[:metabase-search/index-coverage-ratio {:index "stale"}]] @calls))
              (is (contains? @live :metabase-search/index-garbage-count)
                  "the late entry waits for the next sweep to normalize it"))))))))

(deftest ^:sequential reload-era-entries-become-expirable-test
  (testing "an entry a pre-reload refresh conj'd onto the migrated map is made usable, not left forever"
    (let [calls (atom [])
          live  (atom {;; what (conj {} [gauge-key index]) leaves behind
                       :metabase-search/index-garbage-count :semantic-search})]
      (with-redefs [index-health/live-gauge-series live]
        (mt/with-dynamic-fn-redefs [analytics/remove-series! (fn [& args] (swap! calls conj (vec args)))]
          (#'index-health/expire-stale-gauges!)
          (is (empty? @calls) "not stale yet -- it was just given a timer")
          (is (= [[:metabase-search/index-garbage-count {:index "semantic-search"}]] (keys @live))
              "and it now carries a key removal and expiry can act on"))))))

(deftest ^:parallel normalize-tracker-test
  (testing "a reload's retained set becomes timed entries, so its series stay removable"
    (is (=? {[:metabase-search/index-coverage-ratio {:index "semantic-search"}] some?}
            (#'index-health/normalize-tracker
             #{[:metabase-search/index-coverage-ratio :semantic-search]}))))
  (testing "well-formed entries pass through untouched, labels or not"
    (let [tracked {[:metabase-search/index-coverage-ratio {:index "appdb"}] ::timer
                   [:metabase-search/semantic-gate-size nil]                ::timer}]
      (is (= tracked (#'index-health/normalize-tracker tracked)))))
  (testing "anything unreadable is dropped rather than carried forward"
    (is (= {} (#'index-health/normalize-tracker {"junk" 1})))))
