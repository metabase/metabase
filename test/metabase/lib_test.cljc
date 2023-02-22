(ns metabase.lib-test
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

(t/deftest ^:parallel mbql-query-test
  (t/is (=? {:database (meta/id)
             :type     :query
             :query    {:source-table (meta/id :venues)}}
            (lib/query meta/metadata "VENUES")))
  (t/testing "Append an order-by clause"
    (t/is (=? {:database (meta/id)
               :type     :query
               :query    {:source-table (meta/id :venues)
                          :order-by     [[:asc
                                          {:lib/uuid string?}
                                          [:field (meta/id :venues :id) nil]]]}}
              (-> (lib/query meta/metadata "VENUES")
                  (lib/append (lib/order-by (lib/field "VENUES" "ID"))))))
    (t/is (=? {:database (meta/id)
               :type     :query
               :query    {:source-table (meta/id :venues)
                          :order-by     [[:asc
                                          {:lib/uuid string?}
                                          [:field (meta/id :venues :id) {:temporal-unit :month}]]]}}
              (-> (lib/query meta/metadata "VENUES")
                  (lib/append (lib/order-by (-> (lib/field "VENUES" "ID")
                                                (lib/temporal-bucket :month)))))))))

(t/deftest ^:parallel native-query-test
  (t/is (=? {:database 1
             :type     :native
             :native   {:query "SELECT * FROM VENUES;"}}
            (lib/native-query meta/metadata meta/results-metadata "SELECT * FROM VENUES;")))
  (t/testing "Append an order-by clause"
    (t/is (=? {:database (meta/id)
               :type     :query
               :query    {:source-query {:native "SELECT * FROM VENUES;"}
                          :order-by     [[:asc
                                          {:lib/uuid string?}
                                          [:field "ID" {:temporal-unit :month, :base-type :type/BigInteger}]]]}}
              (-> (lib/native-query meta/metadata meta/results-metadata "SELECT * FROM VENUES;")
                  (lib/append (lib/order-by (-> (lib/field "ID")
                                                (lib/temporal-bucket :month)))))))))

(t/deftest ^:parallel card-source-query-test
  (t/is (=? {:database 1
             :type     :native
             :native   {:query "SELECT * FROM VENUES;"}}
            (lib/saved-question-query {:dataset_query   {:database 1
                                                         :type     :native
                                                         :native   {:query "SELECT * FROM VENUES;"}}
                                       :result_metadata meta/results-metadata})))
  (t/testing "Append an order-by clause"
    (t/is (=? {:database 1
               :type     :query
               :query    {:source-query {:native "SELECT * FROM VENUES;"}
                          :order-by     [[:asc
                                          {:lib/uuid string?}
                                          [:field "ID" {:base-type :type/BigInteger, :temporal-unit :month}]]]}}
              (-> (lib/saved-question-query {:dataset_query   {:database 1
                                                               :type     :native
                                                               :native   {:query "SELECT * FROM VENUES;"}}
                                             :result_metadata meta/results-metadata})
                  (lib/append (lib/order-by (-> (lib/field "ID")
                                                (lib/temporal-bucket :month)))))))))

(t/deftest ^:parallel notebook-query-test
  (t/is (=? {:database 1
             :type     :query
             :query    {:source-query {:source-query {:source-table (meta/id :venues)}
                                       :order-by     [[:asc
                                                       {:lib/uuid string?}
                                                       [:field (meta/id :venues :id) nil]]]}}}
            (-> (lib/query meta/metadata {:database 1
                                          :type     :query
                                          :query    {:source-query {:source-query {:source-table (meta/id :venues)}}}})
                (lib/append 1 (lib/order-by (lib/field "VENUES" "ID")))))))
