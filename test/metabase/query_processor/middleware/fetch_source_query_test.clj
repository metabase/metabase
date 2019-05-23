(ns metabase.query-processor.middleware.fetch-source-query-test
  (:require [expectations :refer [expect]]
            [metabase.models
             [card :refer [Card]]
             [database :as database]]
            [metabase.query-processor.middleware.fetch-source-query :as fetch-source-query]
            [metabase.test.data :as data]
            [metabase.util :as u]
            [toucan.util.test :as tt]))

(def ^:private ^{:arglists '([query])} resolve-card-id-source-tables
  (fetch-source-query/resolve-card-id-source-tables identity))

(defn- wrap-inner-query [query]
  {:database     database/virtual-id
   :type         :query
   :query        query})

(defn- default-result-with-inner-query [inner-query]
  {:database (data/id)
   :type     :query
   :query    (assoc inner-query :source-metadata nil)})

;; make sure that the `resolve-card-id-source-tables` middleware correctly resolves MBQL queries
(expect
  (default-result-with-inner-query
   {:aggregation  [[:count]]
    :breakout     [[:field-literal "price" :type/Integer]]
    :source-query {:source-table (data/id :venues)}})
  (tt/with-temp Card [card {:dataset_query {:database (data/id)
                                            :type     :query
                                            :query    {:source-table (data/id :venues)}}}]
    (resolve-card-id-source-tables
     (wrap-inner-query
      {:source-table (str "card__" (u/get-id card))
       :aggregation  [[:count]]
       :breakout     [[:field-literal "price" :type/Integer]]}))))

;; make sure that the `resolve-card-id-source-tables` middleware correctly resolves native queries
(expect
  (default-result-with-inner-query
   {:aggregation  [[:count]]
    :breakout     [[:field-literal "price" :type/Integer]]
    :source-query {:native (format "SELECT * FROM %s" (data/format-name "venues"))}})
  (tt/with-temp Card [card {:dataset_query {:database (data/id)
                                            :type     :native
                                            :native   {:query (format "SELECT * FROM %s" (data/format-name "venues"))}}}]
    (resolve-card-id-source-tables
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
    (resolve-card-id-source-tables
     (wrap-inner-query
      {:source-table (str "card__" (u/get-id card))}))))

(expect
  (default-result-with-inner-query
   {:source-query {:source-table (data/id :checkins)}
    :filter       [:between [:field-literal "date" :type/Date] "2015-01-01" "2015-02-01"]})
  (tt/with-temp Card [card {:dataset_query {:database (data/id)
                                            :type     :query
                                            :query    {:source-table (data/id :checkins)}}}]
    (resolve-card-id-source-tables
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
    (resolve-card-id-source-tables
     (wrap-inner-query
      {:source-table (str "card__" (u/get-id card-2)), :limit 25}))))

(expect
  (default-result-with-inner-query
   {:source-query {:source-query    {:source-table (data/id :venues)
                                     :limit        100}
                   :source-metadata nil
                   :limit           50}
    :limit        25})
  (tt/with-temp* [Card [card-1 {:dataset_query {:database (data/id)
                                                :type     :query
                                                :query    {:source-table (data/id :venues), :limit 100}}}]
                  Card [card-2 {:dataset_query {:database database/virtual-id
                                                :type     :query
                                                :query    {:source-table (str "card__" (u/get-id card-1)), :limit 50}}}]]
    (resolve-card-id-source-tables
     (wrap-inner-query
      {:source-table (str "card__" (u/get-id card-2)), :limit 25}))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                   JOINS 2.0                                                    |
;;; +----------------------------------------------------------------------------------------------------------------+

;; Are `card__id` source tables resolved in `:joins`?
(expect
  (data/mbql-query venues
    {:joins [{:source-query    {:source-table $$categories, :limit 100}
              :alias           "c",
              :condition       [:= $category_id [:joined-field "c" $categories.id]]
              :source-metadata [{:name "name", :display_name "Card Name", :base_type :type/Text}]}]})
  (tt/with-temp Card [{card-id :id} {:dataset_query   (data/mbql-query categories
                                                        {:source-table $$table, :limit 100})
                                     :result_metadata [{:name         "name"
                                                        :display_name "Card Name"
                                                        :base_type    "type/Text"}]}]
    (resolve-card-id-source-tables
     (data/mbql-query venues
       {:joins [{:source-table (str "card__" card-id)
                 :alias        "c"
                 :condition    [:= $category_id [:joined-field "c" $categories.id]]}]}))))

;; Are `card__id` source tables resolved in JOINs against a source query?
(expect
  (data/mbql-query venues
    {:joins [{:source-query {:source-query    {:source-table $$categories, :limit 100}
                             :source-metadata [{:name "name", :display_name "Card Name", :base_type :type/Text}]}
              :alias        "c",
              :condition    [:= $category_id [:joined-field "c" $categories.id]]}]})
  (tt/with-temp Card [{card-id :id} {:dataset_query   (data/mbql-query categories
                                                        {:source-table $$table, :limit 100})
                                     :result_metadata [{:name         "name"
                                                        :display_name "Card Name"
                                                        :base_type    "type/Text"}]}]
    (resolve-card-id-source-tables
     (data/mbql-query venues
       {:joins [{:source-query {:source-table (str "card__" card-id)}
                 :alias        "c"
                 :condition    [:= $category_id [:joined-field "c" $categories.id]]}]}))))

;; ;; Are `card__id` source tables resolved in JOINs inside nested source queries?
(expect
  (data/mbql-query venues
    {:source-query {:source-table $$venues
                    :joins        [{:source-query    {:source-table $$categories
                                                      :limit        100}
                                    :alias           "c"
                                    :condition       [:= $category_id [:joined-field "c" $categories.id]]
                                    :source-metadata [{:name "name", :display_name "Card Name", :base_type :type/Text}]}]}})
  (tt/with-temp Card [{card-id :id} {:dataset_query   (data/mbql-query categories
                                                        {:source-table $$table, :limit 100})
                                     :result_metadata [{:name         "name"
                                                        :display_name "Card Name"
                                                        :base_type    "type/Text"}]}]
    (resolve-card-id-source-tables
     (data/mbql-query venues
       {:source-query
        {:source-table $$venues
         :joins        [{:source-table (str "card__" card-id)
                         :alias        "c"
                         :condition    [:= $category_id [:joined-field "c" $categories.id]]}]}}))))


;; Can we recursively resolve multiple card ID `:source-table`s in Joins?
(expect
  (data/mbql-query venues
    {:joins [{:alias           "c"
              :condition       [:= $category_id [:joined-field "c" $categories.id]]
              :source-query    {:source-query    {:source-table $$categories :limit 20}
                                :source-metadata [{:name "name", :display_name "Card Name", :base_type :type/Text}]
                                :limit           100}
              :source-metadata nil}]})
  (tt/with-temp* [Card [{card-1-id :id} {:dataset_query   (data/mbql-query categories
                                                            {:source-table $$table, :limit 20})
                                         :result_metadata [{:name         "name"
                                                            :display_name "Card Name"
                                                            :base_type    "type/Text"}]}]
                  Card [{card-2-id :id} {:dataset_query
                                         (data/mbql-query nil
                                           {:source-table (str "card__" card-1-id), :limit 100})}]]
    (resolve-card-id-source-tables
     (data/mbql-query venues
       {:joins [{:source-table (str "card__" card-2-id)
                 :alias        "c"
                 :condition    [:= $category_id [:joined-field "c" $categories.id]]}]}))))
