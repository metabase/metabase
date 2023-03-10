(ns metabase.lib.join-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.test-metadata :as meta])
  #?(:cljs (:require [metabase.test-runner.assert-exprs.approximately-equal])))

(deftest ^:parallel join-test
  (is (=? {:lib/type :mbql/query
           :database (meta/id)
           :type     :pipeline
           :stages   [{:lib/type     :mbql.stage/mbql
                       :lib/options  {:lib/uuid string?}
                       :source-table (meta/id :venues)
                       :joins        [{:lib/type    :mbql/join
                                       :lib/options {:lib/uuid string?}
                                       :stages      [{:lib/type     :mbql.stage/mbql
                                                      :lib/options  {:lib/uuid string?}
                                                      :source-table (meta/id :categories)}]
                                       :condition   [:=
                                                     {:lib/uuid string?}
                                                     [:field {:lib/uuid string?} (meta/id :venues :category-id)]
                                                     [:field {:lib/uuid string?} (meta/id :categories :id)]]}]}]}
          (-> (lib/query-for-table-name meta/metadata-provider "VENUES")
              (lib/join (lib/query-for-table-name meta/metadata-provider "CATEGORIES")
                        (lib/= (lib/field "VENUES" "CATEGORY_ID")
                               (lib/field "CATEGORIES" "ID")))
              (dissoc :lib/metadata)))))

(deftest ^:parallel join-saved-question-test
  (is (=? {:lib/type :mbql/query
           :database (meta/id)
           :type     :pipeline
           :stages   [{:lib/type     :mbql.stage/mbql
                       :lib/options  {:lib/uuid string?}
                       :source-table (meta/id :categories)
                       :joins        [{:lib/type    :mbql/join
                                       :lib/options {:lib/uuid string?}
                                       :stages      [{:lib/type     :mbql.stage/mbql
                                                      :lib/options  {:lib/uuid string?}
                                                      :source-table (meta/id :venues)}]
                                       :condition   [:=
                                                     {:lib/uuid string?}
                                                     [:field {:lib/uuid string?} (meta/id :venues :category-id)]
                                                     [:field {:lib/uuid string?} (meta/id :categories :id)]]}]}]}
          (-> (lib/query-for-table-name meta/metadata-provider "CATEGORIES")
              (lib/join (lib/saved-question-query meta/metadata-provider meta/saved-question)
                        (lib/= (lib/field "VENUES" "CATEGORY_ID")
                               (lib/field "CATEGORIES" "ID")))
              (dissoc :lib/metadata)))))

(deftest ^:parallel join-condition-field-metadata-test
  (testing "Should be able to use raw Field metadatas in the join condition"
    (let [q1                          (lib/query-for-table-name meta/metadata-provider "CATEGORIES")
          q2                          (lib/saved-question-query meta/metadata-provider meta/saved-question)
          venues-category-id-metadata (lib.metadata/field q1 nil "VENUES" "CATEGORY_ID")
          categories-id-metadata      (lib.metadata/stage-column q2 "ID")]
      (testing "lib/join-clause: return a function that can be resolved later"
        (let [f (lib/join-clause q2 (lib/= venues-category-id-metadata categories-id-metadata))]
          (is (fn? f))
          (is (=? {:lib/type    :mbql/join
                   :lib/options {:lib/uuid string?}
                   :stages      [{:lib/type     :mbql.stage/mbql
                                  :lib/options  {:lib/uuid string?}
                                  :source-table (meta/id :venues)}]
                   :condition   [:=
                                 {:lib/uuid string?}
                                 [:field {:lib/uuid string?} (meta/id :venues :category-id)]
                                 [:field {:base-type :type/BigInteger, :lib/uuid string?} "ID"]]}
                  (f {:lib/metadata meta/metadata} -1)))))
      (is (=? {:database (meta/id)
               :stages   [{:source-table (meta/id :categories)
                           :joins        [{:lib/type    :mbql/join
                                           :lib/options {:lib/uuid string?}
                                           :stages      [{:source-table (meta/id :venues)}]
                                           :condition   [:=
                                                         {:lib/uuid string?}
                                                         [:field {:lib/uuid string?} (meta/id :venues :category-id)]
                                                         [:field {:base-type :type/BigInteger, :lib/uuid string?} "ID"]]}]}]}
              (-> q1
                  (lib/join q2 (lib/= venues-category-id-metadata categories-id-metadata))
                  (dissoc :lib/metadata)))))))
