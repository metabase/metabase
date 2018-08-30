(ns metabase.query-processor.middleware.fetch-source-query-test
  (:require [clj-time.coerce :as tcoerce]
            [expectations :refer [expect]]
            [medley.core :as m]
            [metabase
             [query-processor :as qp]
             [util :as u]]
            [metabase.models
             [card :refer [Card]]
             [database :as database]]
            [metabase.query-processor.middleware.fetch-source-query :as fetch-source-query]
            [metabase.test.data :as data]
            [metabase.util.date :as du]
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

(defn- expand-and-scrub [query-map]
  (-> query-map
      qp/expand
      (m/dissoc-in [:database :features])
      (m/dissoc-in [:database :details])
      (m/dissoc-in [:database :timezone])
      (dissoc :driver)))

(defn default-expanded-results [query]
  {:database     {:name "test-data", :id (data/id), :engine :h2}
   :type         :query
   :fk-field-ids #{}
   :query        query})

;; test that the `metabase.query-processor/expand` function properly handles nested queries (this function should call
;; `fetch-source-query`)
(expect
  (default-expanded-results
   {:source-query {:source-table {:schema "PUBLIC", :name "VENUES", :id (data/id :venues)}
                   :join-tables  nil}})
  (tt/with-temp Card [card {:dataset_query {:database (data/id)
                                            :type     :query
                                            :query    {:source-table (data/id :venues)}}}]
    (expand-and-scrub {:database database/virtual-id
                       :type     :query
                       :query    {:source-table (str "card__" (u/get-id card))}})))

(expect
  (let [date-field-literal {:field-name "date", :base-type :type/Date, :binning-strategy nil, :binning-param nil, :fingerprint nil}]
    (default-expanded-results
     {:source-query {:source-table {:schema "PUBLIC" :name "CHECKINS" :id (data/id :checkins)}, :join-tables nil}
      :filter       {:filter-type :between,
                     :field       date-field-literal
                     :min-val     {:value (tcoerce/to-timestamp (du/str->date-time "2015-01-01"))
                                   :field {:field date-field-literal, :unit :default}},
                     :max-val     {:value (tcoerce/to-timestamp (du/str->date-time "2015-02-01"))
                                   :field {:field date-field-literal, :unit :default}}}}))
  (tt/with-temp Card [card {:dataset_query {:database (data/id)
                                            :type     :query
                                            :query    {:source-table (data/id :checkins)}}}]
    (expand-and-scrub {:database database/virtual-id
                       :type     :query
                       :query    {:source-table (str "card__" (u/get-id card))
                                  :filter       ["BETWEEN" ["field-id" ["field-literal" "date" "type/Date"]] "2015-01-01" "2015-02-01"]}})))

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
  (default-expanded-results
   {:limit        25
    :source-query {:limit 50
                   :source-query {:source-table {:schema "PUBLIC", :name "VENUES", :id (data/id :venues)}
                                  :limit        100
                                  :join-tables  nil}}})
  (tt/with-temp* [Card [card-1 {:dataset_query {:database (data/id)
                                                :type     :query
                                                :query    {:source-table (data/id :venues), :limit 100}}}]
                  Card [card-2 {:dataset_query {:database database/virtual-id
                                                :type     :query
                                                :query    {:source-table (str "card__" (u/get-id card-1)), :limit 50}}}]]
    (expand-and-scrub {:database database/virtual-id
                       :type     :query
                       :query    {:source-table (str "card__" (u/get-id card-2)), :limit 25}})))
