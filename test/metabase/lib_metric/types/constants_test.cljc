(ns metabase.lib-metric.types.constants-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.lib-metric.types.constants :as constants]))

(deftest ^:lib-metric-types type-hierarchies-structure-test
  (testing "type-hierarchies contains expected keys"
    (is (contains? constants/type-hierarchies ::constants/temporal))
    (is (contains? constants/type-hierarchies ::constants/number))
    (is (contains? constants/type-hierarchies ::constants/boolean))
    (is (contains? constants/type-hierarchies ::constants/string))
    (is (contains? constants/type-hierarchies ::constants/string-like))
    (is (contains? constants/type-hierarchies ::constants/coordinate))
    (is (contains? constants/type-hierarchies ::constants/location))
    (is (contains? constants/type-hierarchies ::constants/foreign-key))
    (is (contains? constants/type-hierarchies ::constants/primary-key))
    (is (contains? constants/type-hierarchies ::constants/time))
    (is (contains? constants/type-hierarchies ::constants/date))))

(deftest ^:lib-metric-types type-hierarchies-effective-types-test
  (testing "effective-type definitions have correct structure"
    (is (= {:effective-type [:type/Temporal]}
           (::constants/temporal constants/type-hierarchies)))
    (is (= {:effective-type [:type/Number]}
           (::constants/number constants/type-hierarchies)))
    (is (= {:effective-type [:type/Boolean]}
           (::constants/boolean constants/type-hierarchies)))
    (is (= {:effective-type [:type/Text]}
           (::constants/string constants/type-hierarchies)))
    (is (= {:effective-type [:type/TextLike]}
           (::constants/string-like constants/type-hierarchies)))
    (is (= {:effective-type [:type/Time]}
           (::constants/time constants/type-hierarchies)))
    (is (= {:effective-type [:type/HasDate]}
           (::constants/date constants/type-hierarchies)))))

(deftest ^:lib-metric-types type-hierarchies-semantic-types-test
  (testing "semantic-type definitions have correct structure"
    (is (= {:semantic-type [:type/Coordinate]}
           (::constants/coordinate constants/type-hierarchies)))
    (is (= {:semantic-type [:type/Address]}
           (::constants/location constants/type-hierarchies)))
    (is (= {:semantic-type [:type/FK]}
           (::constants/foreign-key constants/type-hierarchies)))
    (is (= {:semantic-type [:type/PK]}
           (::constants/primary-key constants/type-hierarchies)))))
