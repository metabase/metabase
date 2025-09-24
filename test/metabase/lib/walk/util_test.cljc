(ns metabase.lib.walk.util-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]
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

(deftest ^:parallel all-source-card-ids-legacy-native-query-template-tags-test
  (let [query {:database 1
               :type     :native
               :native   {:query         "SELECT *;"
                          :template-tags {"tag_1" {:type    :card
                                                   :card-id 100}
                                          "tag_2" {:type    :card
                                                   :card-id 200}}}}]
    (mu/disable-enforcement
      (is (= #{100 200}
             (lib/all-source-card-ids (lib/query meta/metadata-provider query)))))))

(deftest ^:parallel all-source-card-ids-legacy-query-source-card-test
  (let [query {:database 1
               :type     :query
               :query    {:source-query {:source-table "card__1000"}}}]
    (is (= #{1000}
           (lib/all-source-card-ids (lib/query meta/metadata-provider query))))))

(deftest ^:parallel all-source-card-ids-pmbql-native-query-template-tags-test
  (let [query (lib/query meta/metadata-provider {:lib/type      :mbql.stage/native
                                                 :native        "SELECT *;"
                                                 :template-tags {"tag_1" {:name         "tag_1"
                                                                          :display-name "Tag 1"
                                                                          :type         :card
                                                                          :card-id      100}
                                                                 "tag_2" {:name         "tag_2"
                                                                          :display-name "Tag 2"
                                                                          :type         :card
                                                                          :card-id      200}}})]
    (is (= #{100 200}
           (lib/all-source-card-ids (lib/query meta/metadata-provider query))))))

(deftest ^:parallel all-source-card-ids-source-card-test
  (let [mp      (lib.tu/metadata-provider-with-cards-for-queries
                 meta/metadata-provider
                 [(lib/query meta/metadata-provider (lib.metadata/table meta/metadata-provider (meta/id :venues)))])
        query-with-source-card (lib/query mp (lib.metadata/card mp 1))]
    (is (= #{1}
           (lib/all-source-card-ids query-with-source-card)))))
