(ns metabase.lib.schema.filter-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [clojure.walk :as walk]
   [malli.core :as mc]
   malli.registry
   ;; expression and filter recursively depend on each other
   metabase.lib.schema.expression
   [metabase.lib.schema.filter :as filter]
   [metabase.util.malli.registry :as mr]))

(defn- ensure-uuids [filter-expr]
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
   filter-expr))

(defn- known-filter-ops
  "Return all registered filter operators."
  []
  (into #{}
        (comp (filter #(and (qualified-keyword? %)
                            (not= % ::filter/filter)
                            (= (namespace %) (namespace ::filter/filter))))
              (map (comp keyword name)))
        (keys (malli.registry/schemas @#'mr/registry))))

(defn- filter-ops
  "Return the set of filter operators in `filter-expr`."
  [filter-expr]
  (loop [stack [filter-expr] ops #{}]
    (if (seq stack)
      (let [top (peek stack)
            others (pop stack)]
        (if (and (vector? top)
                 (keyword? (first top))
                 (not (#{:field} (first top))))
          (recur (into others (rest top)) (conj ops (first top)))
          (recur others ops)))
      ops)))

(deftest ^:parallel filter-test
  (testing "valid filters"
    (let [field [:field 1 {:lib/uuid (random-uuid)}]
          boolean-field [:field 2 {:lib/uuid (random-uuid)
                                   :base-type :type/Boolean}]
          filter-expr
          [:and
           boolean-field
           [:not [:!= "a" nil]]
           [:or
            [:inside 2.0 13.4 34 0 1.0 55]
            [:between 3 -3 42]
            [:= true false [:< 13 42] [:<= 33.0 2] [:> 13 42] [:>= 33.0 2]]]
           [:is-empty field]
           [:is-null field]
           [:not-empty field]
           [:not-null field]
           [:starts-with "abc" "a"]
           [:starts-with {:case-sensitive false} "abc" "a"]
           [:ends-with "abc" "a"]
           [:ends-with {:case-sensitive true} "abc" "a"]
           [:contains "abc" "a"]
           [:contains {:case-sensitive false} "abc" "a"]
           [:does-not-contain "abc" "a"]
           [:does-not-contain {:case-sensitive false} "abc" "a"]
           [:time-interval field :last :hour]
           [:time-interval field 4 :hour]
           [:time-interval {:include-current true} field :next :default]
           [:segment 1]
           [:segment "segment-id"]
           [:case [:= 1 1] true [:not-null field] [:< 0 1]]]]
      (is (= (known-filter-ops) (filter-ops filter-expr)))
      (is (true? (mc/validate ::filter/filter (ensure-uuids filter-expr))))))

  (testing "invalid filter"
    (is (false? (mc/validate
                 ::filter/filter
                 (ensure-uuids [:xor 13 [:field 1 {:lib/uuid (random-uuid)}]]))))))
