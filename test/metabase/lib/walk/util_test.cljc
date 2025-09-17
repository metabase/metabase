(ns metabase.lib.walk.util-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.lib.core :as lib]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util.macros :as lib.tu.macros]
   [metabase.lib.walk.util :as lib.walk.util]
   [metabase.util.malli :as mu]))

(deftest ^:parallel all-source-table-ids-test
  (testing (str "make sure that `all-table-ids` can properly find all Tables in the query, even in cases where a map "
                "has a `:source-table` and some of its children also have a `:source-table`"))
  (is (= (lib.tu.macros/$ids nil
           #{$$checkins $$venues $$users $$categories})
         (lib.walk.util/all-source-table-ids
          (lib/query
           meta/metadata-provider
           (lib.tu.macros/mbql-query nil
             {:source-table $$checkins
              :joins        [{:source-table $$venues
                              :alias        "V"
                              :condition    [:=
                                             $checkins.venue-id
                                             &V.venues.id]}
                             {:source-query {:source-table $$users
                                             :joins        [{:source-table $$categories
                                                             :alias        "Cat"
                                                             :condition    [:=
                                                                            $users.id
                                                                            &Cat.categories.id]}]}
                              :alias        "U"
                              :condition    [:=
                                             $checkins.user-id
                                             &U.users.id]}]}))))))

(deftest ^:parallel all-field-ids-test
  (mu/disable-enforcement
    (is (= #{1 2}
           (lib/all-field-ids
            {:lib/type :mbql/query
             :database 1
             :stages   [{:lib/type     :mbql.stage/mbql
                         :fields       [[:field {} 1]
                                        [:field {} 2]
                                        [:field {} "wow"]]
                         :source-table 1}]})))))
