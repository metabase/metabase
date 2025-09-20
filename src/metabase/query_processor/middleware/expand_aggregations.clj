(ns metabase.query-processor.middleware.expand-aggregations
  (:refer-clojure :exclude [select-keys])
  (:require
   [medley.core :as m]
   [metabase.lib.options :as lib.options]
   [metabase.lib.util :as lib.util]
   [metabase.lib.walk :as lib.walk]
   [metabase.util.performance :refer [select-keys]]))

(defn- expand-aggregation-ref
  [aggregation-ref aggregation]
  (let [name-opts  (-> aggregation-ref lib.options/options (select-keys [:name :display-name]))]
    (-> aggregation
        (lib.options/update-options merge name-opts)
        lib.util/fresh-uuids)))

(defn- unroll-form
  [form aggregations expanded expanding]
  (cond
    (lib.util/clause-of-type? form :aggregation)
    (let [ref (get form 2)
          expansion (get expanded ref)
          definition (get aggregations ref)]
      (cond
        expansion       [(expand-aggregation-ref form expansion) expanded]
        (expanding ref) (throw (ex-info "cyclic aggregation definition" {:aggregations aggregations
                                                                         :cycle-nodes expanding}))
        definition      (let [[expansion expanded] (unroll-form definition aggregations expanded (conj expanding ref))]
                          [(expand-aggregation-ref form expansion) (assoc expanded ref expansion)])
        :else           (throw (ex-info "dangling aggregation reference" {:aggregations aggregations
                                                                          :reference ref}))))

    (vector? form)
    (reduce (fn [[expansions expanded] form]
              (let [[expansion expanded] (unroll-form form aggregations expanded expanding)]
                [(conj expansions expansion) expanded]))
            [[] expanded]
            form)

    :else
    [form expanded]))

(defn- unroll-aggregations
  [aggregation-list]
  (let [indexed (m/index-by lib.options/uuid aggregation-list)]
    (first (unroll-form (vec aggregation-list) indexed {} #{}))))

(defn expand-aggregations
  "Recursively replace aggregation references in the aggregation clause with their definitions."
  [query]
  (lib.walk/walk-stages query (fn [_query _path stage]
                                (m/update-existing stage :aggregation unroll-aggregations))))
