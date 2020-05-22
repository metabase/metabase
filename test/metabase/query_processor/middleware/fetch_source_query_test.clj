(ns metabase.query-processor.middleware.fetch-source-query-test
  (:require [cheshire.core :as json]
            [clojure
             [set :as set]
             [test :refer :all]]
            [metabase
             [models :refer [Card]]
             [test :as mt]
             [util :as u]]
            [metabase.mbql.schema :as mbql.s]
            [metabase.query-processor.middleware.fetch-source-query :as fetch-source-query]
            [toucan.db :as db]))

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

(deftest resolve-mbql-queries-test
  (testing "make sure that the `resolve-card-id-source-tables` middleware correctly resolves MBQL queries"
    (mt/with-temp Card [card {:dataset_query (mt/mbql-query venues)}]
      (is (= (assoc (default-result-with-inner-query
                     {:source-query {:source-table (mt/id :venues)}})
                    :info {:card-id (u/get-id card)})
             (resolve-card-id-source-tables
              (wrap-inner-query
               {:source-table (str "card__" (u/get-id card))}))))

      (testing "with aggregations/breakouts"
        (is (= (assoc (default-result-with-inner-query
                       {:aggregation  [[:count]]
                        :breakout     [[:field-literal "price" :type/Integer]]
                        :source-query {:source-table (mt/id :venues)}})
                      :info {:card-id (u/get-id card)})
               (resolve-card-id-source-tables
                (wrap-inner-query
                 {:source-table (str "card__" (u/get-id card))
                  :aggregation  [[:count]]
                  :breakout     [[:field-literal "price" :type/Integer]]}))))))

    (mt/with-temp Card [card {:dataset_query (mt/mbql-query checkins)}]
      (testing "with filters"
        (is (= (assoc (default-result-with-inner-query
                       {:source-query {:source-table (mt/id :checkins)}
                        :filter       [:between [:field-literal "date" :type/Date] "2015-01-01" "2015-02-01"]})
                      :info {:card-id (u/get-id card)})
               (resolve-card-id-source-tables
                (wrap-inner-query
                 {:source-table (str "card__" (u/get-id card))
                  :filter       [:between
                                 [:field-literal "date" :type/Date]
                                 "2015-01-01"
                                 "2015-02-01"]}))))))))

(deftest resolve-native-queries-test
  (testing "make sure that the `resolve-card-id-source-tables` middleware correctly resolves native queries"
    (mt/with-temp Card [card {:dataset_query (mt/native-query
                                               {:query (format "SELECT * FROM %s" (mt/format-name "venues"))})}]
      (is (= (assoc (default-result-with-inner-query
                     {:aggregation  [[:count]]
                      :breakout     [[:field-literal "price" :type/Integer]]
                      :source-query {:native (format "SELECT * FROM %s" (mt/format-name "venues"))}})
                    :info {:card-id (u/get-id card)})
             (resolve-card-id-source-tables
              (wrap-inner-query
               {:source-table (str "card__" (u/get-id card))
                :aggregation  [[:count]]
                :breakout     [[:field-literal "price" :type/Integer]]})))))))

;;
(deftest nested-nested-queries-test
  (testing "make sure that nested nested queries work as expected"
    (mt/with-temp* [Card [card-1 {:dataset_query (mt/mbql-query venues
                                                   {:limit 100})}]
                    Card [card-2 {:dataset_query {:database mbql.s/saved-questions-virtual-database-id
                                                  :type     :query
                                                  :query    {:source-table (str "card__" (u/get-id card-1)), :limit 50}}}]]
      (is (= (assoc (default-result-with-inner-query
                     {:limit        25
                      :source-query {:limit           50
                                     :source-query    {:source-table (mt/id :venues)
                                                       :limit        100}
                                     :source-metadata nil}})
                    :info {:card-id (u/get-id card-2)})
             (resolve-card-id-source-tables
              (wrap-inner-query
               {:source-table (str "card__" (u/get-id card-2)), :limit 25})))))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                   JOINS 2.0                                                    |
;;; +----------------------------------------------------------------------------------------------------------------+

;;
(deftest joins-test
  (mt/with-temp Card [{card-id :id} {:dataset_query   (mt/mbql-query categories {:limit 100})
                                     :result_metadata [{:name         "name"
                                                        :display_name "Card Name"
                                                        :base_type    "type/Text"}]}]
    (testing "Are `card__id` source tables resolved in `:joins`?"
      (is (= (mt/mbql-query venues
               {:joins [{:source-query    {:source-table $$categories, :limit 100}
                         :alias           "c",
                         :condition       [:= $category_id [:joined-field "c" $categories.id]]
                         :source-metadata [{:name "name", :display_name "Card Name", :base_type :type/Text}]}]})
             (resolve-card-id-source-tables
              (mt/mbql-query venues
                {:joins [{:source-table (str "card__" card-id)
                          :alias        "c"
                          :condition    [:= $category_id [:joined-field "c" $categories.id]]}]})))))

    (testing "Are `card__id` source tables resolved in JOINs against a source query?"
      (is (= (mt/mbql-query venues
               {:joins [{:source-query {:source-query    {:source-table $$categories, :limit 100}
                                        :source-metadata [{:name "name", :display_name "Card Name", :base_type :type/Text}]}
                         :alias        "c",
                         :condition    [:= $category_id [:joined-field "c" $categories.id]]}]})
             (resolve-card-id-source-tables
              (mt/mbql-query venues
                {:joins [{:source-query {:source-table (str "card__" card-id)}
                          :alias        "c"
                          :condition    [:= $category_id [:joined-field "c" $categories.id]]}]})))))

    (testing "Are `card__id` source tables resolved in JOINs inside nested source queries?"
      (is (= (mt/mbql-query venues
               {:source-query {:source-table $$venues
                               :joins        [{:source-query    {:source-table $$categories
                                                                 :limit        100}
                                               :alias           "c"
                                               :condition       [:= $category_id [:joined-field "c" $categories.id]]
                                               :source-metadata [{:name "name", :display_name "Card Name", :base_type :type/Text}]}]}})
             (resolve-card-id-source-tables
              (mt/mbql-query venues
                {:source-query
                 {:source-table $$venues
                  :joins        [{:source-table (str "card__" card-id)
                                  :alias        "c"
                                  :condition    [:= $category_id [:joined-field "c" $categories.id]]}]}})))))

    (testing "Can we recursively resolve multiple card ID `:source-table`s in Joins?"
      (mt/with-temp Card [{card-2-id :id} {:dataset_query
                                           (mt/mbql-query nil
                                             {:source-table (str "card__" card-id), :limit 200})}]
        (is (= (mt/mbql-query venues
                 {:joins [{:alias           "c"
                           :condition       [:= $category_id &c.$categories.id]
                           :source-query    {:source-query    {:source-table $$categories :limit 100}
                                             :source-metadata [{:name "name", :display_name "Card Name", :base_type :type/Text}]
                                             :limit           200}
                           :source-metadata nil}]})
               (resolve-card-id-source-tables
                (mt/mbql-query venues
                  {:joins [{:source-table (str "card__" card-2-id)
                            :alias        "c"
                            :condition    [:= $category_id &c.categories.id]}]}))))))))

(deftest circular-dependency-test
  (testing "Middleware should throw an Exception if we try to resolve a source query for a card whose source query is itself"
    (mt/with-temp Card [{card-id :id}]
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
          (is (thrown?
               clojure.lang.ExceptionInfo
               (or save-error
                   (resolve-card-id-source-tables circular-source-query))))))))

  (testing "middleware should throw an Exception if we try to resolve a source query card with a source query that refers back to the original"
    (let [circular-source-query (fn [card-id]
                                  {:database (mt/id)
                                   :type     :query
                                   :query    {:source-table (str "card__" card-id)}})]
      ;; Card 1 refers to Card 2, and Card 2 refers to Card 1
      (mt/with-temp* [Card [{card-1-id :id}]
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
          (is (thrown?
               clojure.lang.ExceptionInfo
               (or save-error
                   (resolve-card-id-source-tables (circular-source-query card-1-id))))))))))

;; Alow complex dependency topologies such as:
;;
;;   A
;:   | \
;;   B  |
;;   | /
;;   C
;;
(deftest complex-topologies-test
  (testing "We should allow complex topologies"
    (mt/with-temp* [Card [{card-1-id :id} {:dataset_query (mt/mbql-query venues)}]
                    Card [{card-2-id :id} {:dataset_query (mt/mbql-query nil
                                                            {:source-table (str "card__" card-1-id)})}]]
      (is (some? (resolve-card-id-source-tables
                  (mt/mbql-query nil
                    {:source-table (str "card__" card-1-id)
                     :joins        [{:alias        "c"
                                     :source-table (str "card__" card-2-id)
                                     :condition    [:= *ID/Number &c.venues.id]}]})))))))

(deftest ignore-user-supplied-internal-card-id-keys
  (testing (str "The middleware uses `::fetch-source-query/card-id` internally and adds it to `:info` at the end. "
                "Make sure we ignore ones supplied by a user.")
    (is (= (mt/mbql-query venues)
           (resolve-card-id-source-tables
            (assoc-in (mt/mbql-query venues) [:query ::fetch-source-query/card-id] 1))))))

(deftest dont-overwrite-existing-card-id-test
  (testing "Don't overwrite existing values of `[:info :card-id]`"
    (mt/with-temp Card [{card-id :id} {:dataset_query (mt/mbql-query venues)}]
      (let [query (assoc (mt/mbql-query nil {:source-table (format "card__%d" card-id)})
                         :info {:card-id Integer/MAX_VALUE})]
        (is (= (assoc (mt/mbql-query nil {:source-query    {:source-table (mt/id :venues)}
                                          :source-metadata nil})
                      :info {:card-id Integer/MAX_VALUE})
               (resolve-card-id-source-tables query)))))))

(deftest card-id->source-query-and-metadata-test
  (testing "card-id->source-query-and-metadata-test should trim SQL queries"
    (let [query {:type     :native
                 :native   {:query "SELECT * FROM table\n-- remark"}
                 :database (mt/id)}]
      (mt/with-temp Card [{card-id :id} {:dataset_query query}]
        (is (= {:source-metadata nil
                :source-query    {:native "SELECT * FROM table\n"}
                :database        (mt/id)}
               (#'fetch-source-query/card-id->source-query-and-metadata card-id))))))

  (testing "card-id->source-query-and-metadata-test should preserve non-SQL native queries"
    (let [query {:type     :native
                 :native   {:projections ["_id" "user_id" "venue_id"],
                            :query       [{:$project {:_id "$_id"}}
                                          {:$limit 1048576}]
                            :collection  "checkins"
                            :mbql?       true}
                 :database (mt/id)}]
      (mt/with-temp Card [{card-id :id} {:dataset_query query}]
        (is (= {:source-metadata nil
                :source-query    (set/rename-keys (:native query) {:query :native})
                :database        (mt/id)}
               (#'fetch-source-query/card-id->source-query-and-metadata card-id)))))))
