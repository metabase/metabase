(ns metabase.lib.filter-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.test-metadata :as meta]
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))))

(deftest ^:parallel equals-test
  (let [q1                          (lib/query-for-table-name meta/metadata-provider "CATEGORIES")
        q2                          (lib/saved-question-query meta/metadata-provider meta/saved-question)
        venues-category-id-metadata (lib.metadata/field q1 nil "VENUES" "CATEGORY_ID")
        categories-id-metadata      (lib.metadata/stage-column q2 -1 "ID")]
    (testing "without query/stage-number, return a function for later resolution"
      (let [f (lib/= venues-category-id-metadata categories-id-metadata)]
        (is (fn? f))
        (is (=? [:=
                 {:lib/uuid string?}
                 [:field {:base-type :type/Integer, :lib/uuid string?} (meta/id :venues :category-id)]
                 [:field {:base-type :type/BigInteger, :lib/uuid string?} "ID"]]
                (f {:lib/metadata meta/metadata} -1)))))
    (testing "with query/stage-number, return clause right away"
      (is (=? [:=
               {:lib/uuid string?}
               [:field {:lib/uuid string?} (meta/id :venues :category-id)]
               [:field {:base-type :type/BigInteger, :lib/uuid string?} "ID"]]
              (lib/= {:lib/metadata meta/metadata}
                     -1
                     venues-category-id-metadata
                     categories-id-metadata))))))
