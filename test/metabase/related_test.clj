(ns metabase.related-test
  (:require [expectations :refer :all]
            [metabase.api.common :as api]
            [metabase.models
             [card :refer [Card]]
             [database :refer [Database]]
             [table :refer [Table]]]
            [metabase.related :refer :all :as r]
            [metabase.test.util :as tu]
            [metabase.test.data.users :as users]
            [toucan.util.test :as tt]))

(expect
  #{[:field-id 1] [:metric 1] ["FIELD-ID" 2] ["segment" 1]}
  (#'r/collect-context-bearing-forms [[:> [:field-id 1] 3]
                                      ["and" [:= ["FIELD-ID" 2] 2]
                                       ["segment" 1]]
                                      [:metric 1]]))

(expect
  [0.5
   0.0
   1.0]
  (tt/with-temp* [Card [{card-id-1 :id}
                        {:name          (tu/random-name)
                         :dataset_query {:query {:aggregation [:sum [:field-id 1]]
                                                 :breakout [[:field-id 2]]}}}]
                  Card [{card-id-2 :id}
                        {:name          (tu/random-name)
                         :dataset_query {:query {:aggregation [:sum [:field-id 3]]
                                                 :breakout [[:field-id 2]]}}}]
                  Card [{card-id-3 :id}
                        {:name          (tu/random-name)
                         :dataset_query {:query {:aggregation [:sum [:field-id 3]]
                                                 :breakout [[:field-id 4]]}}}]]
    (map double [(#'r/similarity (Card card-id-1) (Card card-id-2))
                 (#'r/similarity (Card card-id-1) (Card card-id-3))
                 (#'r/similarity (Card card-id-1) (Card card-id-1))])))

(expect
  1
  (binding [api/*current-user-id* (users/user->id :crowberto)]
    (tt/with-temp* [Database [{database-id :id}]
                    Table    [{table-id :id} {:db_id database-id}]
                    Card     [{card-id-1 :id}
                              {:table_id      table-id
                               :creator_id    api/*current-user-id*
                               :name          (tu/random-name)
                               :dataset_query {:type :query
                                               :database database-id
                                               :query {:source_table table-id
                                                       :aggregation [:sum [:field-id 1]]
                                                       :breakout [[:field-id 2]]}}}]
                    Card     [{card-id-2 :id}
                              {:table_id      table-id
                               :creator_id    api/*current-user-id*
                               :name          (tu/random-name)
                               :dataset_query {:type :query
                                               :source_table table-id
                                               :database database-id
                                               :query {:aggregation [:sum [:field-id 3]]
                                                       :breakout [[:field-id 2]]}}}]
                    Card     [{card-id-3 :id}
                              {:table_id      table-id
                               :creator_id    api/*current-user-id*
                               :name          (tu/random-name)
                               :dataset_query {:type :query
                                               :source_table table-id
                                               :database database-id
                                               :query {:aggregation [:sum [:field-id 3]]
                                                       :breakout [[:field-id 4]]}}}]]
      (->> ((users/user->client :crowberto) :get 200 (format "card/%s/related" card-id-1))
           :similar-questions
           (remove (Card card-id-1))
           count))))
