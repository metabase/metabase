(ns metabase.lib.order-by-test
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

(t/deftest ^:parallel order-by-test
  (t/is (=? {:database (meta/id)
             :type     :pipeline
             :stages   [{:lib/type     :stage/mbql
                         :source-table (meta/id :venues)
                         :order-by     [[:asc
                                         {:lib/uuid string?}
                                         [:field (meta/id :venues :id) {:lib/uuid string?}]]]}]}
            (-> (lib/query meta/metadata "VENUES")
                (lib/append (lib/order-by (lib/field "VENUES" "ID")))
                (dissoc :lib/metadata)))))

(t/deftest ^:parallel threading-test
  (t/is (=? {:database (meta/id)
             :type     :pipeline
             :stages   [{:lib/type     :stage/mbql
                         :source-table (meta/id :venues)
                         :order-by     [[:asc
                                         {:lib/uuid string?}
                                         [:field (meta/id :venues :id) {:lib/uuid string?}]]]}]}
            (-> (lib/query meta/metadata "VENUES")
                (lib/order-by (lib/field "VENUES" "ID"))
                (dissoc :lib/metadata)))))

(t/deftest ^:parallel threading-with-direction-test
  (t/is (=? {:database (meta/id)
             :type     :pipeline
             :stages   [{:lib/type     :stage/mbql
                         :source-table (meta/id :venues)
                         :order-by     [[:desc
                                         {:lib/uuid string?}
                                         [:field (meta/id :venues :id) {:lib/uuid string?}]]]}]}
            (-> (lib/query meta/metadata "VENUES")
                (lib/order-by (lib/field "VENUES" "ID") :desc)
                (dissoc :lib/metadata)))))

(t/deftest ^:parallel specific-stage-test
  (t/are [x] (=? {:lib/type :lib/outer-query
                  :database 1
                  :type     :pipeline
                  :stages   [{:lib/type     :stage/mbql
                              :lib/options  {:lib/uuid string?}
                              :source-table (meta/id :venues)}
                             {:lib/type    :stage/mbql
                              :lib/options {:lib/uuid string?}
                              :order-by    [[:asc
                                             {:lib/uuid string?}
                                             [:field
                                              (meta/id :venues :id)
                                              {:lib/uuid string?}]]]}
                             {:lib/type    :stage/mbql
                              :lib/options {:lib/uuid string?}}]}
                 (-> (lib/query meta/metadata {:database 1
                                               :type     :query
                                               :query    {:source-query {:source-query {:source-table (meta/id :venues)}}}})
                     x
                     (dissoc :lib/metadata)))
    (lib/append 1 (lib/order-by (lib/field "VENUES" "ID")))
    (lib/order-by 1 (lib/field "VENUES" "ID"))))

(t/deftest ^:parallel order-by-field-metadata-test
  (t/testing "Should be able to create an order by using raw Field metadata"
    (t/is (=? [:asc
               {:lib/uuid string?}
               [:field (meta/id :venues :id) {:lib/uuid string?}]]
              (lib/order-by (lib.metadata/field-metadata meta/metadata "VENUES" "ID"))))))

(t/deftest ^:parallel append-order-by-field-metadata-test
  (t/testing "Should be able to add an order by using raw Field metadata"
    (let [query     (lib/query meta/metadata "CATEGORIES")
          venues-id (lib.metadata/field-metadata query "VENUES" "ID")]
      (t/is (=? {:database (meta/id)
                 :stages   [{:lib/type     :stage/mbql
                             :source-table (meta/id :categories)
                             :order-by     [[:asc
                                             {:lib/uuid string?}
                                             [:field (meta/id :venues :id) {:lib/uuid string?}]]]}]}
                (-> query
                    (lib/order-by venues-id)
                    (dissoc :lib/metadata)))))))

(t/deftest ^:parallel order-bys-test
  (t/is (=? [[:asc
              {:lib/uuid string?}
              [:field 400 {:lib/uuid string?}]]]
            (-> (lib/query meta/metadata "VENUES")
                (lib/append (lib/order-by (lib/field "VENUES" "ID")))
                lib/order-bys))))
