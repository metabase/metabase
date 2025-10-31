(ns metabase.lib.schema.ref-test
  (:require
   [clojure.test :refer [are deftest is testing]]
   [malli.error :as me]
   [metabase.lib.core :as lib]
   [metabase.lib.schema.expression :as expression]
   [metabase.lib.schema.ref :as lib.schema.ref]
   [metabase.util.malli.registry :as mr]))

(deftest ^:parallel unknown-type-test
  (let [expr [:field {:lib/uuid "214211bc-9bc0-4025-afc5-2256a523bafe"} 1]]
    (is (= ::expression/type.unknown
           (expression/type-of expr)))
    (is (expression/type-of? expr :type/Boolean))
    (are [schema] (mr/validate schema expr)
      ::expression/boolean
      ::expression/expression)))

(deftest ^:parallel field-test
  (testing "Something that is not a :field should return a meaningful error\n"
    (are [arg error] (= error
                        (me/humanize (mr/explain :mbql.clause/field arg)))
      {:lib/type :mbql/join}
      ["invalid type" "Invalid :field clause ID or name: must be a string or integer"]

      [:field {} 1]
      [nil {:lib/uuid ["missing required key" "missing required key"]}]

      [:field {:lib/uuid "ede8dc3c-de7e-49ec-a78c-bacfb43f2301"} 1]
      nil

      ;; these error messages are a little wack but at least they sort of tell you what the problem is.
      ;;
      ;; I don't know why the Cljs versions give us slightly different answers, but I think that's an upstream Malli
      ;; problem, so I'm not going to spend too much time digging in to it. Close enough.
      [:field {:lib/uuid "ede8dc3c-de7e-49ec-a78c-bacfb43f2301"} :1]
      #?(:clj  [nil nil ["should be a positive int" "should be a string"]]
         :cljs [nil nil ["should be a positive int" "should be a string"]])

      [:field {:lib/uuid "ede8dc3c-de7e-49ec-a78c-bacfb43f2301"} -1]
      #?(:clj  [nil nil ["should be a positive int" "should be a string" "should be a positive int"]]
         :cljs [nil nil ["should be a positive int" "should be a string" "should be a positive int"]]))))

(deftest ^:parallel field-with-empty-name-test
  (testing "We need to support fields with empty names, this is legal in SQL Server (QUE-1418)"
    ;; we should support field names with only whitespace as well.
    (doseq [field-name [""
                        " "]
            :let [field-ref [:field {:lib/uuid "00000000-0000-0000-0000-000000000000", :base-type :type/Text} field-name]]]
      (testing (pr-str field-ref)
        (are [schema] (not (me/humanize (mr/explain schema field-ref)))
          :mbql.clause/field
          ::lib.schema.ref/ref)))))

(deftest ^:parallel normalize-original-binning-test
  (is (= [:field
          {:base-type            :type/Float
           :effective-type       :type/Float
           :lib/original-binning {:num-bins 50, :strategy :num-bins}
           :lib/uuid             "d01f4c83-0fe5-4329-80f3-2bbea1f27c3b"}
          "TOTAL_2"]
         (lib/normalize ["field"
                         {"base-type"            "type/Float"
                          "lib/uuid"             "d01f4c83-0fe5-4329-80f3-2bbea1f27c3b"
                          "effective-type"       "type/Float"
                          "lib/original-binning" {"strategy" "num-bins", "num-bins" 50}}
                         "TOTAL_2"]))))

(deftest ^:parallel normalize-field-ref-remove-nil-values-test
  (is (= [:field {:lib/uuid "d01f4c83-0fe5-4329-80f3-2bbea1f27c3b"} 100]
         (lib/normalize ["field" {"temporal-unit" nil, "lib/uuid" "d01f4c83-0fe5-4329-80f3-2bbea1f27c3b"} 100]))))
