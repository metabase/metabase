(ns metabase.lib.clean
  (:require
    [clojure.data :as data]
    [malli.core :as mc]
    [metabase.lib.schema :as lib.schema]
    [metabase.util :as u]
    [metabase.util.log :as log]
    [metabase.util.malli :as mu]))

(defn- clean-location [almost-stage error-type error-location]
  (let [operate-on-parent? #{:malli.core/missing-key :malli.core/end-of-input}
        location (if (operate-on-parent? error-type)
                   (drop-last 2 error-location)
                   (drop-last 1 error-location))
        [location-key] (if (operate-on-parent? error-type)
                         (take-last 2 error-location)
                         (take-last 1 error-location))]
    (if (seq location)
      (update-in almost-stage
                 location
                 (fn [error-loc]
                   (let [result (assoc error-loc location-key nil)]
                     (cond
                       (vector? error-loc) (into [] (remove nil?) result)
                       (map? error-loc) (u/remove-nils result)
                       :else result))))
      (dissoc almost-stage location-key))))

(def ^:private stage-keys
  #{:aggregation :breakout :expressions :fields :filters :order-by :joins})

(defn- clean-stage [almost-stage]
  (loop [almost-stage almost-stage
         removals []]
    (if-let [[error-type error-location] (->> (mc/explain ::lib.schema/stage.mbql almost-stage)
                                              :errors
                                              (filter (comp stage-keys first :in))
                                              (map (juxt :type :in))
                                              first)]
      (let [new-stage (clean-location almost-stage error-type error-location)]
        (log/warnf "Clean: Removing bad clause in %s due to error %s:\n%s"
                   (u/colorize :yellow (pr-str error-location))
                   (u/colorize :yellow (pr-str error-type))
                   (u/colorize :red (u/pprint-to-str (first (data/diff almost-stage new-stage)))))
        (if (= new-stage almost-stage)
          almost-stage
          (recur new-stage (conj removals [error-type error-location]))))
      almost-stage)))

(mu/defn clean :- ::lib.schema/query
  "Cleans a not-yet-validated, newly modified `almost-query` and returns a valid query.
   Will find invalid clauses through stages' top level keys remove them and recur until something valid is left."
  [almost-query]
  (loop [almost-query almost-query
         stage-index 0]
    (let [current-stage (nth (:stages almost-query) stage-index)
          new-stage (clean-stage current-stage)]
      (if (= current-stage new-stage)
        (if (= stage-index (dec (count (:stages almost-query))))
          almost-query
          (recur almost-query (inc stage-index)))
        (recur (update almost-query :stages assoc stage-index new-stage) stage-index)))))
