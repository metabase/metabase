(ns metabase.related-test
  (:require [expectations :refer :all]
            [metabase.models
             [card :refer [Card]]
             [collection :refer [Collection]]
             [metric :refer [Metric]]
             [segment :refer [Segment]]]
            [metabase.related :as r :refer :all]
            [metabase.test.data :as data]
            [metabase.test.data.users :as users]
            [toucan.util.test :as tt]))

(expect
  #{[:field-id 1] [:metric 1] [:field-id 2] [:segment 1]}
  (#'r/collect-context-bearing-forms [[:> [:field-id 1] 3]
                                      ["and" [:= ["FIELD-ID" 2] 2]
                                       ["segment" 1]]
                                      [:metric 1]]))


(expect
  [0.5
   0.0
   1.0]
  (tt/with-temp* [Card [{card-id-1 :id}
                        {:dataset_query {:query {:source_table (data/id :venues)
                                                 :aggregation [:sum [:field-id (data/id :venues :price)]]
                                                 :breakout [[:field-id (data/id :venues :category_id)]]}
                                         :type  :query
                                         :database (data/id)}}]
                  Card [{card-id-2 :id}
                        {:dataset_query {:query {:source_table (data/id :venues)
                                                 :aggregation [:sum [:field-id (data/id :venues :longitude)]]
                                                 :breakout [[:field-id (data/id :venues :category_id)]]}
                                         :type  :query
                                         :database (data/id)}}]
                  Card [{card-id-3 :id}
                        {:dataset_query {:query {:source_table (data/id :venues)
                                                 :aggregation [:sum [:field-id (data/id :venues :longitude)]]
                                                 :breakout [[:field-id (data/id :venues :latitude)]]}
                                         :type  :query
                                         :database (data/id)}}]]
    (map double [(#'r/similarity (Card card-id-1) (Card card-id-2))
                 (#'r/similarity (Card card-id-1) (Card card-id-3))
                 (#'r/similarity (Card card-id-1) (Card card-id-1))])))


(defmacro ^:private expect-with-world
  [& body]
  `(tt/expect-with-temp [Collection [{~'collection-id :id}]
                         Metric     [{~'metric-id-a :id} {:table_id (data/id :venues)
                                                          :definition {:source_table (data/id :venues)
                                                                       :aggregation [:sum [:field-id (data/id :venues :price)]]}}]
                         Metric     [{~'metric-id-b :id} {:table_id (data/id :venues)
                                                          :definition {:source_table (data/id :venues)
                                                                       :aggregation [:count]}}]
                         Segment    [{~'segment-id-a :id} {:table_id (data/id :venues)
                                                           :definition {:source_table (data/id :venues)
                                                                        :filter [:not= [:field-id (data/id :venues :category_id)] nil]}}]
                         Segment    [{~'segment-id-b :id} {:table_id (data/id :venues)
                                                           :definition {:source_table (data/id :venues)
                                                                        :filter [:not= [:field-id (data/id :venues :name)] nil]}}]
                         Card       [{~'card-id-a :id :as ~'card-a}
                                     {:table_id (data/id :venues)
                                      :dataset_query {:type :query
                                                      :database (data/id)
                                                      :query {:source_table (data/id :venues)
                                                              :aggregation [:sum [:field-id (data/id :venues :price)]]
                                                              :breakout [[:field-id (data/id :venues :category_id)]]}}}]
                         Card       [{~'card-id-b :id :as ~'card-b}
                                     {:table_id (data/id :venues)
                                      :collection_id ~'collection-id
                                      :dataset_query {:type :query
                                                      :database (data/id)
                                                      :query {:source_table (data/id :venues)
                                                              :aggregation [:sum [:field-id (data/id :venues :longitude)]]
                                                              :breakout [[:field-id (data/id :venues :category_id)]]}}}]
                         Card       [{~'card-id-c :id :as ~'card-c}
                                     {:table_id (data/id :venues)
                                      :dataset_query {:type :query
                                                      :database (data/id)
                                                      :query {:source_table (data/id :venues)
                                                              :aggregation [:sum [:field-id (data/id :venues :longitude)]]
                                                              :breakout [[:field-id (data/id :venues :name)]
                                                                         [:field-id (data/id :venues :latitude)]]}}}]]
     ~@body))

(defn- result-mask
  [x]
  (into {}
        (for [[k v] x]
          [k (if (sequential? v)
               (sort (map :id v))
               (:id v))])))

(expect-with-world
  {:table             (data/id :venues)
   :metrics           (sort [metric-id-a metric-id-b])
   :segments          (sort [segment-id-a segment-id-b])
   :dashboard-mates   []
   :similar-questions [card-id-b]
   :canonical-metric  metric-id-a
   :collections       [collection-id]
   :dashboards        []}
  (->> ((users/user->client :crowberto) :get 200 (format "card/%s/related" card-id-a))
       result-mask))

(expect-with-world
  {:table    (data/id :venues)
   :metrics  [metric-id-b]
   :segments (sort [segment-id-a segment-id-b])}
  (->> ((users/user->client :crowberto) :get 200 (format "metric/%s/related" metric-id-a))
       result-mask))

(expect-with-world
  {:table       (data/id :venues)
   :metrics     (sort [metric-id-a metric-id-b])
   :segments    [segment-id-b]
   :linked-from [(data/id :checkins)]}
  (->> ((users/user->client :crowberto) :get 200 (format "segment/%s/related" segment-id-a))
       result-mask))

(expect-with-world
  {:metrics     (sort [metric-id-a metric-id-b])
   :segments    (sort [segment-id-a segment-id-b])
   :linking-to  [(data/id :categories)]
   :linked-from [(data/id :checkins)]
   :tables      [(data/id :users)]}
  (->> ((users/user->client :crowberto) :get 200 (format "table/%s/related" (data/id :venues)))
       result-mask))


;; Test transitive similarity:
;; (A is similar to B and B is similar to C, but A is not similar to C). Test if
;; this property holds and `:similar-questions` for A returns B, for B A and C,
;; and for C B. Note that C is less similar to B than A is, as C has an additional
;; breakout dimension.

(expect-with-world
  [card-id-b]
  (->> ((users/user->client :crowberto) :get 200 (format "card/%s/related" card-id-a))
       result-mask
       :similar-questions))

(expect-with-world
  [card-id-a card-id-c] ; Ordering matters as C is less similar to B than A.
  (->> ((users/user->client :crowberto) :get 200 (format "card/%s/related" card-id-b))
       result-mask
       :similar-questions))

(expect-with-world
  [card-id-b]
  (->> ((users/user->client :crowberto) :get 200 (format "card/%s/related" card-id-c))
       result-mask
       :similar-questions))
