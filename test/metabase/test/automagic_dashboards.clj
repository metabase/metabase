(ns metabase.test.automagic-dashboards
  "Helper functions and macros for writing tests for automagic dashboards."
  (:require [metabase.api.common :as api]
            [metabase.models.user :as user]
            [metabase.query-processor :as qp]
            [metabase.test.data.users :as test-users]
            [metabase.test.util :as tu]))

(defmacro with-rasta
  "Execute body with rasta as the current user."
  [& body]
  `(binding [api/*current-user-id*              (test-users/user->id :rasta)
             api/*current-user-permissions-set* (-> :rasta
                                                    test-users/user->id
                                                    user/permissions-set
                                                    atom)]
     ~@body))

(defmacro with-dashboard-cleanup
  "Execute body and cleanup all dashboard elements created."
  [& body]
  `(tu/with-model-cleanup ['~'Card '~'Dashboard '~'Collection '~'DashboardCard]
     ~@body))

(defn- collect-urls
  [dashboard]
  (->> dashboard
       (tree-seq (some-fn sequential? map?) identity)
       (keep (fn [form]
               (when (map? form)
                 (:url form))))))

(defn- valid-urls?
  [dashboard]
  (->> dashboard
       collect-urls
       (every? (fn [url]
                 ((test-users/user->client :rasta) :get 200 (format "automagic-dashboards/%s"
                                                                    (subs url 16)))))))

(def ^:private valid-card?
  (comp qp/expand :dataset_query))

(defn valid-dashboard?
  "Is generated dashboard valid?
   Tests that the dashboard has cards, the queries for those cards are valid, all related URLs are
   valid, and that it has correct metadata."
  [dashboard]
  (assert (:name dashboard))
  (assert (-> dashboard :ordered_cards count pos?))
  (assert (valid-urls? dashboard))
  (assert (every? valid-card? (keep :card (:ordered_cards dashboard))))
  true)
