(ns metabase.lib.schema.util-test
  (:require
   [clojure.test :refer [are deftest is testing]]
   [malli.error :as me]
   [metabase.lib.schema.util :as lib.schema.util]
   [metabase.util.malli.registry :as mr]))

(defn- query [uuid-1 uuid-2]
  {:lib/type :mbql/query
   :database 1
   :stages   [{:lib/type     :mbql.stage/mbql
               :source-table 2
               :filter       [:=
                              {:lib/uuid "00000000-0000-0000-0000-000000000010"}
                              [:field
                               {:lib/uuid uuid-1, :base-type :type/Text}
                               3]
                              4]}
              {:lib/type :mbql.stage/mbql
               :filter   [:=
                          {:lib/uuid "00000000-0000-0000-0000-000000000020"}
                          [:field
                           {:lib/uuid uuid-2, :base-type :type/Text}
                           "my_field"]
                          4]}]})

(def query-with-no-duplicate-uuids
  (query "00000000-0000-0000-0000-000000000001"
         "00000000-0000-0000-0000-000000000002"))

(def query-with-duplicate-uuids
  (query "00000000-0000-0000-0000-000000000001"
         "00000000-0000-0000-0000-000000000001"))

(deftest ^:parallel collect-uuids-test
  (are [query expected-uuids] (= expected-uuids
                                 (lib.schema.util/collect-uuids query))
    query-with-no-duplicate-uuids
    #{"00000000-0000-0000-0000-000000000001"
      "00000000-0000-0000-0000-000000000002"
      "00000000-0000-0000-0000-000000000010"
      "00000000-0000-0000-0000-000000000020"}

    query-with-duplicate-uuids
    #{"00000000-0000-0000-0000-000000000001"
      "00000000-0000-0000-0000-000000000010"
      "00000000-0000-0000-0000-000000000020"}))

(deftest ^:parallel collect-uuids-from-lib-options
  (is (= #{"f590f35f-9224-45f1-8334-422f15fc4abd"}
         (lib.schema.util/collect-uuids
          {:lib/type :mbql/query
           :database 1
           :stages   [{:lib/type     :mbql.stage/mbql
                       :source-table 2
                       :lib/options  {:lib/uuid "f590f35f-9224-45f1-8334-422f15fc4abd"}}]}))))

(deftest ^:parallel unique-uuids?-test
  (is (lib.schema.util/unique-uuids? query-with-no-duplicate-uuids))
  (is (not (lib.schema.util/unique-uuids? query-with-duplicate-uuids))))

(deftest ^:parallel unique-uuids-schema-test
  (is (not (mr/explain ::lib.schema.util/unique-uuids query-with-no-duplicate-uuids)))
  (is (mr/explain ::lib.schema.util/unique-uuids query-with-duplicate-uuids))
  (is (= ["Duplicate :lib/uuid #{\"00000000-0000-0000-0000-000000000001\"}"]
         (me/humanize (mr/explain ::lib.schema.util/unique-uuids query-with-duplicate-uuids)))))

(deftest ^:parallel distinct-refs-test
  (are [refs] (not (lib.schema.util/distinct-refs? refs))
    [[:field {:lib/uuid "00000000-0000-0000-0000-000000000000"} 1]
     [:field {:lib/uuid "00000000-0000-0000-0000-000000000001"} 1]]

    [[:field {:lib/uuid "00000000-0000-0000-0000-000000000000", :base-type :type/Integer} 1]
     [:field {:lib/uuid "00000000-0000-0000-0000-000000000001", :base-type :type/Number} 1]]

    [[:field {:lib/uuid "00000000-0000-0000-0000-000000000000", :effective-type :type/Integer} 1]
     [:field {:lib/uuid "00000000-0000-0000-0000-000000000001", :effective-type :type/Number} 1]]

    [[:field {:lib/uuid "00000000-0000-0000-0000-000000000000", :effective-type :type/Integer} 1]
     [:field {:lib/uuid "00000000-0000-0000-0000-000000000001"} 1]]))

(deftest ^:parallel distinct-ignoring-uuids-schema-test
  (testing "distinct values ignoring uuids"
    (are [x] (not (mr/explain ::lib.schema.util/distinct-ignoring-uuids x))
      [1 2 3]
      [{:a 1, :lib/uuid "00000000-0000-0000-0000-000000000000"}
       {:b 2, :lib/uuid "00000000-0000-0000-0000-000000000000"}]
      [[:asc
        {:lib/uuid "00000000-0000-0000-0000-000000000000"}
        [:field
         {:lib/uuid "00000000-0000-0000-0000-000000000000"
          :base-type :type/BigInteger
          :effective-type :type/BigInteger}
         63400]]
       [:asc
        {:lib/uuid "00000000-0000-0000-0000-000000000000"}
        [:field
         {:lib/uuid "00000000-0000-0000-0000-000000000000"
          :base-type :type/BigInteger
          :effective-type :type/BigInteger}
         63401]]])))

(deftest ^:parallel distinct-ignoring-uuids-schema-test-2
  (testing "non-distinct values ignoring uuids"
    (are [x] (mr/explain ::lib.schema.util/distinct-ignoring-uuids x)
      [1 2 1 3]
      [{:a 1, :lib/uuid "00000000-0000-0000-0000-000000000000"}
       {:a 1, :lib/uuid "00000000-0000-0000-0000-000000000001"}]
      [[:asc
        {:lib/uuid "00000000-0000-0000-0000-000000000000"}
        [:field
         {:lib/uuid "00000000-0000-0000-0000-000000000000"
          :base-type :type/BigInteger
          :effective-type :type/BigInteger}
         63400]]
       [:asc
        {:lib/uuid "00000000-0000-0000-0000-000000000001"}
        [:field
         {:lib/uuid "00000000-0000-0000-0000-000000000001"
          :base-type :type/BigInteger
          :effective-type :type/BigInteger}
         63400]]])))

(deftest ^:parallel distinct-ignoring-uuids-schema-test-3
  (testing "humanized error message"
    (is (= ["Duplicate values ignoring uuids in: [{:a 1} {:a 1}]"]
           (me/humanize (mr/explain ::lib.schema.util/distinct-ignoring-uuids
                                    [{:a 1, :lib/uuid "00000000-0000-0000-0000-000000000000"}
                                     {:a 1, :lib/uuid "00000000-0000-0000-0000-000000000001"}]))))))
