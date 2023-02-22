(ns metabase.lib.join-test
  #?@
   (:clj
    [(:require
      [clojure.test :as t]
      [metabase.lib :as lib]
      [metabase.lib.test-metadata :as meta])]
    :cljs
    [(:require
      [cljs.test :as t :include-macros true]
      [metabase.lib :as lib]
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
                                        :source-query {:lib/type     :lib/inner-query
                                                       :lib/options  {:lib/uuid string?}
                                                       :source-table (meta/id :categories)}
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
                        :source-table (meta/id :categories)
                        :lib/options  {:lib/uuid string?}
                        :joins        [{:lib/type     :lib/join
                                        :lib/options  {:lib/uuid string?}
                                        :source-query {:lib/type     :lib/inner-query
                                                       :lib/options  {:lib/uuid string?}
                                                       :source-table (meta/id :venues)}
                                        :condition    [:=
                                                       {:lib/uuid string?}
                                                       [:field (meta/id :venues :category-id) {:lib/uuid string?}]
                                                       [:field (meta/id :categories :id) {:lib/uuid string?}]]}]}}
            (-> (lib/query meta/metadata "CATEGORIES")
                (lib/join (lib/saved-question-query meta/saved-question)
                          (lib/= (lib/field "VENUES" "CATEGORY_ID")
                                 (lib/field "CATEGORIES" "ID")))
                (dissoc :lib/metadata)))))
