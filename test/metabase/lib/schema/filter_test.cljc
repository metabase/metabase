(ns metabase.lib.schema.filter-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [clojure.walk :as walk]
   [malli.core :as mc]
   malli.registry
   [metabase.lib.core :as lib]
   ;; expression and filter recursively depend on each other
   metabase.lib.schema.expression
   [metabase.lib.schema.filter :as filter]))

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

(def filter-creation-function
  "Map filter clause types to the corresponding creation function.
  To be extended whenever a new filter clause type is defined."
  {:and              lib/and
   :or               lib/or
   :not              lib/not
   :=                lib/=
   :!=               lib/!=
   :<                lib/<
   :<=               lib/<=
   :>                lib/>
   :>=               lib/>=
   :between          lib/between
   :inside           lib/inside
   :is-null          lib/is-null
   :not-null         lib/not-null
   :is-empty         lib/is-empty
   :not-empty        lib/not-empty
   :starts-with      lib/starts-with
   :ends-with        lib/ends-with
   :contains         lib/contains
   :does-not-contain lib/does-not-contain
   :time-interval    lib/time-interval
   :segment          lib/segment
   :case             lib/case})

(defn- known-filter-ops
  "Return all registered filter operators."
  []
  (set (keys filter-creation-function)))

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
    (let [field         [:field {:lib/uuid (random-uuid)} 1]
          boolean-field [:field
                         {:lib/uuid  (random-uuid)
                          :base-type :type/Boolean}
                         2]
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
      ;; testing all the subclauses of `filter-expr` above individually. If something gets broken this is easier to debug
      (doseq [filter-clause (rest filter-expr)
              :let          [filter-clause (ensure-uuids filter-clause)]]
        (testing (list `mc/validate ::filter/filter filter-clause)
          (is (mc/validate ::filter/filter filter-clause))))
      ;; now test the entire thing
      (is (mc/validate ::filter/filter (ensure-uuids filter-expr)))))

  (testing "invalid filter"
    (is (false? (mc/validate
                 ::filter/filter
                 (ensure-uuids [:xor 13 [:field {:lib/uuid (random-uuid)} 1]]))))))
