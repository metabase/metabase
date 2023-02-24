(ns metabase.lib.join-test
  (:require
   [clojure.test :as t]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.test-metadata :as meta])
  #?(:cljs (:require [metabase.test-runner.assert-exprs.approximately-equal])))

(t/deftest ^:parallel join-test
  (t/is (=? {:lib/type :mbql/query
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
                                                       [:field (meta/id :venues :category-id) {:lib/uuid string?}]
                                                       [:field (meta/id :categories :id) {:lib/uuid string?}]]}]}]}
            (-> (lib/query meta/metadata "VENUES")
                (lib/join (lib/query meta/metadata "CATEGORIES")
                          (lib/= (lib/field "VENUES" "CATEGORY_ID")
                                 (lib/field "CATEGORIES" "ID")))
                (dissoc :lib/metadata)))))

(t/deftest ^:parallel join-saved-question-test
  (t/is (=? {:lib/type :mbql/query
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
                                                       [:field (meta/id :venues :category-id) {:lib/uuid string?}]
                                                       [:field (meta/id :categories :id) {:lib/uuid string?}]]}]}]}
            (-> (lib/query meta/metadata "CATEGORIES")
                (lib/join (lib/saved-question-query meta/saved-question)
                          (lib/= (lib/field "VENUES" "CATEGORY_ID")
                                 (lib/field "CATEGORIES" "ID")))
                (dissoc :lib/metadata)))))

(t/deftest ^:parallel join-condition-field-metadata-test
  (t/testing "Should be able to use raw Field metadatas in the join condition"
    (let [q1                 (lib/query meta/metadata "CATEGORIES")
          q2                 (lib/saved-question-query meta/saved-question)
          venues-category-id (lib.metadata/field-metadata q1 "VENUES" "CATEGORY_ID")
          categories-id      (lib.metadata/field-metadata q2 "ID")]
      (t/is (=? {:lib/type    :mbql/join
                 :lib/options {:lib/uuid string?}
                 :stages      [{:lib/type     :mbql.stage/mbql
                                :lib/options  {:lib/uuid string?}
                                :source-table (meta/id :venues)}]
                 :condition   [:=
                               {:lib/uuid string?}
                               [:field (meta/id :venues :category-id) {:lib/uuid string?}]
                               [:field "ID" {:base-type :type/BigInteger, :lib/uuid string?}]]}
                (lib/join q2 (lib/= venues-category-id categories-id))))
      (t/is (=? {:database (meta/id)
                 :stages   [{:source-table (meta/id :categories)
                             :joins        [{:lib/type    :mbql/join
                                             :lib/options {:lib/uuid string?}
                                             :stages      [{:source-table (meta/id :venues)}]
                                             :condition   [:=
                                                           {:lib/uuid string?}
                                                           [:field (meta/id :venues :category-id) {:lib/uuid string?}]
                                                           [:field "ID" {:base-type :type/BigInteger, :lib/uuid string?}]]}]}]}
                (-> q1
                    (lib/join q2 (lib/= venues-category-id categories-id))
                    (dissoc :lib/metadata)))))))
