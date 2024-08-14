(ns metabase.lib.schema.ref-test
  (:require
   [clojure.test :refer [are deftest is testing]]
   [malli.core :as mc]
   [malli.error :as me]
   [metabase.lib.schema.expression :as expression]
   [metabase.lib.schema.ref]))

(comment metabase.lib.schema.ref/keep-me)

(deftest ^:parallel unknown-type-test
  (let [expr [:field {:lib/uuid "214211bc-9bc0-4025-afc5-2256a523bafe"} 1]]
    (is (= ::expression/type.unknown
           (expression/type-of expr)))
    (is (expression/type-of? expr :type/Boolean))
    (are [schema] (mc/validate schema expr)
      ::expression/boolean
      ::expression/expression)))

(deftest ^:parallel field-test
  (testing "Something that is not a :field should return a meaningful error\n"
    (are [arg error] (= error
                        (me/humanize (mc/explain :mbql.clause/field arg)))
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
      #?(:clj  [nil nil ["should be a positive int" "should be a string" "non-blank string"]]
         :cljs [nil nil ["should be a positive int" "should be a string"]])

      [:field {:lib/uuid "ede8dc3c-de7e-49ec-a78c-bacfb43f2301"} -1]
      #?(:clj  [nil nil ["should be a positive int" "should be a string" "non-blank string" "should be a positive int"]]
         :cljs [nil nil ["should be a positive int" "should be a string" "should be a positive int"]]))))
