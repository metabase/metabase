(ns metabase.test.util.q
  "See https://github.com/metabase/metabase-init/wiki/Q-Cheatsheet"
  (:refer-clojure :exclude [or and filter use = != < > <= >=])
  (:require [clojure.core :as core]
            [clojure.core.match :refer [match]]
            [metabase.db :as db]
            [metabase.driver :as driver]
            [metabase.test.data :as data]
            (metabase.test.data [datasets :as datasets]
                                dataset-definitions)
            [metabase.util :as u]))

;;; # HELPER FNs

;;; ## TOKEN SPLITTING

(def ^:private ^:const top-level-tokens
  '#{use of dataset return aggregate breakout fields filter limit order page})

(defn- qualify-token [token]
  (symbol (str "metabase.test.util.q/" token)))

(defn- qualify-form [[f & args]]
  `(~(qualify-token f) ~@args))

(defn- split-with-tokens [tokens args]
  (loop [acc [], current-group [], [arg & more] args]
    (cond
      (nil? arg)             (->> (conj acc (apply list current-group))
                                  (core/filter seq)
                                  (map qualify-form))
      (contains? tokens arg) (recur (conj acc (apply list current-group)) [arg] more)
      :else                  (recur acc (conj current-group arg) more))))


;;; ## ID LOOKUP

(def ^:dynamic *table-name* nil)

(defmacro field [f]
  (core/or
   (if-not (symbol? f) f
     (let [f (name f)]
       (u/cond-let
        ;; x->y <-> ["fk->" x y]
        [[_ from to] (re-matches #"^(.+)->(.+)$" f)]
        ["fk->" `(field ~(symbol from)) `(field ~(symbol to))]

        ;; x...y <-> ?
        [[_ f sub] (re-matches #"^(.+)\.\.\.(.+)$" f)]
        `(~@(macroexpand-1 `(field ~(symbol f))) ~(keyword sub))

        ;; ag.0 <-> ["aggregation" 0]
        [[_ ag-field-index] (re-matches #"^ag\.(\d+)$" f)]
        ["aggregation" (Integer/parseInt ag-field-index)]

        ;; table.field <-> (id table field)
        [[_ table field] (re-matches #"^([^\.]+)\.([^\.]+)$" f)]
        `(data/id ~(keyword table) ~(keyword field)))))

   ;; fallback : (id *table-name* field)
   `(data/id *table-name* ~(keyword f))))

(defn resolve-dataset [dataset]
  (var-get (core/or (resolve dataset)
                    (ns-resolve 'metabase.test.data.dataset-definitions dataset)
                    (throw (Exception. (format "Don't know how to find dataset '%s'." dataset))))))


;;; # DSL KEYWORD MACROS

;;; ## USE

(defmacro use [query db]
  (assoc-in query [:context :driver] (keyword db)))


;;; ## OF

(defmacro of [query table-name]
  (-> query
      (assoc-in [:query :source_table] `(data/id ~(keyword table-name)))
      (assoc-in [:context :table-name] (keyword table-name))))


;;; ## DATASET

(defmacro dataset [query dataset-name]
  (assoc-in query [:context :dataset] `'~dataset-name))


;;; ## RETURN

(defmacro return [query & args]
  (assoc-in query [:context :return] (vec (mapcat (fn [arg]
                                                    (cond
                                                      (core/= arg 'rows)      [:data :rows]
                                                      (core/= arg 'first-row) [:data :rows first]
                                                      :else                   [arg]))
                                                  args))))


;;; ## AGGREGATE

(defmacro aggregate [query & args]
  (assoc-in query [:query :aggregation] (match (vec args)
                                          ['rows]        ["rows"]
                                          ['count]       ["count"]
                                          ['count id]    ["count"    `(field ~id)]
                                          ['avg id]      ["avg"      `(field ~id)]
                                          ['distinct id] ["distinct" `(field ~id)]
                                          ['stddev id]   ["stddev"   `(field ~id)]
                                          ['sum id]      ["sum"      `(field ~id)]
                                          ['cum-sum id]  ["cum_sum"  `(field ~id)])))


;;; ## BREAKOUT

(defmacro breakout [query & fields]
  (assoc-in query [:query :breakout] (vec (for [field fields]
                                            `(field ~field)))))


;;; ## FIELDS

(defmacro fields [query & fields]
  (assoc-in query [:query :fields] (vec (for [field fields]
                                          `(field ~field)))))


;;; ## FILTER

(def ^:const ^:private filter-clause-tokens
  '#{inside not-null is-null between starts-with ends-with contains = != < > <= >=})

(defmacro and [& clauses]
  `["AND" ~@clauses])

(defmacro or [& clauses]
  `["OR" ~@clauses])

(defmacro inside [{:keys [lat lon]}]
  `["INSIDE" (field ~(:field lat)) (field ~(:field lon)) ~(:max lat) ~(:min lon) ~(:min lat) ~(:max lon)])

(defmacro not-null [field]
  `["NOT_NULL" (field ~field)])

(defmacro is-null [field]
  `["IS_NULL" (field ~field)])

(defmacro between [field min max]
  `["BETWEEN" (field ~field) ~min ~max])

(defmacro starts-with [field arg]
  `["STARTS_WITH" (field ~field) ~arg])

(defmacro ends-with [field arg]
  `["ENDS_WITH" (field ~field) ~arg])

(defmacro contains [field arg]
  `["CONTAINS" (field ~field) ~arg])

(defmacro = [field & args]
  `["=" (field ~field) ~@args])

(defmacro != [field & args]
  `["!=" (field ~field) ~@args])

(defmacro < [field arg]
  `["<" (field ~field) ~arg])

(defmacro <= [field arg]
  `["<=" (field ~field) ~arg])

(defmacro > [field arg]
  `[">" (field ~field) ~arg])

(defmacro >= [field arg]
  `[">=" (field ~field) ~arg])

(defn- filter-split [tokens]
  (->> (loop [clauses [], current-clause [], [token & more] tokens]
         (cond
           (nil? token)                           (conj clauses (apply list current-clause))
           (core/= token 'and)                    (conj clauses (apply list current-clause) `(and ~@(filter-split more)))
           (core/= token 'or)                     (conj clauses (apply list current-clause) `(or ~@(filter-split more)))
           (contains? filter-clause-tokens token) (recur (conj clauses (apply list current-clause))
                                                         [(qualify-token token)]
                                                         more)
           :else                                  (recur clauses
                                                         (conj current-clause token)
                                                         more)))
       (core/filter seq)))

(defmacro filter* [& args]
  (let [[filter-clause & more] (filter-split args)]
    `(~@filter-clause ~@more)))

(defmacro filter [query & args]
  (assoc-in query [:query :filter] `(filter* ~@args)))


;;; ## LIMIT

(defmacro limit [query limit]
  {:pre [(integer? limit)]}
  (assoc-in query [:query :limit] limit))


;;; ## ORDER

(defmacro order* [field-symb]
  (let [[_ field +-] (re-matches #"^(.+[^\-+])([\-+])?$" (name field-symb))]
    (assert field (format "Invalid field passed to order: '%s'" field-symb))
    [`(field ~(symbol field)) (case (keyword (core/or +- '+))
                                :+ "ascending"
                                :- "descending")]))

(defmacro order [query & fields]
  (assoc-in query [:query :order_by] (vec (for [field fields]
                                            `(order* ~field)))))


;;; ## PAGE

(defmacro page [query page items-symb items]
  (assert (and (integer? page)
               (core/= items-symb 'items)
               (integer? items))
    "page clause should be of the form page <page-num> items <items-per-page>")
  (assoc-in query [:query :page] {:page  page
                                  :items items}))


;;; # TOP-LEVEL MACRO IMPL

(defmacro with-temp-db [dataset query]
  (if-not dataset
    query
    `(data/with-temp-db [~'_ (resolve-dataset ~dataset)]
       ~query)))

(defmacro with-driver [driver query]
  (if-not driver
    query
    `(datasets/with-dataset ~driver
       ~query)))

(defmacro Q*** [f {:keys [driver dataset return table-name]} query]
  (assert table-name
    "Table name not specified in query, did you include an 'of' clause?")
  `(do (db/setup-db-if-needed)
       (->> (with-driver ~driver
              (binding [*table-name* ~table-name]
                (with-temp-db ~dataset
                  (~f ~query))))
            ~@return)))

(defmacro Q** [f q & [form & more]]
  (if-not form
    `(Q*** ~f ~(:context q) ~(dissoc q :context))
    `(Q** ~f ~(macroexpand `(-> ~q ~form)) ~@more)))

(defmacro Q* [f & args]
  `(Q** ~f
        {:database (data/db-id)
         :type     "query"
         :query    {}
         :context  {:driver  nil
                    :dataset nil}}
        ~@(split-with-tokens top-level-tokens args)))

(defmacro Q
  "Expand and run a query written with the `Q` shorthand DSL."
  [& args]
  `(Q* driver/process-query ~@args))

(defmacro Q-expand
  "Expand (without running) a query written with the `Q` shorthand DSL."
  [& args]
  `(Q* identity ~@args))
