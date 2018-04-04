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
                        {:dataset_query {:query {:aggregation [:sum [:field-id 1]]
                                                 :breakout [[:field-id 2]]}
                                         :type  :query}}]
                  Card [{card-id-2 :id}
                        {:dataset_query {:query {:aggregation [:sum [:field-id 3]]
                                                 :breakout [[:field-id 2]]}
                                         :type  :query}}]
                  Card [{card-id-3 :id}
                        {:dataset_query {:query {:aggregation [:sum [:field-id 3]]
                                                 :breakout [[:field-id 4]]}
                                         :type  :query}}]]
    (map double [(#'r/similarity (Card card-id-1) (Card card-id-2))
                 (#'r/similarity (Card card-id-1) (Card card-id-3))
                 (#'r/similarity (Card card-id-1) (Card card-id-1))])))


;; Create a world with 3 cards: A, B, and C with transitive similarity
;; (A is similar to B and B is similar to C, but A is not similar to C). Test if
;; this property holds and `:similar-questions` for A returns B, for B A and C,
;; and for C B. Note that C is less similar to B than A is, as C has an additional
;; breakout dimension.
;; Also tests the full roundtrip.

(tt/expect-with-temp [Database [{database-id :id}]
                      Table    [{table-id :id} {:db_id database-id}]
                      Card     [{card-id-a :id :as a}
                                {:table_id      table-id
                                 :dataset_query {:type :query
                                                 :database database-id
                                                 :query {:source_table table-id
                                                         :aggregation [:sum [:field-id 1]]
                                                         :breakout [[:field-id 2]]}}}]
                      Card     [{card-id-b :id :as b}
                                {:table_id      table-id
                                 :dataset_query {:type :query
                                                 :source_table table-id
                                                 :database database-id
                                                 :query {:aggregation [:sum [:field-id 3]]
                                                         :breakout [[:field-id 2]]}}}]
                      Card     [{card-id-c :id :as c}
                                {:table_id      table-id
                                 :dataset_query {:type :query
                                                 :source_table table-id
                                                 :database database-id
                                                 :query {:aggregation [:sum [:field-id 3]]
                                                         :breakout [[:field-id 4]
                                                                    [:field-id 5]]}}}]]
  [[card-id-b]
   [card-id-a card-id-c] ; Ordering matters as C is less similar to B than A.
   [card-id-b]]
  [(->> ((users/user->client :crowberto) :get 200 (format "card/%s/related" card-id-a))
        :similar-questions
        (map :id))
   (->> ((users/user->client :crowberto) :get 200 (format "card/%s/related" card-id-b))
        :similar-questions
        (map :id))
   (->> ((users/user->client :crowberto) :get 200 (format "card/%s/related" card-id-c))
        :similar-questions
        (map :id))])
