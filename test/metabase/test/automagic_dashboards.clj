(ns metabase.test.automagic-dashboards
  "Helper functions and macros for writing tests for automagic dashboards."
  (:require [clojure.test :refer :all]
            [metabase.mbql.normalize :as normalize]
            [metabase.mbql.schema :as mbql.s]
            [metabase.models :refer [Card Collection Dashboard DashboardCard]]
            [metabase.test :as mt]
            [metabase.util :as u]
            [metabase.util.schema :as su]
            [schema.core :as s]))

(defmacro with-dashboard-cleanup
  "Execute body and cleanup all dashboard elements created."
  [& body]
  `(mt/with-model-cleanup [Card Dashboard Collection DashboardCard]
     ~@body))

(defn- collect-urls
  [dashboard]
  (->> dashboard
       (tree-seq (some-fn sequential? map?) identity)
       (keep (fn [form]
               (when (map? form)
                 (:url form))))))

(defn- test-urls-are-valid
  [dashboard]
  (doseq [url (collect-urls dashboard)]
    (testing (format "\nURL = %s" (pr-str url))
      (is (schema= {:name        su/NonBlankString
                    :description su/NonBlankString
                    s/Keyword    s/Any}
                   (mt/user-http-request :rasta :get 200 (format "automagic-dashboards/%s" (subs url 16))))))))

(defn- test-card-is-valid [{query :dataset_query, :as card}]
  (testing "Card should be valid"
    (testing (format "\nCard =\n%s\n" (u/pprint-to-str card))
      (testing "Card query should be valid"
        (is (schema= mbql.s/Query
                     (normalize/normalize query)))))))

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
        (is (= cardinality (-> dashboard :ordered_cards count))))
      (testing "URLs should be valid"
        (test-urls-are-valid dashboard))
      (testing "Dashboard's cards should be valid"
        (doseq [card (keep :card (:ordered_cards dashboard))]
          (test-card-is-valid card))))))
