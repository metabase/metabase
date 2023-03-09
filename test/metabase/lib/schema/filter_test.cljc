(ns metabase.lib.schema.filter-test
  (:require
   [clojure.test :refer [are deftest is testing]]
   [clojure.walk :as walk]
   [malli.core :as mc]
   [metabase.lib.schema.expression :as expression]
   [metabase.lib.schema.filter]))

(comment metabase.lib.schema.filter/keep-me)

(defn- case-expr [& args]
  (let [clause [:case
                {:lib/uuid (str (random-uuid))}
                (mapv (fn [arg]
                        [[:= {:lib/uuid (str (random-uuid))} 1 1]
                         arg])
                      args)]]
    (is (mc/validate :mbql.clause/case clause))
    clause))

(deftest ^:parallel case-type-of-test
  (are [expr expected] (= expected
                          (expression/type-of expr))
    ;; easy, no ambiguity
    (case-expr 1 1)
    :type/Integer

    ;; Ambiguous literal types
    (case-expr "2023-03-08")
    #{:type/Text :type/Date}

    (case-expr "2023-03-08" "2023-03-08")
    #{:type/Text :type/Date}

    ;; Ambiguous literal types mixed with unambiguous types
    (case-expr "2023-03-08" "abc")
    :type/Text

    ;; Literal types that are ambiguous in different ways! `:type/Text` is the only common type between them!
    (case-expr "2023-03-08" "05:13")
    :type/Text

    ;; Confusion! The "2023-03-08T06:15" is #{:type/String :type/DateTime}, which is less specific than
    ;; `:type/DateTimeWithLocalTZ`. Technically this should return `:type/DateTime`, since it's the most-specific
    ;; common ancestor type compatible with all args! But calculating that stuff is way too hard! So this will have to
    ;; do for now! -- Cam
    (case-expr "2023-03-08T06:15" [:field 1 {:base-type :type/DateTimeWithLocalTZ}])
    :type/DateTimeWithLocalTZ

    ;; Differing types with a common base type that is more specific than `:type/*`
    (case-expr 1 1.1)
    :type/Number))

(defn- ensure-uuids [filter-expr]
  (walk/postwalk
   (fn [f]
     (if (and (vector? f) (not (map-entry? f)))
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
    (let [field [:field 1 {:lib/uuid (str (random-uuid))}]
          boolean-field [:field 2 {:lib/uuid (str (random-uuid))
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
           [:case [[:= 1 1] true
                   [:not-null field] [:< 0 1]]]]]
      (doseq [op (filter-ops filter-expr)]
        (testing (str op " is a registered MBQL clause (a type-of* method is registered for it)")
          (is (not (identical? (get-method expression/type-of* op)
                               (get-method expression/type-of* :default))))))
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
