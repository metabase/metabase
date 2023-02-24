(ns metabase.lib.filter-test
  (:require
   [clojure.test :as t]
   [metabase.lib.core :as lib]
   [metabase.lib.interface :as lib.interface]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.test-metadata :as meta])
  #?(:cljs (:require [metabase.test-runner.assert-exprs.approximately-equal])))

(t/deftest ^:parallel equals-test
  (let [q1                 (lib/query meta/metadata "CATEGORIES")
        q2                 (lib/saved-question-query meta/saved-question)
        venues-category-id (lib.metadata/field-metadata q1 "VENUES" "CATEGORY_ID")
        categories-id      (lib.metadata/field-metadata q2 "ID")]
    (t/is (=? [:=
               {:lib/uuid string?}
               [:field (meta/id :venues :category-id) {:lib/uuid string?}]
               [:field "ID" {:base-type :type/BigInteger, :lib/uuid string?}]]
              (lib/= venues-category-id categories-id)))))

(t/deftest ^:parallel resolve-test
  (t/is (=? [:=
             {:lib/uuid "4bee0972-cb09-451f-8138-701b015a9829"}
             [:field (meta/id :venues :id) {:lib/uuid string?}]
             [:field (meta/id :categories :id) {:lib/uuid string?}]]
            (lib.interface/resolve
             [:=
              {:lib/uuid "4bee0972-cb09-451f-8138-701b015a9829"}
              (meta/field-metadata :venues :id)
              (meta/field-metadata :categories :id)]
             meta/metadata))))
