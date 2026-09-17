(ns metabase.search.core-metrics-test
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.analytics-interface.core :as analytics]
   [metabase.search.appdb.core :as appdb]
   [metabase.search.appdb.index :as search.index]
   [metabase.search.appdb.metrics :as search.metrics]
   [metabase.search.db :as search.db]
   [metabase.search.engine :as search.engine]
   [metabase.search.spec :as search.spec]
   [metabase.search.test-util :as search.tu]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))

(defn- with-completion-index [f]
  (binding [search.spec/*testing-only-index-version-hash* (str (random-uuid))]
    (let [{:keys [coordinate table] :as rebuild} (search.index/rebuild-context :completion-test)]
      (mt/with-temp [:model/SearchIndexMetadata _ {:engine     (:engine coordinate)
                                                   :index_name (name table)
                                                   :lang_code  (:lang-code coordinate)
                                                   :status     :active
                                                   :version    (:version coordinate)}]
        (f rebuild)))))

(deftest completion-is-shared-and-survives-collector-restart-test
  (with-completion-index
    (fn [{:keys [coordinate] :as rebuild}]
      (is (nil? (search.db/active-index-completion coordinate)))
      (is (true? (search.index/complete-rebuild! rebuild)))
      (let [completed (search.db/active-index-completion coordinate)
            samples   (atom [])]
        (is (some? completed))
        (mt/with-dynamic-fn-redefs [analytics/clear! (constantly nil)
                                    analytics/set-gauge! (fn [& args] (swap! samples conj args))
                                    search.engine/active-engines (constantly [:search.engine/appdb])]
          (dotimes [_ 2]
            (#'search.metrics/collect-freshness!))
          (is (= 2 (count @samples)))
          (is (= (first @samples) (second @samples)) "collection never invents a newer success")
          (is (= [:metabase-search/last-successful-reindex-timestamp-seconds
                  {:engine "appdb", :locale (:lang-code coordinate), :version (:version coordinate)}
                  (/ (.toEpochMilli ^java.time.Instant (t/instant completed)) 1000.0)]
                 (vec (first @samples)))))))))

(deftest unknown-completion-clears-old-labels-test
  (with-completion-index
    (fn [_]
      (let [calls (atom [])]
        (mt/with-dynamic-fn-redefs [analytics/clear! (fn [metric] (swap! calls conj [:clear metric]))
                                    analytics/set-gauge! (fn [& args] (swap! calls conj [:set args]))
                                    search.engine/active-engines (constantly [:search.engine/appdb])]
          (#'search.metrics/collect-freshness!)
          (is (= [[:clear :metabase-search/last-successful-reindex-timestamp-seconds]] @calls)))))))

(deftest inactive-engine-does-not-export-completion-test
  (with-completion-index
    (fn [rebuild]
      (search.index/complete-rebuild! rebuild)
      (let [samples (atom [])]
        (mt/with-dynamic-fn-redefs [analytics/clear! (constantly nil)
                                    analytics/set-gauge! (fn [& args] (swap! samples conj args))
                                    search.engine/active-engines (constantly [:search.engine/semantic])]
          (#'search.metrics/collect-freshness!)
          (is (empty? @samples)))))))

(deftest wrong-destination-cannot-complete-test
  (with-completion-index
    (fn [{:keys [coordinate] :as rebuild}]
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"no longer active"
                            (search.index/complete-rebuild! (assoc rebuild :table :another-table))))
      (is (nil? (search.db/active-index-completion coordinate))))))

(deftest completion-rolls-back-with-transaction-test
  (with-completion-index
    (fn [{:keys [coordinate] :as rebuild}]
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"rollback"
                            (t2/with-transaction [conn]
                              (is (= 1 (search.db/complete-rebuild! conn rebuild)))
                              (throw (ex-info "rollback" {})))))
      (is (nil? (search.db/active-index-completion coordinate))))))

(deftest empty-rebuild-still-reports-test
  (search.tu/with-temp-index-table
    (is (= {} (search.index/index-docs! :search/updating [])))))

(deftest failed-in-place-population-invalidates-and-retries-on-init-test
  (with-completion-index
    (fn [{:keys [coordinate table] :as rebuild}]
      (search.index/complete-rebuild! rebuild)
      (let [attempts (atom 0)]
        (mt/with-dynamic-fn-redefs [search.index/active-table (constantly table)
                                    search.index/clear-active-table! (constantly nil)
                                    search.index/delete-obsolete-tables! (constantly nil)
                                    search.index/ensure-ready! (constantly false)
                                    search.index/when-index-created (constantly (t/offset-date-time))
                                    appdb/populate-index! (fn [& _]
                                                            (when (= 1 (swap! attempts inc))
                                                              (throw (ex-info "population failed" {})))
                                                            {})]
          (is (thrown-with-msg? clojure.lang.ExceptionInfo #"population failed"
                                (search.engine/reindex! :search.engine/appdb {:in-place? true})))
          (is (nil? (search.db/active-index-completion coordinate)))
          (is (= {} (search.engine/init! :search.engine/appdb {})))
          (is (some? (search.db/active-index-completion coordinate)))
          (is (nil? (search.engine/init! :search.engine/appdb {})) "completed reuse does not populate again")
          (is (= 2 @attempts)))))))

(deftest completion-read-failure-removes-stale-metric-test
  (let [cleared (atom [])]
    (mt/with-dynamic-fn-redefs [analytics/clear! #(swap! cleared conj %)
                                search.engine/active-engines (constantly [:search.engine/appdb])
                                search.db/active-index-completion (fn [_] (throw (ex-info "database unavailable" {})))]
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"database unavailable" (#'search.metrics/collect-freshness!)))
      (is (= [:metabase-search/last-successful-reindex-timestamp-seconds] @cleared)))))
