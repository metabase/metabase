(ns metabase.lib.filter-test
  (:require
   [clojure.test :as t]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.test-metadata :as meta])
  #?(:cljs (:require [metabase.test-runner.assert-exprs.approximately-equal])))

(t/deftest ^:parallel equals-test
  (let [q1                          (lib/query meta/metadata "CATEGORIES")
        q2                          (lib/saved-question-query meta/saved-question)
        venues-category-id-metadata (lib.metadata/field-metadata q1 "VENUES" "CATEGORY_ID")
        categories-id-metadata      (lib.metadata/field-metadata q2 "ID")]
    (t/testing "without query/stage-number, return a function for later resolution"
      (let [f (lib/= venues-category-id-metadata categories-id-metadata)]
        (t/is (fn? f))
        (t/is (=? [:=
                   {:lib/uuid string?}
                   [:field (meta/id :venues :category-id) {:lib/uuid string?}]
                   [:field "ID" {:base-type :type/BigInteger, :lib/uuid string?}]]
                  (f {:lib/metadata meta/metadata} -1)))))
    (t/testing "with query/stage-number, return clause right away"
      (t/is (=? [:=
                 {:lib/uuid string?}
                 [:field (meta/id :venues :category-id) {:lib/uuid string?}]
                 [:field "ID" {:base-type :type/BigInteger, :lib/uuid string?}]]
                (lib/= {:lib/metadata meta/metadata}
                       -1
                       venues-category-id-metadata
                       categories-id-metadata))))))
