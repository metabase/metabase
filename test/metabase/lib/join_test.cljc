(ns metabase.lib.join-test
  #?@
   (:clj
    [(:require
      [clojure.test :as t]
      [metabase.lib :as lib]
      [metabase.lib.metadata :as lib.metadata]
      [metabase.lib.test-metadata :as meta])]
    :cljs
    [(:require
      [cljs.test :as t :include-macros true]
      [metabase.lib :as lib]
      [metabase.lib.metadata :as lib.metadata]
      [metabase.lib.test-metadata :as meta])]))

(t/deftest ^:parallel join-test
  (t/is (=? {:database (meta/id)
             :type     :query
             :lib/type :lib/outer-query
             :query    {:lib/type     :lib/inner-query
                        :source-table (meta/id :venues)
                        :lib/options  {:lib/uuid string?}
                        :joins        [{:lib/type     :lib/join
                                        :lib/options  {:lib/uuid string?}
                                        :source-table (meta/id :categories)
                                        :condition    [:=
                                                       {:lib/uuid string?}
                                                       [:field (meta/id :venues :category-id) {:lib/uuid string?}]
                                                       [:field (meta/id :categories :id) {:lib/uuid string?}]]}]}}
            (-> (lib/query meta/metadata "VENUES")
                (lib/join (lib/query meta/metadata "CATEGORIES")
                          (lib/= (lib/field "VENUES" "CATEGORY_ID")
                                 (lib/field "CATEGORIES" "ID")))
                (dissoc :lib/metadata)))))

(t/deftest ^:parallel join-saved-question-test
  (t/is (=? {:database (meta/id)
             :type     :query
             :lib/type :lib/outer-query
             :query    {:lib/type     :lib/inner-query
                        :lib/options  {:lib/uuid string?}
                        :source-table (meta/id :categories)
                        :joins        [{:lib/type     :lib/join
                                        :lib/options  {:lib/uuid string?}
                                        :source-table (meta/id :venues)
                                        :condition    [:=
                                                       {:lib/uuid string?}
                                                       [:field (meta/id :venues :category-id) {:lib/uuid string?}]
                                                       [:field (meta/id :categories :id) {:lib/uuid string?}]]}]}}
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
      (t/is (=? {:lib/type     :lib/join
                 :lib/options  {:lib/uuid string?}
                 :source-table (meta/id :venues)
                 :condition    [:=
                                {:lib/uuid string?}
                                [:field (meta/id :venues :category-id) {:lib/uuid string?}]
                                [:field "ID" {:base-type :type/BigInteger, :lib/uuid string?}]]}
                (lib/join q2 (lib/= venues-category-id categories-id))))
      (t/is (=? {:database (meta/id)
                 :query    {:source-table (meta/id :categories)
                            :joins        [{:lib/type     :lib/join
                                            :lib/options  {:lib/uuid string?}
                                            :source-table (meta/id :venues)
                                            :condition    [:=
                                                           {:lib/uuid string?}
                                                           [:field (meta/id :venues :category-id) {:lib/uuid string?}]
                                                           [:field "ID" {:base-type :type/BigInteger, :lib/uuid string?}]]}]}}
                (-> q1
                    (lib/join q2 (lib/= venues-category-id categories-id))
                    (dissoc :lib/metadata)))))))
