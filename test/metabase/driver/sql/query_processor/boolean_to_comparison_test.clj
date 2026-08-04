(ns metabase.driver.sql.query-processor.boolean-to-comparison-test
  (:require
   [clojure.test :refer :all]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.driver.sql.query-processor.boolean-to-comparison :as sql.qp.boolean-to-comparison]
   [metabase.lib.options :as lib.options]))

(def ^:private test-uuid "de118d20-72f4-4736-b331-04ee72135ff5")

(def ^:private true-value  [:value {:lib/uuid test-uuid, :base-type :type/Boolean} true])
(def ^:private false-value [:value {:lib/uuid test-uuid, :base-type :type/Boolean} false])
(def ^:private int-value   [:value {:lib/uuid test-uuid, :base-type :type/Integer} 1])

(defn- named-expression [expression-name clause]
  (lib.options/update-options clause assoc :lib/expression-name expression-name))

(def ^:private inner-query
  {:expressions [(named-expression "T" true-value)
                 (named-expression "F" false-value)
                 (named-expression "I" int-value)]})

(deftest ^:parallel boolean->comparison-test
  (binding [sql.qp/*inner-query* inner-query]
    (are [clause] (= [:= {} clause true]
                     (sql.qp.boolean-to-comparison/boolean->comparison clause))
      false
      true
      true-value
      false-value
      [:value {:lib/uuid test-uuid} true]
      [:expression {:lib/uuid test-uuid} "T"]
      [:expression {:lib/uuid test-uuid} "F"]
      [:field {:lib/uuid test-uuid, :base-type :type/Boolean} "some-bool"]
      [:field {:lib/uuid test-uuid, :base-type :type/Boolean} 123])))

(deftest ^:parallel non-boolean->comparison-test
  (binding [sql.qp/*inner-query* inner-query]
    (are [clause] (= clause
                     (sql.qp.boolean-to-comparison/boolean->comparison clause))
      0
      1
      "not a boolean"
      [:value {:lib/uuid test-uuid} 1]
      [:expression {:lib/uuid test-uuid} "I"]
      [:field {:lib/uuid test-uuid, :base-type :type/Integer} "some-int"]
      [:field {:lib/uuid test-uuid, :base-type :type/Integer} 123])))

(deftest ^:parallel boolean-expression-clause?-test
  (binding [sql.qp/*inner-query* inner-query]
    (are [clause] (sql.qp.boolean-to-comparison/boolean-expression-clause? clause)
      [:expression {:lib/uuid test-uuid} "T"]
      [:expression {:lib/uuid test-uuid} "F"])))

(deftest ^:parallel non-boolean-expression-clause?-test
  (binding [sql.qp/*inner-query* inner-query]
    (are [clause] (not (sql.qp.boolean-to-comparison/boolean-expression-clause? clause))
      0
      1
      "not a boolean"
      [:value {:lib/uuid test-uuid} 1]
      [:expression {:lib/uuid test-uuid} "I"]
      [:field {:lib/uuid test-uuid, :base-type :type/Integer} "some-int"]
      [:field {:lib/uuid test-uuid, :base-type :type/Boolean} "some-bool"]
      [:field {:lib/uuid test-uuid, :base-type :type/Integer} 123]
      [:field {:lib/uuid test-uuid, :base-type :type/Boolean} 234])))

(deftest ^:parallel case-boolean->comparison
  (binding [sql.qp/*inner-query* inner-query]
    (are [clause expected] (= expected
                              (sql.qp.boolean-to-comparison/case-boolean->comparison clause))
      [:case {:lib/uuid test-uuid}
       [[true true]
        [true-value true]
        [false false]
        [false-value false]
        [[:= {} true false] false]
        [[:= {} 1 2] false]]]
      [:case {:lib/uuid test-uuid}
       [[[:= {} true true] true]
        [[:= {} true-value true] true]
        [[:= {} false true] false]
        [[:= {} false-value true] false]
        [[:= {} true false] false]
        [[:= {} 1 2] false]]])))
