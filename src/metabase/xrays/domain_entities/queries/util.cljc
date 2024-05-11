(ns metabase.xrays.domain-entities.queries.util
  "Utility functions used by the Queries in metabase-lib."
  (:require
   [metabase.util.malli :as mu]
   #?@(:cljs ([metabase.xrays.domain-entities.converters :as converters]))))

(def Expression
  "Schema for an Expression that's part of a query filter."
  :any)

(def ExpressionMap
  "Malli schema for a map of expressions by name."
  [:map-of string? Expression])

(def ExpressionList
  "Malli schema for a list of {:name :expression} maps."
  [:vector [:map [:name string?] [:expression Expression]]])

(def ^:private ->expression-map
  #?(:cljs (converters/incoming ExpressionMap)
     :clj  identity))

(def ^:private expression-list->
  #?(:cljs (converters/outgoing ExpressionList)
     :clj  identity))

(mu/defn ^:export expressions-list :- ExpressionList
  "Turns a map of expressions by name into a list of `{:name name :expression expression}` objects."
  [expressions :- ExpressionMap]
  (->> expressions
       ->expression-map
       (mapv (fn [[name expr]] {:name name :expression expr}))
       expression-list->))

(defn- unique-name [names original-name index]
  (let [indexed-name (str original-name " (" index ")")]
    (if (names indexed-name)
      (recur names original-name (inc index))
      indexed-name)))

(mu/defn ^:export unique-expression-name :- string?
  "Generates an expression name that's unique in the given map of expressions."
  [expressions   :- ExpressionMap
   original-name :- string?]
  (let [expression-names (-> expressions ->expression-map keys set)]
    (if (not (expression-names original-name))
      original-name
      (let [re-duplicates (re-pattern (str "^" original-name " \\([0-9]+\\)$"))
            duplicates    (set (filter #(or (= % original-name)
                                            (re-matches re-duplicates %))
                                       expression-names))]
        (unique-name duplicates original-name (count duplicates))))))
