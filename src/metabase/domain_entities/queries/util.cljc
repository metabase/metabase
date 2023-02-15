(ns metabase.domain-entities.queries.util
  "Utility functions used by the Queries in metabase-lib."
  (:require
   [metabase.domain-entities.malli :as de]))

(def Expression
  "Schema for an Expression that's part of a query filter."
  [:map])

(de/defn ^:export expressions-list :- [:vector [:map [:name string?] [:expression Expression]]]
  "Turns a map of expressions by name into a list of `{:name name :expression expression}` objects."
  [expressions :- [:map-of string? Expression]]
  (mapv (fn [[name expr]] {:name name :expression expr}) expressions))

(defn- unique-name [names original-name index]
  (let [indexed-name (str original-name " (" index ")")]
    (if (names indexed-name)
      (recur names original-name (inc index))
      indexed-name)))

(de/defn ^:export unique-expression-name :- string?
  "Generates an expression name that's unique in the given map of expressions."
  [expressions   :- [:map-of string? (de/opaque Expression)]
   original-name :- string?]
  (let [expression-names (set (keys expressions))]
    (if (not (expression-names original-name))
      original-name
      (let [re-duplicates (re-pattern (str "^" original-name " \\([0-9]+\\)$"))
            duplicates    (set (filter #(or (= % original-name)
                                            (re-matches re-duplicates %))
                                       expression-names))]
        (unique-name duplicates original-name (count duplicates))))))
