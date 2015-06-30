(ns metabase.test.util.mql
  "DSL for writing metabase QL queries."
  (:require [clojure.core.match :refer [match]]
            [clojure.tools.macro :refer :all]
            [clojure.walk :refer [macroexpand-all]]
            [metabase.driver :as driver]
            [metabase.test.data :as data]
            [metabase.test.data.datasets :as datasets]))

(defn- partition-tokens [keywords tokens]
  (->> (loop [all [], current-split nil, [token & more] tokens]
         (cond
           (not token)                (conj all current-split)
           (contains? keywords token) (recur (or (when (seq current-split)
                                                   (conj all current-split))
                                                 all)
                                             [token]
                                             more)
           :else                      (recur all
                                             (conj current-split token)
                                             more)))
       (map seq)
       (filter identity)))

(def ^:private ^:const outer-q-tokens '#{with run return})
(def ^:private ^:const inner-q-tokens '#{ag breakout fields filter lim order page tbl})

(defmacro Q:temp-get [& args]
  `(:id (data/-temp-get ~'db ~@(map name args))))

(defn Q:resolve-dataset [^clojure.lang.Symbol dataset]
  (require 'metabase.test.data.dataset-definitions)
  (var-get (ns-resolve 'metabase.test.data.dataset-definitions dataset)))

(defmacro Q:with-temp-db [dataset body]
  `(data/with-temp-db [~'db (data/dataset-loader) (Q:resolve-dataset '~dataset)]
     (symbol-macrolet [~'db-id (:id ~'db)]
       (macrolet [(~'id [& args#] `(Q:temp-get ~@args#))]
         ~(macroexpand-all body)))))

(defmacro Q:with [query arg & [arg2 :as more]]
  (case (keyword arg)
    :db       `(Q:with-temp-db ~arg2
                 ~query)
    :dataset  `(datasets/with-dataset ~(keyword arg2)
                 ~query)
    :datasets `(do ~@(for [dataset# more]
                       `(datasets/with-dataset ~(keyword dataset#)
                          ~query)))))

(defmacro Q:return [q & args]
  `(-> ~q ~@args))

(defmacro Q:expand-outer [token form]
  (macroexpand-all `(symbol-macrolet [~'return Q:return
                                      ~'run    driver/process-query
                                      ~'with   Q:with]
                      (-> ~form ~token))))

(defmacro Q:expand-outer* [[token & tokens] form]
  (if-not token form
          `(Q:expand-outer* ~tokens (Q:expand-outer ~token ~form))))

(defmacro Q:expand-inner [& forms]
  {:database 'db-id
   :type :query
   :query `(Q:expand-clauses {} ~@forms)})

(defmacro Q:wrap-fallback-captures [form]
  `(symbol-macrolet [~'db-id (data/db-id)
                     ~'id data/id]
     ~(macroexpand-all form)))

(defmacro Q:field [f]
  (or (when (symbol? f)
        (let [f (name f)]
          (if-let [[_ from to] (re-matches #"^(.*)->(.*)$" f)]
            ["fk->" `(Q:field ~(symbol from)) `(Q:field ~(symbol to))]
            (if-let [[_ ag-field-index] (re-matches #"^ag\.(\d+)$" f)]
              ["aggregation" (Integer/parseInt ag-field-index)]
              (when-let [[_ table field] (re-matches #"^(?:([^\.]+)\.)?([^\.]+)$" f)]
                `(~'id ~(if table (keyword table)
                            'table)
                       ~(keyword field)))))))
      f))

(defmacro Q [& tokens]
  (let [[outer-tokens inner-tokens] (split-with (complement (partial contains? inner-q-tokens)) tokens)
        outer-tokens                (partition-tokens outer-q-tokens outer-tokens)
        inner-tokens                (partition-tokens inner-q-tokens inner-tokens)
        query                       (macroexpand-all `(Q:expand-inner ~@inner-tokens))]
    `(Q:wrap-fallback-captures (Q:expand-outer* ~outer-tokens
                                                (symbol-macrolet [~'table ~(second (:source_table (:query query)))
                                                                  ~'fl Q:field]
                                                  ~(macroexpand-all query))))))

(defmacro Q:expand-clauses [acc & [[clause & args] & more]]
  (if-not clause acc
          `(Q:expand-clauses ~(macroexpand-all `(~(symbol (format "metabase.test.util.mql/Q:%s" clause)) ~acc ~@args)) ~@more)))


;; ## ag

(defmacro Q:ag [query & tokens]
  (assoc query :aggregation (match (vec tokens)
                              ['rows]        ["rows"]
                              ['count]       ["count"]
                              ['count id]    ["count" `(~'fl ~id)]
                              ['avg id]      ["avg" `(~'fl ~id)]
                              ['distinct id] ["distinct" `(~'fl ~id)]
                              ['stddev id]   ["stddev" `(~'fl ~id)]
                              ['sum id]      ["sum" `(~'fl ~id)]
                              ['cum-sum id]  ["cum_sum" `(~'fl ~id)])))


;; ## breakout

(defmacro Q:breakout [query & fields]
  (assoc query :breakout (vec (for [field fields]
                                `(~'fl ~field)))))


;; ## fields

(defmacro Q:fields [query & fields]
  (assoc query :fields (vec (for [field fields]
                              `(~'fl ~field)))))


;; ## filter

(def ^:private ^:const filter-tokens
  '#{inside not-null is-null between = != < > <= >=})

(defmacro Q:filter [query & tokens]
  (assoc query :filter `(Q:filter* ~tokens)))

(defmacro Q:filter* [[subclause & [arg arg2 :as args]]]
  (case (keyword subclause)
    :and      `["AND" ~@(for [cl (partition-tokens filter-tokens args)]
                          `(Q:filter* ~cl))]
    :or       `["OR"  ~@(for [cl (partition-tokens filter-tokens args)]
                          `(Q:filter* ~cl))]
    :inside   (let [{:keys [lat lon]} arg]
                ["INSIDE" `(~'fl ~(:field lat)) `(~'fl ~(:field lon)) (:max lat) (:min lon) (:min lat) (:max lon)])
    :not-null ["NOT_NULL" `(~'fl ~arg)]
    :is-null  ["IS_NULL" `(~'fl ~arg)]
    :between  (let [[id min max] args]
                ["BETWEEN" `(~'fl ~id) ~min ~max])
    :=        ["="  `(~'fl ~arg) arg2]
    :!=       ["!=" `(~'fl ~arg) arg2]
    :<        ["<"  `(~'fl ~arg) arg2]
    :>        [">"  `(~'fl ~arg) arg2]
    :<=       ["<=" `(~'fl ~arg) arg2]
    :>=       [">=" `(~'fl ~arg) arg2]))


;; ## lim

(defmacro Q:lim [query lim]
  (assoc query :limit lim))

;; ## order
(defmacro Q:order [query & fields]
  (assoc query :order_by (vec (for [field fields]
                                `(Q:order* ~field)))))

(defmacro Q:order* [field]
  (let [[_ field +-] (re-matches #"^([^\-+]+)([\-+])?$" (name field))]
    [`(~'fl ~(symbol field)) (case (keyword (or +- '+))
                               :+ "ascending"
                               :- "descending")]))

;; ## page
(defmacro Q:page [query page items]
  (assoc query :page {:page page
                      :items items}))


;; ## tbl

(defmacro Q:tbl [query table]
  (assoc query :source_table `(~'id ~(keyword table))))
