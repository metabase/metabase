(ns metabase.lib.util
  (:require
   [clojure.set :as set]
   [metabase.shared.util.i18n :as i18n]))

(defn pipeline
  "Take a 'traditional' MBQL query and convert it to a `:pipeline` query."
  [query]
  (condp = (:type query)
    :pipeline
    query

    :native
    (-> query
        (dissoc :native)
        (assoc :type   :pipeline
               :stages [(-> (:native query)
                            (assoc :lib/type :stage/native)
                            (set/rename-keys {:query :native}))]))

    :query
    (loop [acc [], inner-query (:query query)]
      (let [inner-query (assoc inner-query :lib/type (if (:native inner-query)
                                                       :stage/native
                                                       :stage/mbql))]
        (if (:source-query inner-query)
          (recur (cons (dissoc inner-query :source-query) acc)
                 (:source-query inner-query))
          (assoc (dissoc query :query)
                 :type :pipeline
                 :stages (vec (cons inner-query acc))))))))

(defn- positive-stage-index
  "If `stage` index is a negative number e.g. `-1` convert it to a positive index so we can use `nth` on `stages`. `-1`
  = the last stage, `-2` = the penultimate stage, etc."
  [stages stage]
  (let [stage' (if (neg? stage)
                 (+ (count stages) stage)
                 stage)]
    (when (or (> stage' (dec (count stages)))
              (neg? stage'))
      (throw (ex-info (i18n/tru "Stage {0} does not exist" stage)
                      {})))
    stage'))

(defn query-stage
  [outer-query stage]
  (let [{:keys [stages]} (pipeline outer-query)]
    (nth (vec stages) (positive-stage-index stages stage))))

(defn update-query-stage
  [query stage f & args]
  (let [{:keys [stages], :as query} (pipeline query)
        stage'                      (positive-stage-index stages stage)
        stages'                     (apply update (vec stages) stage' f args)]
    (assoc query :stages stages')))

(defn ensure-mbql-final-stage
  "Convert query to a `:pipeline` query, and make sure the final stage is an `:mbql` one."
  [query]
  (let [query (pipeline query)]
    (cond-> query
      (= (:lib/type (query-stage query -1)) :stage/native)
      (update :stages conj {:lib/type :stage/mbql}))))
