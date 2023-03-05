(ns metabase.lib.filter-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.test-metadata :as meta])
  #?(:cljs (:require [metabase.test-runner.assert-exprs.approximately-equal])))

(deftest ^:parallel equals-test
  (let [q1                          (lib/query meta/metadata "CATEGORIES")
        q2                          (lib/saved-question-query meta/saved-question)
        venues-category-id-metadata (lib.metadata/field-metadata q1 "VENUES" "CATEGORY_ID")
        categories-id-metadata      (lib.metadata/field-metadata q2 "ID")]
    (testing "without query/stage-number, return a function for later resolution"
      (let [f (lib/= venues-category-id-metadata categories-id-metadata)]
        (is (fn? f))
        (is (=? [:=
                 {:lib/uuid uuid?}
                 [:field (meta/id :venues :category-id) {:lib/uuid uuid?}]
                 [:field "ID" {:base-type :type/BigInteger, :lib/uuid uuid?}]]
                (f {:lib/metadata meta/metadata} -1)))))
    (testing "with query/stage-number, return clause right away"
      (is (=? [:=
               {:lib/uuid uuid?}
               [:field (meta/id :venues :category-id) {:lib/uuid uuid?}]
               [:field "ID" {:base-type :type/BigInteger, :lib/uuid uuid?}]]
              (lib/= {:lib/metadata meta/metadata}
                     -1
                     venues-category-id-metadata
                     categories-id-metadata))))))
