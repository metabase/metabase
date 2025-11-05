(ns metabase.stale-test
  (:require
   [metabase.test :as mt])
  (:import
   (java.time LocalDate LocalDateTime)))

(set! *warn-on-reflection* true)

(defn date-months-ago
  "Get the date n months ago."
  ^LocalDate
  [n]
  (-> (LocalDate/now)
      (.minusMonths n)))

(defn datetime-months-ago
  "Get the datetime n months ago."
  ^LocalDateTime
  [n]
  (-> (LocalDateTime/now)
      (.minusMonths n)))

(defn stale-dashboard [dashboard]
  ;; assoc the dashboard with the current time minus 7 months
  (assoc dashboard :last_viewed_at (datetime-months-ago 7)))

(defn stale-card [card]
  ;; assoc the card with the current time minus 7 months
  (assoc card :last_used_at (datetime-months-ago 7)))

(defmacro with-stale-items [inputs & body]
  (let [processed-inputs
        (map (fn [[model binding args]]
               (let [column (case model
                              :model/Card :last_used_at
                              :model/Dashboard :last_viewed_at
                              (throw (ex-info "`with-stale` only works for cards or dashboards." {})))]
                 [model binding `(assoc ~args ~column (datetime-months-ago 7))]))
             (partition-all 3 inputs))]
    `(mt/with-temp ~(vec (apply concat processed-inputs))
       ~@body)))
