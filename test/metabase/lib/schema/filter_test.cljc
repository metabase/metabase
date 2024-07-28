(ns metabase.lib.schema.filter-test
  (:require
   [clojure.test :refer [are deftest is testing]]
   [clojure.walk :as walk]
   [malli.core :as mc]
   [malli.error :as me]
   [metabase.lib.schema]
   [metabase.lib.schema.expression :as expression]))

(comment metabase.lib.schema/keep-me)

(defn- ensure-uuids [filter-expr]
  (walk/postwalk
   (fn [f]
     (if (and (vector? f)
              (keyword? (first f))
              (not (map-entry? f)))
       (let [[op & args] f]
         (cond
           (and (map? (first args)) (not (:lib/uuid (first args))))
           (assoc-in f [1 :lib/uuid] (str (random-uuid)))

           (not-any? #(and (map? %) (:lib/uuid %)) args)
           (into [op {:lib/uuid (str (random-uuid))}] args)

           :else f))
       f))
   filter-expr))

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
    (let [field         [:field {:lib/uuid (str (random-uuid))} 1]
          boolean-field [:field
                         {:lib/uuid  (str (random-uuid))
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
           [:time-interval {:include-current true} field :next :day]
           [:relative-time-interval field 10 :day 10 :day]
           [:segment 1]]]
      (doseq [op (filter-ops filter-expr)]
          (is (not (identical? (get-method expression/type-of-method op)
        (testing (str op " is a registered MBQL clause (a type-of-method method is registered for it)")
                               (get-method expression/type-of-method :default))))))
      ;; test all the subclauses of `filter-expr` above individually. If something gets broken this is easier to debug
      (doseq [filter-clause (rest filter-expr)
              :let          [filter-clause (ensure-uuids filter-clause)]]
        (testing (pr-str filter-clause)
          (is (= (expression/type-of filter-clause) :type/Boolean))
          (is (not (me/humanize (mc/explain ::expression/boolean filter-clause))))))
      ;; now test the entire thing
      (is (mc/validate ::expression/boolean (ensure-uuids filter-expr))))))

(deftest ^:parallel invalid-filter-test
  (testing "invalid filters"
    (are [clause] (mc/explain
                   ::expression/boolean
                   (ensure-uuids clause))
      ;; xor doesn't exist
      [:xor 13 [:field 1 {:lib/uuid (str (random-uuid))}]]
      ;; 1 is not a valid <string> arg
      [:contains "abc" 1])))

(deftest ^:parallel mongo-types-test
  (testing ":type/MongoBSONID"
    (let [bson-field [:field {:base-type :type/MongoBSONID :effective-type :type/MongoBSONID} 1]]
      (testing "is comparable"
        (is (mc/validate ::expression/boolean (ensure-uuids [:= {} bson-field "abc"]))))
      (testing "is empty"
        (is (mc/validate ::expression/boolean (ensure-uuids [:is-empty {} bson-field]))))
      (testing "not empty"
        (is (mc/validate ::expression/boolean (ensure-uuids [:not-empty {} bson-field]))))))
  (testing ":type/Array"
    (let [bson-field [:field {:base-type :type/Array :effective-type :type/Array} 1]]
      (testing "is comparable"
        (is (mc/validate ::expression/boolean (ensure-uuids [:= {} bson-field "abc"])))))))
