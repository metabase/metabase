(ns metabase.query-processor.middleware.fetch-source-query-test
  (:require [cheshire.core :as json]
            [expectations :refer [expect]]
            [metabase
             [models :refer [Card]]
             [test :as mt]
             [util :as u]]
            [metabase.mbql.schema :as mbql.s]
            [metabase.query-processor.middleware.fetch-source-query :as fetch-source-query]
            [toucan.db :as db]
            [toucan.util.test :as tt]))

(defn- resolve-card-id-source-tables [query]
  (:pre (mt/test-qp-middleware fetch-source-query/resolve-card-id-source-tables query)))

(defn- wrap-inner-query [query]
  {:database     mbql.s/saved-questions-virtual-database-id
   :type         :query
   :query        query})

(defn- default-result-with-inner-query [inner-query]
  {:database (mt/id)
   :type     :query
   :query    (assoc inner-query :source-metadata nil)})

;; make sure that the `resolve-card-id-source-tables` middleware correctly resolves MBQL queries
(expect
  (default-result-with-inner-query
   {:aggregation  [[:count]]
    :breakout     [[:field-literal "price" :type/Integer]]
    :source-query {:source-table (mt/id :venues)}})
  (tt/with-temp Card [card {:dataset_query {:database (mt/id)
                                            :type     :query
                                            :query    {:source-table (mt/id :venues)}}}]
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
    :source-query {:native (format "SELECT * FROM %s" (mt/format-name "venues"))}})
  (tt/with-temp Card [card {:dataset_query {:database (mt/id)
                                            :type     :native
                                            :native   {:query (format "SELECT * FROM %s" (mt/format-name "venues"))}}}]
    (resolve-card-id-source-tables
     (wrap-inner-query
      {:source-table (str "card__" (u/get-id card))
       :aggregation  [[:count]]
       :breakout     [[:field-literal "price" :type/Integer]]}))))

(expect
  (default-result-with-inner-query
   {:source-query {:source-table (mt/id :venues)}})
  (tt/with-temp Card [card {:dataset_query {:database (mt/id)
                                            :type     :query
                                            :query    {:source-table (mt/id :venues)}}}]
    (resolve-card-id-source-tables
     (wrap-inner-query
      {:source-table (str "card__" (u/get-id card))}))))

(expect
  (default-result-with-inner-query
   {:source-query {:source-table (mt/id :checkins)}
    :filter       [:between [:field-literal "date" :type/Date] "2015-01-01" "2015-02-01"]})
  (tt/with-temp Card [card {:dataset_query {:database (mt/id)
                                            :type     :query
                                            :query    {:source-table (mt/id :checkins)}}}]
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
    :source-query {:limit           50
                   :source-query    {:source-table (mt/id :venues)
                                     :limit        100}
                   :source-metadata nil}})
  (tt/with-temp* [Card [card-1 {:dataset_query {:database (mt/id)
                                                :type     :query
                                                :query    {:source-table (mt/id :venues), :limit 100}}}]
                  Card [card-2 {:dataset_query {:database mbql.s/saved-questions-virtual-database-id
                                                :type     :query
                                                :query    {:source-table (str "card__" (u/get-id card-1)), :limit 50}}}]]
    (resolve-card-id-source-tables
     (wrap-inner-query
      {:source-table (str "card__" (u/get-id card-2)), :limit 25}))))

(expect
  (default-result-with-inner-query
   {:source-query {:source-query    {:source-table (mt/id :venues)
                                     :limit        100}
                   :source-metadata nil
                   :limit           50}
    :limit        25})
  (tt/with-temp* [Card [card-1 {:dataset_query {:database (mt/id)
                                                :type     :query
                                                :query    {:source-table (mt/id :venues), :limit 100}}}]
                  Card [card-2 {:dataset_query {:database mbql.s/saved-questions-virtual-database-id
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
  (mt/mbql-query venues
    {:joins [{:source-query    {:source-table $$categories, :limit 100}
              :alias           "c",
              :condition       [:= $category_id [:joined-field "c" $categories.id]]
              :source-metadata [{:name "name", :display_name "Card Name", :base_type :type/Text}]}]})
  (tt/with-temp Card [{card-id :id} {:dataset_query   (mt/mbql-query categories {:limit 100})
                                     :result_metadata [{:name         "name"
                                                        :display_name "Card Name"
                                                        :base_type    "type/Text"}]}]
    (resolve-card-id-source-tables
     (mt/mbql-query venues
       {:joins [{:source-table (str "card__" card-id)
                 :alias        "c"
                 :condition    [:= $category_id [:joined-field "c" $categories.id]]}]}))))

;; Are `card__id` source tables resolved in JOINs against a source query?
(expect
  (mt/mbql-query venues
    {:joins [{:source-query {:source-query    {:source-table $$categories, :limit 100}
                             :source-metadata [{:name "name", :display_name "Card Name", :base_type :type/Text}]}
              :alias        "c",
              :condition    [:= $category_id [:joined-field "c" $categories.id]]}]})
  (tt/with-temp Card [{card-id :id} {:dataset_query   (mt/mbql-query categories {:limit 100})
                                     :result_metadata [{:name         "name"
                                                        :display_name "Card Name"
                                                        :base_type    "type/Text"}]}]
    (resolve-card-id-source-tables
     (mt/mbql-query venues
       {:joins [{:source-query {:source-table (str "card__" card-id)}
                 :alias        "c"
                 :condition    [:= $category_id [:joined-field "c" $categories.id]]}]}))))

;; ;; Are `card__id` source tables resolved in JOINs inside nested source queries?
(expect
  (mt/mbql-query venues
    {:source-query {:source-table $$venues
                    :joins        [{:source-query    {:source-table $$categories
                                                      :limit        100}
                                    :alias           "c"
                                    :condition       [:= $category_id [:joined-field "c" $categories.id]]
                                    :source-metadata [{:name "name", :display_name "Card Name", :base_type :type/Text}]}]}})
  (tt/with-temp Card [{card-id :id} {:dataset_query   (mt/mbql-query categories {:limit 100})
                                     :result_metadata [{:name         "name"
                                                        :display_name "Card Name"
                                                        :base_type    "type/Text"}]}]
    (resolve-card-id-source-tables
     (mt/mbql-query venues
       {:source-query
        {:source-table $$venues
         :joins        [{:source-table (str "card__" card-id)
                         :alias        "c"
                         :condition    [:= $category_id [:joined-field "c" $categories.id]]}]}}))))


;; Can we recursively resolve multiple card ID `:source-table`s in Joins?
(expect
  (mt/mbql-query venues
    {:joins [{:alias           "c"
              :condition       [:= $category_id &c.$categories.id]
              :source-query    {:source-query    {:source-table $$categories :limit 20}
                                :source-metadata [{:name "name", :display_name "Card Name", :base_type :type/Text}]
                                :limit           100}
              :source-metadata nil}]})
  (tt/with-temp* [Card [{card-1-id :id} {:dataset_query   (mt/mbql-query categories {:limit 20})
                                         :result_metadata [{:name         "name"
                                                            :display_name "Card Name"
                                                            :base_type    "type/Text"}]}]
                  Card [{card-2-id :id} {:dataset_query
                                         (mt/mbql-query nil
                                           {:source-table (str "card__" card-1-id), :limit 100})}]]
    (resolve-card-id-source-tables
     (mt/mbql-query venues
       {:joins [{:source-table (str "card__" card-2-id)
                 :alias        "c"
                 :condition    [:= $category_id &c.categories.id]}]}))))

;; Middleware should throw an Exception if we try to resolve a source query for a card whose source query is itself
(expect
  clojure.lang.ExceptionInfo
  (tt/with-temp Card [{card-id :id}]
    (let [circular-source-query {:database (mt/id)
                                 :type     :query
                                 :query    {:source-table (str "card__" card-id)}}]
      ;; Make sure save isn't the thing throwing the Exception
      (let [save-error (try
                         ;; `db/update!` will fail because it will try to validate the query when it saves
                         (db/execute! {:update Card
                                       :set    {:dataset_query (json/generate-string circular-source-query)}
                                       :where  [:= :id card-id]})
                         nil
                         (catch Throwable e
                           (str "Failed to save Card:" e)))]
        (or save-error
            (resolve-card-id-source-tables circular-source-query))))))

;; middleware should throw an Exception if we try to resolve a source query card with a source query that refers back
;; to the original
(expect
  clojure.lang.ExceptionInfo
  (let [circular-source-query (fn [card-id]
                                {:database (mt/id)
                                 :type     :query
                                 :query    {:source-table (str "card__" card-id)}})]
    ;; Card 1 refers to Card 2, and Card 2 refers to Card 1
    (tt/with-temp* [Card [{card-1-id :id}]
                    Card [{card-2-id :id} {:dataset_query (circular-source-query card-1-id)}]]
      ;; Make sure save isn't the thing throwing the Exception
      (let [save-error (try
                         ;; `db/update!` will fail because it will try to validate the query when it saves,
                         (db/execute! {:update Card
                                       :set    {:dataset_query (json/generate-string (circular-source-query card-2-id))}
                                       :where  [:= :id card-1-id]})
                         nil
                         (catch Throwable e
                           (str "Failed to save Card:" e)))]
        (or save-error
            (resolve-card-id-source-tables (circular-source-query card-1-id)))))))

;; Alow complex dependency topologies such as:
;;
;;   A
;:   | \
;;   B  |
;;   | /
;;   C
;;
(expect
  (tt/with-temp* [Card [{card-1-id :id} {:dataset_query (mt/mbql-query venues)}]
                  Card [{card-2-id :id} {:dataset_query (mt/mbql-query nil
                                                          {:source-table (str "card__" card-1-id)})}]]
    (resolve-card-id-source-tables
     (mt/mbql-query nil
       {:source-table (str "card__" card-1-id)
        :joins        [{:alias        "c"
                        :source-table (str "card__" card-2-id)
                        :condition    [:= *ID/Number &c.venues.id]}]}))))
