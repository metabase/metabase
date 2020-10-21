(ns metabase.query-processor.middleware.resolve-joined-fields-test
  (:require [clojure.test :refer :all]
            [metabase
             [driver :as driver]
             [test :as mt]]
            [metabase.query-processor.middleware
             [resolve-fields :as resolve-fields]
             [resolve-joined-fields :as resolve-joined-fields]]
            [metabase.query-processor.store :as qp.store]
            [metabase.test.data.interface :as tx]))

(defn- wrap-joined-fields [query]
  (driver/with-driver (tx/driver)
    (qp.store/with-store
      (qp.store/fetch-and-store-database! (mt/id))
      (-> query
          ((var resolve-fields/resolve-fields*)) ; load fields into the QP store
          (update :query #'resolve-joined-fields/wrap-fields-in-joined-field-if-needed)))))

(deftest wrap-fields-in-joined-field-test
  (is (= (mt/mbql-query checkins
           {:filter [:!= [:joined-field "u" [:field-id (mt/id :users :name)]] nil]
            :joins  [{:source-table $$users
                      :alias        "u"
                      :condition    [:= $user_id &u.users.id]}]})
         (wrap-joined-fields
          (mt/mbql-query checkins
            {:filter [:!= [:field-id (mt/id :users :name)] nil]
             :joins  [{:source-table $$users
                       :alias        "u"
                       :condition    [:= $user_id &u.users.id]}]}))))
  (testing "Do we correctly recurse into `:source-query`"
    (is (= (mt/mbql-query checkins
             {:source-query {:filter [:!= [:joined-field "u" [:field-id (mt/id :users :name)]] nil]
                             :joins  [{:source-table $$users
                                       :alias        "u"
                                       :condition    [:= $user_id &u.users.id]}]}})
           (wrap-joined-fields
            (mt/mbql-query checkins
              {:source-query {:filter [:!= [:field-id (mt/id :users :name)] nil]
                              :joins  [{:source-table $$users
                                        :alias        "u"
                                        :condition    [:= $user_id &u.users.id]}]}}))))))
