(ns metabase.query-processor.middleware.fetch-source-query-test
  (:require [expectations :refer [expect]]
            [metabase.models
             [card :refer [Card]]
             [database :as database]]
            [metabase.query-processor.middleware.fetch-source-query :as fetch-source-query]
            [metabase.test.data :as data]
            [metabase.util :as u]
            [toucan.util.test :as tt]))

(def ^:private ^{:arglists '([query])} fetch-source-query (fetch-source-query/fetch-source-query identity))

(defn- wrap-inner-query [query]
  {:database     database/virtual-id
   :type         :query
   :query        query})

(defn- default-result-with-inner-query [inner-query]
  {:database (data/id)
   :type     :query
   :query    inner-query})

;; make sure that the `fetch-source-query` middleware correctly resolves MBQL queries
(expect
  (default-result-with-inner-query
   {:aggregation  [[:count]]
    :breakout     [[:field-literal "price" :type/Integer]]
    :source-query {:source-table (data/id :venues)}})
  (tt/with-temp Card [card {:dataset_query {:database (data/id)
                                            :type     :query
                                            :query    {:source-table (data/id :venues)}}}]
    (fetch-source-query
     (wrap-inner-query
      {:source-table (str "card__" (u/get-id card))
       :aggregation  [[:count]]
       :breakout     [[:field-literal "price" :type/Integer]]}))))

;; make sure that the `fetch-source-query` middleware correctly resolves native queries
(expect
  (default-result-with-inner-query
   {:aggregation  [[:count]]
    :breakout     [[:field-literal "price" :type/Integer]]
    :source-query {:native (format "SELECT * FROM %s" (data/format-name "venues"))}})
  (tt/with-temp Card [card {:dataset_query {:database (data/id)
                                            :type     :native
                                            :native   {:query (format "SELECT * FROM %s" (data/format-name "venues"))}}}]
    (fetch-source-query
     (wrap-inner-query
      {:source-table (str "card__" (u/get-id card))
       :aggregation  [[:count]]
       :breakout     [[:field-literal "price" :type/Integer]]}))))

(expect
  (default-result-with-inner-query
   {:source-query {:source-table (data/id :venues)}})
  (tt/with-temp Card [card {:dataset_query {:database (data/id)
                                            :type     :query
                                            :query    {:source-table (data/id :venues)}}}]
    (fetch-source-query
     (wrap-inner-query
      {:source-table (str "card__" (u/get-id card))}))))

(expect
  (default-result-with-inner-query
   {:source-query {:source-table (data/id :checkins)}
    :filter       [:between [:field-literal "date" :type/Date] "2015-01-01" "2015-02-01"]})
  (tt/with-temp Card [card {:dataset_query {:database (data/id)
                                            :type     :query
                                            :query    {:source-table (data/id :checkins)}}}]
    (fetch-source-query
     (wrap-inner-query
      {:source-table (str "card__" (u/get-id card))
       :filter       [:between
                      [:field-literal "date" :type/Date]
                      "2015-01-01"
                      "2015-02-01"]}))))

;; make sure that nested nested queries work as expected
(expect
  (default-result-with-inner-query
   {:limit        25
    :source-query {:limit        50
                   :source-query {:source-table (data/id :venues)
                                  :limit        100}}})
  (tt/with-temp* [Card [card-1 {:dataset_query {:database (data/id)
                                                :type     :query
                                                :query    {:source-table (data/id :venues), :limit 100}}}]
                  Card [card-2 {:dataset_query {:database database/virtual-id
                                                :type     :query
                                                :query    {:source-table (str "card__" (u/get-id card-1)), :limit 50}}}]]
    (fetch-source-query
     (wrap-inner-query
      {:source-table (str "card__" (u/get-id card-2)), :limit 25}))))

(expect
  (default-result-with-inner-query
   {:limit        25
    :source-query {:limit 50
                   :source-query {:source-table (data/id :venues)
                                  :limit        100}}})
  (tt/with-temp* [Card [card-1 {:dataset_query {:database (data/id)
                                                :type     :query
                                                :query    {:source-table (data/id :venues), :limit 100}}}]
                  Card [card-2 {:dataset_query {:database database/virtual-id
                                                :type     :query
                                                :query    {:source-table (str "card__" (u/get-id card-1)), :limit 50}}}]]
    (fetch-source-query
     (wrap-inner-query
      {:source-table (str "card__" (u/get-id card-2)), :limit 25}))))
