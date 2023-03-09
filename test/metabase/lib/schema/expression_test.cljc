(ns metabase.lib.schema.expression-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [clojure.walk :as walk]
   [malli.core :as mc]
   [malli.generator :as mg]
   malli.registry
   [metabase.lib.schema.expression :as expression]
   [metabase.lib.schema.literal :as literal]
   #_[metabase.util.malli.registry :as mr]))

(defn- ensure-uuids [expression]
  (walk/postwalk
   (fn [f]
     (if (and (vector? f) (not (map-entry? f)))
       (let [[op & args] f]
         (cond
           (and (map? (first args)) (not (:lib/uuid (first args))))
           (assoc-in f [1 :lib/uuid] (random-uuid))

           (not-any? #(and (map? %) (:lib/uuid %)) args)
           (into [op {:lib/uuid (random-uuid)}] args)

           :else f))
       f))
   expression))

;; TODO better way to define clauses?
#_
(defn- known-expression-ops
  "Return all registered expression operators."
  []
  (into #{}
        (comp (filter #(and (qualified-keyword? %)
                            (not= % ::expression/expression)
                            (= (namespace %) (namespace ::expression/expression))))
              (map (comp keyword name)))
        (keys (malli.registry/schemas @#'mr/registry))))

#_
(defn- ops
  "Return the set of operators in `expressions`."
  [expressions]
  (set (remove #{:field} (map first expressions))))

(deftest ^:parallel filter-test
  (testing "valid expressions"
    (let [boolean-field [:field 2 {:lib/uuid (random-uuid)
                                   :base-type :type/Boolean}]
          number-field [:field 3 {:lib/uuid (random-uuid)
                                  :base-type :type/Integer}]
          string-field [:field 4 {:lib/uuid (random-uuid)
                                  :base-type :type/Text}]
          dt-field [:field 5 {:lib/uuid (random-uuid)
                              :base-type :type/Text}]
          replace-field-with-literal #(walk/postwalk (fn [n]
                                                       (condp = n
                                                         boolean-field (mg/generate ::literal/boolean)
                                                         string-field (mg/generate ::literal/string)
                                                         number-field (mg/generate ::literal/integer)
                                                         dt-field (mg/generate ::literal/temporal)
                                                         n))
                                                     %)
          all-expressions [[:abs number-field]
                           [:ceil number-field]
                           [:floor number-field]
                           [:log number-field]
                           [:round number-field]
                           [:power number-field number-field]
                           [:sqrt number-field]
                           [:exp number-field]
                           [:trim string-field]
                           [:ltrim string-field]
                           [:rtrim string-field]
                           [:upper string-field]
                           [:lower string-field]
                           [:length string-field]
                           [:get-year dt-field]
                           [:get-month dt-field]
                           [:get-day dt-field]
                           [:get-hour dt-field]
                           [:get-minute dt-field]
                           [:get-second dt-field]
                           [:get-quarter dt-field]
                           [:datetime-add dt-field number-field "month"]
                           [:datetime-subtract dt-field number-field "year"]
                           [:datetime-diff dt-field dt-field "month"]
                           [:get-week dt-field nil]
                           [:regexextract string-field string-field]
                           [:replace string-field string-field string-field]
                           [:substring string-field number-field number-field]
                           [:case boolean-field string-field boolean-field string-field]
                           [:coalesce string-field string-field]
                           [:concat string-field string-field]
                           [:convert-timezone dt-field "US/Pacific" "US/Eastern"]
                           boolean-field
                           string-field
                           number-field
                           dt-field]]
      ;; TODO better way to define clauses?
      #_
      (is (= (disj (known-expression-ops)
                   ;; Remove base types
                   :number :string :floating-point :integer :boolean :temporal :orderable :equality-comparable)
             (ops all-expressions)))
      (doseq [expression all-expressions]
        (is (mc/validate ::expression/expression (ensure-uuids expression)))
        (is (mc/validate ::expression/expression (ensure-uuids (replace-field-with-literal expression)))))))

  (testing "invalid filter"
    (is (false? (mc/validate
                  ::expression/expression
                  (ensure-uuids [:xor 13 [:field 1 {:lib/uuid (random-uuid)}]]))))))
