(ns metabase.lib.order-by-test
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

(t/deftest ^:parallel order-by-test
  (t/is (=? {:database (meta/id)
             :type     :query
             :query    {:source-table (meta/id :venues)
                        :order-by     [[:asc
                                        {:lib/uuid string?}
                                        [:field (meta/id :venues :id) {:lib/uuid string?}]]]}}
            (-> (lib/query meta/metadata "VENUES")
                (lib/append (lib/order-by (lib/field "VENUES" "ID")))
                (dissoc :lib/metadata)))))

(t/deftest ^:parallel threading-test
  (t/is (=? {:database (meta/id)
             :type     :query
             :query    {:source-table (meta/id :venues)
                        :order-by     [[:asc
                                        {:lib/uuid string?}
                                        [:field (meta/id :venues :id) {:lib/uuid string?}]]]}}
            (-> (lib/query meta/metadata "VENUES")
                (lib/order-by (lib/field "VENUES" "ID"))
                (dissoc :lib/metadata)))))

(t/deftest ^:parallel threading-with-direction-test
  (t/is (=? {:database (meta/id)
             :type     :query
             :query    {:source-table (meta/id :venues)
                        :order-by     [[:desc
                                        {:lib/uuid string?}
                                        [:field (meta/id :venues :id) {:lib/uuid string?}]]]}}
            (-> (lib/query meta/metadata "VENUES")
                (lib/order-by (lib/field "VENUES" "ID") :desc)
                (dissoc :lib/metadata)))))

(t/deftest ^:parallel specific-stage-test
  (t/is (=? {:lib/type :lib/outer-query
             :database 1
             :type     :query
             :query    {:lib/type     :lib/inner-query
                        :lib/options  {:lib/uuid string?}
                        :source-query {:lib/type     :lib/inner-query
                                       :lib/options  {:lib/uuid string?}
                                       :source-query {:lib/type     :lib/inner-query
                                                      :lib/options  {:lib/uuid string?}
                                                      :source-table (meta/id :venues)}
                                       :order-by     [[:asc
                                                       {:lib/uuid string?}
                                                       [:field
                                                        (meta/id :venues :id)
                                                        {:lib/uuid string?}]]]}}}
            (-> (lib/query meta/metadata {:database 1
                                          :type     :query
                                          :query    {:source-query {:source-query {:source-table (meta/id :venues)}}}})
                (lib/append 1 (lib/order-by (lib/field "VENUES" "ID")))
                (dissoc :lib/metadata)))))

(t/deftest ^:parallel order-bys-test
  (t/is (=? [[:asc
              {:lib/uuid string?}
              [:field 400 {:lib/uuid string?}]]]
            (-> (lib/query meta/metadata "VENUES")
                (lib/append (lib/order-by (lib/field "VENUES" "ID")))
                lib/order-bys))))
