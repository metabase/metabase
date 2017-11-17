(ns metabase.query-processor.middleware.fetch-source-query-test
  (:require [expectations :refer [expect]]
            [medley.core :as m]
            [metabase
             [query-processor :as qp]
             [util :as u]]
            [metabase.models
             [card :refer [Card]]
             [database :as database]]
            [metabase.query-processor.middleware.fetch-source-query :as fetch-source-query]
            [metabase.test.data :as data]
            [toucan.util.test :as tt]))

(def ^:private ^{:arglists '([query])} fetch-source-query (fetch-source-query/fetch-source-query identity))

;; make sure that the `fetch-source-query` middleware correctly resolves MBQL queries
(expect
  {:database (data/id)
   :type     :query
   :query    {:aggregation  [:count]
              :breakout     [[:field-literal :price :type/Integer]]
              :source-query {:source-table (data/id :venues)}}}
  (tt/with-temp Card [card {:dataset_query {:database (data/id)
                                            :type     :query
                                            :query    {:source-table (data/id :venues)}}}]
    (fetch-source-query {:database database/virtual-id
                         :type     :query
                         :query    {:source-table (str "card__" (u/get-id card))
                                    :aggregation  [:count]
                                    :breakout     [[:field-literal :price :type/Integer]]}})))

;; make sure that the `fetch-source-query` middleware correctly resolves native queries
(expect
  {:database (data/id)
   :type     :query
   :query    {:aggregation  [:count]
              :breakout     [[:field-literal :price :type/Integer]]
              :source-query {:native        (format "SELECT * FROM %s" (data/format-name "venues"))
                             :template_tags nil}}}
  (tt/with-temp Card [card {:dataset_query {:database (data/id)
                                            :type     :native
                                            :native   {:query (format "SELECT * FROM %s" (data/format-name "venues"))}}}]
    (fetch-source-query {:database database/virtual-id
                         :type     :query
                         :query    {:source-table (str "card__" (u/get-id card))
                                    :aggregation  [:count]
                                    :breakout     [[:field-literal :price :type/Integer]]}})))


;; test that the `metabase.query-processor/expand` function properly handles nested queries (this function should call `fetch-source-query`)
(expect
  {:database     {:name "test-data", :id (data/id), :engine :h2}
   :type         :query
   :query        {:source-query {:source-table {:schema "PUBLIC", :name "VENUES", :id (data/id :venues)}
                                 :join-tables  nil}}
   :fk-field-ids #{}}
  (tt/with-temp Card [card {:dataset_query {:database (data/id)
                                            :type     :query
                                            :query    {:source-table (data/id :venues)}}}]
    (-> (qp/expand {:database database/virtual-id
                    :type     :query
                    :query    {:source-table (str "card__" (u/get-id card))}})
        (m/dissoc-in [:database :features])
        (m/dissoc-in [:database :details])
        (m/dissoc-in [:database :timezone]))))

;; make sure that nested nested queries work as expected
(expect
  {:database (data/id)
   :type     :query
   :query    {:limit        25
              :source-query {:limit        50
                             :source-query {:source-table (data/id :venues)
                                            :limit        100}}}}
  (tt/with-temp* [Card [card-1 {:dataset_query {:database (data/id)
                                                :type     :query
                                                :query    {:source-table (data/id :venues), :limit 100}}}]
                  Card [card-2 {:dataset_query {:database database/virtual-id
                                                :type     :query
                                                :query    {:source-table (str "card__" (u/get-id card-1)), :limit 50}}}]]
    ((fetch-source-query/fetch-source-query identity) {:database database/virtual-id
                                                       :type     :query
                                                       :query    {:source-table (str "card__" (u/get-id card-2)), :limit 25}})))

(expect
  {:database     {:name "test-data", :id (data/id), :engine :h2}
   :type         :query
   :query        {:limit        25
                  :source-query {:limit 50
                                 :source-query {:source-table {:schema "PUBLIC", :name "VENUES", :id (data/id :venues)}
                                                :limit        100
                                                :join-tables  nil}}}
   :fk-field-ids #{}}
  (tt/with-temp* [Card [card-1 {:dataset_query {:database (data/id)
                                                :type     :query
                                                :query    {:source-table (data/id :venues), :limit 100}}}]
                  Card [card-2 {:dataset_query {:database database/virtual-id
                                                :type     :query
                                                :query    {:source-table (str "card__" (u/get-id card-1)), :limit 50}}}]]
    (-> (qp/expand {:database database/virtual-id
                    :type     :query
                    :query    {:source-table (str "card__" (u/get-id card-2)), :limit 25}})
        (m/dissoc-in [:database :features])
        (m/dissoc-in [:database :details])
        (m/dissoc-in [:database :timezone]))))
