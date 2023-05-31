(ns metabase.query-processor.middleware.fetch-source-query-test
  (:require
   [cheshire.core :as json]
   [clojure.test :refer :all]
   [metabase.mbql.schema :as mbql.s]
   [metabase.models :refer [Card]]
   [metabase.query-processor :as qp]
   [metabase.query-processor.middleware.fetch-source-query
    :as fetch-source-query]
   [metabase.test :as mt]
   [metabase.util :as u]
   [schema.core :as s]
   [toucan2.core :as t2]))

(defn- resolve-card-id-source-tables [query]
  (:pre (mt/test-qp-middleware fetch-source-query/resolve-card-id-source-tables query)))

(defn- wrap-inner-query [query]
  {:database     mbql.s/saved-questions-virtual-database-id
   :type         :query
   :query        query})

(defn- default-result-with-inner-query
  ([inner-query]
   (default-result-with-inner-query inner-query ::infer))

  ([inner-query metadata]
   (let [outer-query {:database (mt/id)
                      :type     :query
                      :query    inner-query}]
     (assoc-in outer-query [:query :source-metadata] (not-empty (mt/derecordize
                                                                 (if (= metadata ::infer)
                                                                   (qp/query->expected-cols outer-query)
                                                                   metadata)))))))

(deftest resolve-mbql-queries-test
  (testing "make sure that the `resolve-card-id-source-tables` middleware correctly resolves MBQL queries"
    (mt/with-temp Card [card {:dataset_query (mt/mbql-query venues)}]
      (is (= (assoc (default-result-with-inner-query
                     {:source-query   {:source-table (mt/id :venues)}
                      :source-card-id (u/the-id card)}
                     (qp/query->expected-cols (mt/mbql-query venues)))
                    :info {:card-id (u/the-id card)})
             (resolve-card-id-source-tables
              (wrap-inner-query
               {:source-table (str "card__" (u/the-id card))}))))

      (testing "with aggregations/breakouts"
        (is (= (assoc (default-result-with-inner-query
                       {:aggregation    [[:count]]
                        :breakout       [[:field "price" {:base-type :type/Integer}]]
                        :source-query   {:source-table (mt/id :venues)}
                        :source-card-id (u/the-id card)}
                       (qp/query->expected-cols (mt/mbql-query venues)))
                      :info {:card-id (u/the-id card)})
               (resolve-card-id-source-tables
                (wrap-inner-query
                 {:source-table (str "card__" (u/the-id card))
                  :aggregation  [[:count]]
                  :breakout     [[:field "price" {:base-type :type/Integer}]]}))))))

    (mt/with-temp Card [card {:dataset_query (mt/mbql-query checkins)}]
      (testing "with filters"
        (is (= (assoc (default-result-with-inner-query
                       {:source-query   {:source-table (mt/id :checkins)}
                        :source-card-id (u/the-id card)
                        :filter         [:between [:field "date" {:base-type :type/Date}] "2015-01-01" "2015-02-01"]}
                       (qp/query->expected-cols (mt/mbql-query checkins)))
                      :info {:card-id (u/the-id card)})
               (resolve-card-id-source-tables
                (wrap-inner-query
                 {:source-table (str "card__" (u/the-id card))
                  :filter       [:between
                                 [:field "date" {:base-type :type/Date}]
                                 "2015-01-01"
                                 "2015-02-01"]})))))))
  (testing "respects `enable-nested-queries` server setting"
    (mt/with-temp* [Card [{card-id :id} {:dataset_query (mt/mbql-query venues)}]]
      (mt/with-temporary-setting-values [enable-nested-queries true]
        (is (some? (resolve-card-id-source-tables
                    (mt/mbql-query nil
                      {:source-table (str "card__" card-id)})))))
      (mt/with-temporary-setting-values [enable-nested-queries false]
        (try (resolve-card-id-source-tables
              (mt/mbql-query nil
                {:source-table (str "card__" card-id)}))
             (is false "Nested queries disabled not honored")
             (catch Exception e
               (is (schema= {:clause {:source-table (s/eq (str "card__" card-id))}}
                            (ex-data e)))))))))

(deftest resolve-native-queries-test
  (testing "make sure that the `resolve-card-id-source-tables` middleware correctly resolves native queries"
    (mt/with-temp Card [card {:dataset_query (mt/native-query
                                               {:query (format "SELECT * FROM %s" (mt/format-name "venues"))})}]
      (is (= (assoc (default-result-with-inner-query
                     {:aggregation    [[:count]]
                      :breakout       [[:field "price" {:base-type :type/Integer}]]
                      :source-query   {:native (format "SELECT * FROM %s" (mt/format-name "venues"))}
                      :source-card-id (u/the-id card)}
                     nil)
                    :info {:card-id (u/the-id card)})
             (resolve-card-id-source-tables
              (wrap-inner-query
               {:source-table (str "card__" (u/the-id card))
                :aggregation  [[:count]]
                :breakout     [[:field "price" {:base-type :type/Integer}]]})))))))

(deftest nested-nested-queries-test
  (testing "make sure that nested nested queries work as expected"
    (mt/with-temp* [Card [card-1 {:dataset_query (mt/mbql-query venues
                                                   {:limit 100})}]
                    Card [card-2 {:dataset_query {:database mbql.s/saved-questions-virtual-database-id
                                                  :type     :query
                                                  :query    {:source-table (str "card__" (u/the-id card-1)), :limit 50}}}]]
      (is (= (-> (default-result-with-inner-query
                  {:limit          25
                   :source-query   {:limit           50
                                    :source-query    {:source-table (mt/id :venues)
                                                      :limit        100}
                                    :source-card-id  (u/the-id card-1)
                                    :source-metadata nil}
                   :source-card-id (u/the-id card-2)}
                  (qp/query->expected-cols (mt/mbql-query venues)))
                 (assoc-in [:query :source-query :source-metadata]
                           (mt/derecordize (qp/query->expected-cols (mt/mbql-query venues))))
                 (assoc :info {:card-id (u/the-id card-2)}))
             (resolve-card-id-source-tables
              (wrap-inner-query
               {:source-table (str "card__" (u/the-id card-2)), :limit 25}))))))
  (testing "Marks datasets as from a dataset"
    (testing "top level dataset queries are marked as such"
      (mt/with-temp* [Card [card {:dataset_query (mt/mbql-query venues {:limit 100})
                                  :dataset       true}]]
        (let [results (qp/process-query {:type     :query
                                         :query    {:source-table (str "card__" (u/the-id card))
                                                    :limit        1}
                                         :database mbql.s/saved-questions-virtual-database-id})]
          (is (= {:dataset true :rows 1}
                 (-> results :data (select-keys [:dataset :rows]) (update :rows count)))))))
    (testing "But not when the dataset is lower than top level"
      (mt/with-temp* [Card [dataset {:dataset_query (mt/mbql-query venues {:limit 100})
                                     :dataset       true}]
                      Card [card    {:dataset_query {:database mbql.s/saved-questions-virtual-database-id
                                                     :type     :query
                                                     :query    {:source-table (str "card__" (u/the-id dataset))}}}]]
        (let [results (qp/process-query {:type     :query
                                         :query    {:source-table (str "card__" (u/the-id card))
                                                    :limit        1}
                                         :database mbql.s/saved-questions-virtual-database-id})]
          (is (= {:rows 1}
                 (-> results :data (select-keys [:dataset :rows]) (update :rows count)))))))))



;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                   JOINS 2.0                                                    |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- clean-metadata
  "The metadata that comes back gets merged quite a bit. In these tests we only assert on the field_ref leave for other
  tests the actual contents of the metadata."
  [results]
  (letfn [(clean [sm] (map #(select-keys % [:field_ref]) sm))]
   (update-in results [:query :joins]
              (fn [joins]
                (map (fn [join] (update join :source-metadata clean))
                     joins)))))

(deftest joins-test
  (let [metadata [{:name         "ID"
                   :display_name "Card ID"
                   :base_type    :type/Integer
                   :field_ref    [:field (mt/id :categories :id) nil]}
                  {:name         "name"
                   :display_name "Card Name"
                   :base_type    :type/Text
                   :field_ref    [:field (mt/id :categories :name) nil]}]]
    (mt/with-temp Card [{card-id :id} {:dataset_query   (mt/mbql-query categories {:limit 100})
                                       :result_metadata metadata}]
      (testing "Are `card__id` source tables resolved in `:joins`?"
        (is (= (mt/mbql-query venues
                 {:joins [{:source-query    {:source-table $$categories, :limit 100}
                           :source-card-id  card-id
                           :alias           "c",
                           :condition       [:= $category_id [:field %categories.id {:join-alias "c"}]]
                           :source-metadata metadata}]})
               (resolve-card-id-source-tables
                (mt/mbql-query venues
                  {:joins [{:source-table (str "card__" card-id)
                            :alias        "c"
                            :condition    [:= $category_id [:field %categories.id {:join-alias "c"}]]}]})))))

      (testing "Are `card__id` source tables resolved in JOINs against a source query?"
        (is (= (mt/mbql-query venues
                 {:joins [{:source-query {:source-query    {:source-table $$categories, :limit 100}
                                          :source-card-id  card-id
                                          :source-metadata metadata}
                           :alias        "c",
                           :condition    [:= $category_id [:field %categories.id {:join-alias "c"}]]}]})
               (resolve-card-id-source-tables
                (mt/mbql-query venues
                  {:joins [{:source-query {:source-table (str "card__" card-id)}
                            :alias        "c"
                            :condition    [:= $category_id [:field %categories.id {:join-alias "c"}]]}]})))))

      (testing "Are `card__id` source tables resolved in JOINs inside nested source queries?"
        (is (= (mt/mbql-query venues
                 {:source-query {:source-table $$venues
                                 :joins        [{:source-query    {:source-table $$categories
                                                                   :limit        100}
                                                 :source-card-id  card-id
                                                 :alias           "c"
                                                 :condition       [:= $category_id [:field %categories.id {:join-alias "c"}]]
                                                 :source-metadata metadata}]}})
               (resolve-card-id-source-tables
                (mt/mbql-query venues
                  {:source-query
                   {:source-table $$venues
                    :joins        [{:source-table (str "card__" card-id)
                                    :alias        "c"
                                    :condition    [:= $category_id [:field %categories.id {:join-alias "c"}]]}]}})))))

      (testing "Can we recursively resolve multiple card ID `:source-table`s in Joins?"
        (mt/with-temp Card [{card-2-id :id} {:dataset_query
                                             (mt/mbql-query nil
                                               {:source-table (str "card__" card-id), :limit 200})}]
          (is (= (mt/mbql-query venues
                   {:joins [{:alias           "c"
                             :condition       [:= $category_id &c.$categories.id]
                             :source-query    {:source-query    {:source-table $$categories
                                                                 :limit        100}
                                               :source-card-id  card-id
                                               :source-metadata metadata
                                               :limit           200}
                             :source-card-id  card-2-id
                             :source-metadata (map #(select-keys % [:field_ref]) metadata)}]})
                 (clean-metadata
                  (resolve-card-id-source-tables
                   (mt/mbql-query venues
                     {:joins [{:source-table (str "card__" card-2-id)
                               :alias        "c"
                               :condition    [:= $category_id &c.categories.id]}]}))))))))))

(deftest circular-dependency-test
  (testing "Middleware should throw an Exception if we try to resolve a source query for a card whose source query is itself"
    (mt/with-temp Card [{card-id :id}]
      (let [circular-source-query {:database (mt/id)
                                   :type     :query
                                   :query    {:source-table (str "card__" card-id)}}
            save-error            (try
                                    ;; `t2/update!` will fail because it will try to validate the query when it saves
                                    (t2/query-one {:update :report_card
                                                   :set    {:dataset_query (json/generate-string circular-source-query)}
                                                   :where  [:= :id card-id]})
                                    nil
                                    (catch Throwable e
                                      (str "Failed to save Card:" e)))]
        ;; Make sure save isn't the thing throwing the Exception
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"Circular dependency"
             (or save-error
                 (resolve-card-id-source-tables circular-source-query)))))))

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
                           ;; `t2/update!` will fail because it will try to validate the query when it saves,
                           (t2/query-one {:update :report_card
                                          :set    {:dataset_query (json/generate-string (circular-source-query card-2-id))}
                                          :where  [:= :id card-1-id]})
                           nil
                           (catch Throwable e
                             (str "Failed to save Card:" e)))]
          (is (thrown-with-msg?
               clojure.lang.ExceptionInfo
               #"Circular dependency"
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
  (testing (str "The middleware uses `:source-card-id` internally and adds it to `:info` at the end. "
                "Make sure we ignore ones supplied by a user.")
    (is (= (mt/mbql-query venues)
           (resolve-card-id-source-tables
            (assoc-in (mt/mbql-query venues) [:query :source-card-id] 1))))))

(deftest dont-overwrite-existing-card-id-test
  (testing "Don't overwrite existing values of `[:info :card-id]`"
    (mt/with-temp Card [{card-id :id} {:dataset_query (mt/mbql-query venues)}]
      (let [query (assoc (mt/mbql-query nil {:source-table (format "card__%d" card-id)})
                         :info {:card-id Integer/MAX_VALUE})]
        (is (= (assoc (mt/mbql-query nil {:source-query    {:source-table (mt/id :venues)}
                                          :source-card-id  card-id
                                          :source-metadata (mt/derecordize (qp/query->expected-cols (mt/mbql-query venues)))})
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
                                          {:$limit 1048575}]
                            :collection  "checkins"
                            :mbql?       true}
                 :database (mt/id)}]
      (mt/with-temp Card [{card-id :id} {:dataset_query query}]
        (is (= {:source-metadata nil
                :source-query    {:projections ["_id" "user_id" "venue_id"],
                                  :native      {:collection "checkins"
                                                :query [{:$project {:_id "$_id"}}
                                                        {:$limit 1048575}]}
                                  :collection  "checkins"
                                  :mbql?       true}
                :database        (mt/id)}
               (#'fetch-source-query/card-id->source-query-and-metadata card-id))))))
  (testing "card-id->source-query-and-metadata-test should preserve mongodb native queries in string format (#30112)"
    (let [query-str (str "[{\"$project\":\n"
                         "   {\"_id\":\"$_id\",\n"
                         "    \"user_id\":\"$user_id\",\n"
                         "    \"venue_id\": \"$venue_id\"}},\n"
                         " {\"$limit\": 1048575}]")
          query {:type     :native
                 :native   {:query query-str
                            :collection  "checkins"}
                 :database (mt/id)}]
      (mt/with-temp Card [{card-id :id} {:dataset_query query}]
        (is (= {:source-metadata nil
                :source-query    {:native      {:collection "checkins"
                                                :query      query-str}
                                  :collection  "checkins"}
                :database        (mt/id)}
               (#'fetch-source-query/card-id->source-query-and-metadata card-id)))))))
