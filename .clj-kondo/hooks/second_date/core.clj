(ns hooks.second-date.core
  (:require [clj-kondo.hooks-api :as hooks]))

(defn- check-for-first-day-of-week-option [node]
  (if (< (count (:children node)) 4)
    (hooks/reg-finding!
     (assoc (meta node)
            :message "You should always explicitly pass in a :first-day-of-week option e.g. {:first-day-of-week (public-settings/start-of-week)}. Use the 3-arity."
            :type    :metabase/check-second-date-arities))
    (let [last-node (last (:children node))]
      (when (hooks/map-node? last-node)
        (let [options (hooks/sexpr last-node)]
          (when-not (contains? options :first-day-of-week)
            (hooks/reg-finding!
             (assoc (meta node)
                    :message "Options is missing :first-day-of-week e.g. {:first-day-of-week (public-settings/start-of-week)}"
                    :type    :metabase/check-second-date-arities))))))))

(defn bucket [{:keys [node], :as x}]
  (check-for-first-day-of-week-option node)
  x)

(defn extract [{:keys [node], :as x}]
  (check-for-first-day-of-week-option node)
  x)

(defn truncate [{:keys [node], :as x}]
  (check-for-first-day-of-week-option node)
  x)

(comment
  (extract
   {:node (hooks/parse-string
           (with-out-str
             (clojure.pprint/pprint
              '(second-date.core/extract "2024-01-03" :day))))})
  (extract
   {:node (hooks/parse-string
           (with-out-str
             (clojure.pprint/pprint
              '(second-date.core/extract "2024-01-03" :day {:first-day-of-week :monday}))))}))
