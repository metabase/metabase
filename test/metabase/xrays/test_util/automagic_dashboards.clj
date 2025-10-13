(ns metabase.xrays.test-util.automagic-dashboards
  "Helper functions and macros for writing tests for automagic dashboards."
  (:require
   [clojure.test :refer :all]
   [metabase.test :as mt]
   [metabase.util :as u]
   [metabase.util.malli.schema :as ms]
   [metabase.xrays.automagic-dashboards.schema :as ads]
   [toucan2.core :as t2]))

(defmacro with-rollback-only-transaction
  "Execute body and cleanup all dashboard elements created."
  [& body]
  `(do
     ;; make sure test data is initialized outside of the rollback-only transaction
     (mt/id)
     (t2/with-transaction [_conn# nil {:rollback-only true}]
       ~@body)))

(defn- collect-urls
  [dashboard]
  (->> dashboard
       (tree-seq (some-fn sequential? map?) identity)
       (keep (fn [form]
               (when (map? form)
                 (:url form))))))

(defn- test-urls-are-valid
  [dashboard]
  (doseq [url (collect-urls dashboard)
          :let [url (format "automagic-dashboards/%s" (subs url 16))]]
    (testing (format "\nendpoint = GET /api/%s" url)
      (is (malli= [:map
                   [:name        ms/NonBlankString]
                   [:description ms/NonBlankString]]
                  (mt/user-http-request :crowberto :get 200 url))))))

(defn- test-card-is-valid [{query :dataset_query, :as card}]
  (testing "Card should be valid"
    (testing (format "\nCard =\n%s\n" (u/pprint-to-str card))
      (testing "Card query should be valid"
        (is (map? query))
        (is (malli= ::ads/query
                    query))))))

(defn test-dashboard-is-valid
  "Is generated dashboard valid?
   Tests that the dashboard has (the correct number of) cards, the queries for those cards are valid,
   all related URLs are valid, and that it has correct metadata."
  [dashboard cardinality]
  (testing (format "Dashboard should be valid")
    (testing (format "\nDashboard =\n%s\n" (u/pprint-to-str dashboard))
      (testing "Dashboard should have a name"
        (is (some? (:name dashboard))))
      (testing "Cards should have correct cardinality"
        (is (= cardinality (-> dashboard :dashcards count))))
      (testing "URLs should be valid"
        (test-urls-are-valid dashboard))
      (testing "Dashboard's cards should be valid"
        (doseq [card (keep :card (:dashcards dashboard))]
          (test-card-is-valid card)))
      (testing "Dashboard should have `auto_apply_filters` set to true"
        (is (true? (:auto_apply_filters dashboard)))))))
