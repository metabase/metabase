(ns metabase.lib.util
  (:require [metabase.shared.util.i18n :as i18n]
            [clojure.set :as set]))

(defn roll-query
  [query]
  (loop [acc [], inner-query (:query query)]
    (if (:source-query inner-query)
      (recur (cons (dissoc inner-query :source-query) acc)
             (:source-query inner-query))
      (assoc (dissoc query :query)
             :type :pipeline
             :stages (vec (cons inner-query acc))))))

(defn unroll-query
  [{:keys [stages], :as query}]
  (-> query
      (dissoc :stages)
      (assoc :type :query
             :query (reduce
                     (fn [source-query inner-query]
                       (cond-> inner-query
                         source-query
                         (assoc :source-query source-query)))
                     nil
                     stages))))

(defn- normalize-stage [stages stage]
  (let [stage' (if (neg? stage)
                 (+ (count stages) stage)
                 stage)]
    (when (or (> stage' (dec (count stages)))
              (neg? stage'))
      (throw (ex-info (i18n/tru "Stage {0} does not exist" stage)
                      {})))
    stage'))

(defn query-stage
  [query stage]
  (let [{:keys [stages]} (roll-query query)]
    (nth (vec stages) (normalize-stage stages stage))))

(defn update-query-stage
  [query stage f & args]
  (let [{:keys [stages], :as query} (roll-query query)
        stage'                      (normalize-stage stages stage)
        stages'                     (apply update (vec stages) stage' f args)]
    (unroll-query (assoc query :stages stages'))))

(defn ensure-mbql-final-stage [query]
  (if (= (:type query) :query)
    query
    (-> query
        (dissoc :native)
        (assoc :type  :query
               :query {:source-query (set/rename-keys (:native query) {:query :native})}))))
