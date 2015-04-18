(ns metabase.driver.query-processor
  (:require [clojure.set :as set]
            [colorize.core :as color]))

(declare add-implicit-breakout-order-by
         preprocess-structured
         remove-empty-clauses)

(def ^:dynamic *query* "The structured query we're currently processing, before any preprocessing occurs (i.e. the `:query` part of the API call body)"
  nil)

(defn preprocess [{query-type :type :as query}]
  (case (keyword query-type)
    :query (preprocess-structured query)
    :native query))

(defn preprocess-structured [query]
  (assert *query* "Make sure to bind *query* in driver/process-and-run BEFORE you call preprocess <3")
  (let [query (update-in query [:query] #(->> %
                                              remove-empty-clauses
                                              add-implicit-breakout-order-by))]
    (println (color/cyan "\n******************** Preprocessing emitted this query: ********************\n" ; TODO - log/debug
                         (with-out-str (clojure.pprint/pprint query))
                         "**************************************************************************\n"))
    query))


;; ## PREPROCESSOR FNS

;; ### REMOVE-EMPTY-CLAUSES
(def ^:const clause->empty-forms
  "Clause values that should be considered empty and removed during preprocessing."
  {:breakout #{[nil]}
   :filter #{[nil nil]}})

(defn remove-empty-clauses
  "Remove all QP clauses whose value is:

   1.  is `nil`
   2.  is an empty sequence (e.g. `[]`)
   3.  matches a form in `clause->empty-forms`"
  [query]
  (->> query
       (map (fn [[clause clause-value]]
              (when (and clause-value
                         (or (not (sequential? clause-value))
                             (seq clause-value)))
                (when-not (contains? (clause->empty-forms clause) clause-value)
                  [clause clause-value]))))
       (into {})))


;; ### ADD-IMPLICIT-BREAKOUT-ORDER-BY

(defn add-implicit-breakout-order-by
  "Field IDs specified in `breakout` should add an implicit ascending `order_by` subclause *unless* that field is *explicitly* referenced in `order_by`."
  [{breakout-field-ids :breakout order-by-subclauses :order_by :as query}]
  (let [order-by-field-ids (set (map first order-by-subclauses))
        implicit-breakout-order-by-field-ids (set/difference (set breakout-field-ids) order-by-field-ids)]
    (if-not (seq implicit-breakout-order-by-field-ids) query
            (->> implicit-breakout-order-by-field-ids
                 (map (fn [field-id]
                        [field-id "ascending"]))
                 (apply conj (or order-by-subclauses []))
                 (assoc query :order_by)))))
