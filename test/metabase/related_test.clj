(ns metabase.related-test
  (:require [expectations :refer :all]
            [metabase.api.common :as api]
            [metabase.models
             [card :refer [Card]]
             [collection :refer [Collection]]
             [database :refer [Database]]
             [metric :refer [Metric]]
             [segment :refer [Segment]]
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


(defmacro ^:private with-world
  [& body]
  `(tt/expect-with-temp [Database  [{~'database-id :id}]
                        Table      [{~'table-id-a :id} {:db_id ~'database-id}]
                        Table      [{~'table-id-b :id} {:db_id ~'database-id}]
                        Collection [{~'collection-id :id}]
                        Metric     [{~'metric-id-a :id} {:table_id ~'table-id-a
                                                       :definition {:source_table ~'table-id-a
                                                                    :aggregation [:sum [:field-id 1]]}}]
                        Metric     [{~'metric-id-b :id} {:table_id ~'table-id-a
                                                       :definition {:source_table ~'table-id-a
                                                                    :aggregation [:count]}}]
                        Segment    [{~'segment-id-a :id} {:table_id ~'table-id-a
                                                        :definition {:source_table ~'table-id-a
                                                                     :filter [:not= [:field-id 1] nil]}}]
                        Segment    [{~'segment-id-b :id} {:table_id ~'table-id-a
                                                        :definition {:source_table ~'table-id-a
                                                                     :filter [:not= [:field-id 2] nil]}}]
                         Card       [{~'card-id-a :id :as ~'card-a}
                                     {:table_id      ~'table-id-a
                                      :dataset_query {:type :query
                                                      :database ~'database-id
                                                      :query {:source_table ~'table-id-a
                                                              :aggregation [:sum [:field-id 1]]
                                                              :breakout [[:field-id 2]]}}}]
                         Card       [{~'card-id-b :id :as ~'card-b}
                                     {:table_id      ~'table-id-a
                                      :collection_id ~'collection-id
                                      :dataset_query {:type :query
                                                      :source_table ~'table-id-a
                                                      :database ~'database-id
                                                      :query {:aggregation [:sum [:field-id 3]]
                                                              :breakout [[:field-id 2]]}}}]
                         Card       [{card-id-c :id :as ~'card-c}
                                     {:table_id      ~'table-id-a
                                      :dataset_query {:type :query
                                                      :source_table ~'table-id-a
                                                      :database ~'database-id
                                                      :query {:aggregation [:sum [:field-id 3]]
                                                              :breakout [[:field-id 4]
                                                                         [:field-id 5]]}}}]]
     ~@body))

(defn- result-mask
  [x]
  (into {}
        (for [[k v] x]
          [k (if (sequential? v)
               (map :id v)
               (:id v))])))

(with-world
  {:table             table-id-a
   :metrics           [metric-id-a metric-id-b]
   :segments          [segment-id-a segment-id-b]
   :dashboard-mates   []
   :similar-questions [card-id-b]
   :canonical-metric  metric-id-a
   :collections       [collection-id]
   :dashboards        []}
  (->> ((users/user->client :crowberto) :get 200 (format "card/%s/related" card-id-a))
       result-mask))

(with-world
  {:table    table-id-a
   :metrics  [metric-id-b]
   :segments [segment-id-a segment-id-b]}
  (->> ((users/user->client :crowberto) :get 200 (format "metric/%s/related" metric-id-a))
       result-mask))

(with-world
  {:table       table-id-a
   :metrics     [metric-id-a metric-id-b]
   :segments    [segment-id-b]
   :linked-from []}
  (->> ((users/user->client :crowberto) :get 200 (format "segment/%s/related" segment-id-a))
       result-mask))

(with-world
  {:metrics     [metric-id-a metric-id-b]
   :segments    [segment-id-a segment-id-b]
   :linking-to  []
   :linked-from []
   :tables      [table-id-b]}
  (->> ((users/user->client :crowberto) :get 200 (format "table/%s/related" table-id-a))
       result-mask))


;; Test transitive similarity:
;; (A is similar to B and B is similar to C, but A is not similar to C). Test if
;; this property holds and `:similar-questions` for A returns B, for B A and C,
;; and for C B. Note that C is less similar to B than A is, as C has an additional
;; breakout dimension.

(with-world
  [card-id-b]
  (->> ((users/user->client :crowberto) :get 200 (format "card/%s/related" card-id-a))
       result-mask
       :similar-questions))

(with-world
  [card-id-a card-id-c] ; Ordering matters as C is less similar to B than A.
  (->> ((users/user->client :crowberto) :get 200 (format "card/%s/related" card-id-b))
       result-mask
       :similar-questions))

(with-world
  [card-id-b]
  (->> ((users/user->client :crowberto) :get 200 (format "card/%s/related" card-id-c))
       result-mask
       :similar-questions))
