(ns metabase.query-processor.middleware.fetch-source-query-test
  (:require
   [clojure.test :refer :all]
   [medley.core :as m]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib-be.metadata.jvm :as lib.metadata.jvm]
   [metabase.lib.convert :as lib.convert]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.query :as lib.query]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]
   [metabase.lib.test-util.macros :as lib.tu.macros]
   [metabase.query-processor :as qp]
   [metabase.query-processor.middleware.fetch-source-query :as fetch-source-query]
   [metabase.query-processor.preprocess :as qp.preprocess]
   [metabase.query-processor.store :as qp.store]
   [metabase.query-processor.test-util :as qp.test-util]
   [metabase.test :as mt]))

(defn resolve-source-cards* [query]
  ;; Handle old tests written with legacy queries. Convert legacy query to pMBQL and then convert results
  ;; back. That way we don't need to update all the tests immediately and can do so at our leisure.
  (letfn [(thunk [] (let [mlv2-query (lib.query/query (qp.store/metadata-provider) query)
                          resolved   (fetch-source-query/resolve-source-cards mlv2-query)]
                      (cond-> resolved
                        (not (:lib/type query)) lib.convert/->legacy-MBQL)))]
    (if (qp.store/initialized?)
      (thunk)
      (qp.store/with-metadata-provider meta/metadata-provider
        (thunk)))))

(defn- resolve-source-cards [query & {:keys [enable-nested-queries?]}]
  (if (false? enable-nested-queries?)
    (mt/with-temp-env-var-value! ["MB_ENABLE_NESTED_QUERIES" "false"]
      (resolve-source-cards* query))
    (resolve-source-cards* query)))

(defn- wrap-inner-query [query]
  {:database lib.schema.id/saved-questions-virtual-database-id
   :type     :query
   :query    query})

(defn- remove-irrelevant-keys [col]
  (as-> col col
    (dissoc col :field_ref)
    (m/filter-keys simple-keyword? col)))

(defn- default-result-with-inner-query
  ([inner-query]
   (default-result-with-inner-query inner-query ::infer))

  ([inner-query metadata]
   (let [outer-query     {:database (meta/id)
                          :type     :query
                          :query    inner-query}
         result-metadata (not-empty (for [col (if (= metadata ::infer)
                                                (qp.preprocess/query->expected-cols outer-query)
                                                metadata)]
                                      (remove-irrelevant-keys col)))]
     (cond-> outer-query
       result-metadata
       (assoc-in [:query :source-metadata] result-metadata)))))

(def ^:private mock-metadata-provider
  (qp.test-util/metadata-provider-with-cards-with-metadata-for-queries
   meta/metadata-provider
   [(lib.tu.macros/mbql-query venues)
    (lib.tu.macros/mbql-query checkins)]))

(deftest ^:parallel resolve-mbql-queries-test
  (testing "make sure that the `resolve-source-cards` middleware correctly resolves MBQL queries"
    (qp.store/with-metadata-provider mock-metadata-provider
      (is (=? (assoc (default-result-with-inner-query
                      {:source-query {:source-table (meta/id :venues)}}
                      (qp.preprocess/query->expected-cols (lib.tu.macros/mbql-query venues)))
                     :info {:card-id 1}
                     :qp/source-card-id 1)
              (resolve-source-cards
               (wrap-inner-query
                {:source-table "card__1"})))))))

(deftest ^:parallel resolve-mbql-queries-test-2
  (testing "make sure that the `resolve-source-cards` middleware correctly resolves MBQL queries"
    (qp.store/with-metadata-provider mock-metadata-provider
      (testing "with aggregations/breakouts"
        (is (=? (assoc (default-result-with-inner-query
                        {:aggregation  [[:count]]
                         :breakout     [[:field "price" {:base-type :type/Integer}]]
                         :source-query {:source-table (meta/id :venues)}}
                        (qp.preprocess/query->expected-cols (lib.tu.macros/mbql-query venues)))
                       :info {:card-id 1}
                       :qp/source-card-id 1)
                (resolve-source-cards
                 (wrap-inner-query
                  {:source-table "card__1"
                   :aggregation  [[:count]]
                   :breakout     [[:field "price" {:base-type :type/Integer}]]}))))))))

(deftest ^:parallel resolve-mbql-queries-test-3
  (testing "make sure that the `resolve-source-cards` middleware correctly resolves MBQL queries"
    (qp.store/with-metadata-provider mock-metadata-provider
      (testing "with filters"
        (is (=? (assoc (default-result-with-inner-query
                        {:source-query {:source-table (meta/id :checkins)}
                         :filter       [:between [:field "date" {:base-type :type/Date}] "2015-01-01" "2015-02-01"]}
                        (qp.preprocess/query->expected-cols (lib.tu.macros/mbql-query checkins)))
                       :info {:card-id 2}
                       :qp/source-card-id 2)
                (resolve-source-cards
                 (wrap-inner-query
                  {:source-table "card__2"
                   :filter       [:between
                                  [:field "date" {:base-type :type/Date}]
                                  "2015-01-01"
                                  "2015-02-01"]}))))))))

(deftest resolve-mbql-queries-test-4
  (testing "respects `enable-nested-queries` server setting when true"
    (qp.store/with-metadata-provider mock-metadata-provider
      ;; by default nested queries are enabled:
      (is (true? (lib-be/enable-nested-queries)))
      (is (some? (resolve-source-cards (lib.tu.macros/mbql-query nil {:source-table "card__1"})))))))

(deftest resolve-mbql-queries-test-5
  (testing "respects `enable-nested-queries` server setting when false"
    ;; if the env var is set, the setting respects it:
    (mt/with-temp-env-var-value! ["MB_ENABLE_NESTED_QUERIES" "false"]
      (is (false? (lib-be/enable-nested-queries))))
    (qp.store/with-metadata-provider mock-metadata-provider

;; resolve-source-cards doesn't respect [[mt/with-temp-env-var-value!]], so set it inside the thunk:
      (is (thrown-with-msg? Exception
                            #"Nested queries are disabled"
                            (resolve-source-cards
                             {:database (meta/id), :type :query, :query {:source-table "card__1"}}
                             :enable-nested-queries? false))
          "Nested queries disabled not honored, lib.tu.macros/mbql-query should have thrown an exception."))))

(deftest ^:parallel resolve-native-queries-test
  (testing "make sure that the `resolve-source-cards` middleware correctly resolves native queries"
    (qp.store/with-metadata-provider (lib.tu/metadata-provider-with-cards-for-queries
                                      meta/metadata-provider
                                      [(:dataset-query (:venues/native (lib.tu/mock-cards)))])
      (is (=? (assoc (default-result-with-inner-query
                      {:aggregation  [[:count]]
                       :breakout     [[:field "price" {:base-type :type/Integer}]]
                       :source-query {:native "SELECT * FROM venues"}}
                      nil)
                     :info {:card-id 1}
                     :qp/source-card-id 1)
              (resolve-source-cards
               (wrap-inner-query
                {:source-table "card__1"
                 :aggregation  [[:count]]
                 :breakout     [[:field "price" {:base-type :type/Integer}]]})))))))

(defn- nested-nested-provider []
  (qp.test-util/metadata-provider-with-cards-with-metadata-for-queries
   meta/metadata-provider
   [(lib.tu.macros/mbql-query venues {:limit 100})
    {:database lib.schema.id/saved-questions-virtual-database-id
     :type     :query
     :query    {:source-table "card__1"
                :limit        50}}]))

(deftest ^:parallel nested-nested-queries-test
  (testing "make sure that nested nested queries work as expected"
    (qp.store/with-metadata-provider (nested-nested-provider)
      (is (=? (-> (default-result-with-inner-query
                   {:limit        25
                    :source-query {:limit           50
                                   :source-query    {:source-table (meta/id :venues)
                                                     :limit        100}
                                   :source-metadata nil}}
                   (qp.preprocess/query->expected-cols (lib.tu.macros/mbql-query venues)))
                  (assoc-in [:query :source-query :source-metadata]
                            (for [col (qp.preprocess/query->expected-cols (lib.tu.macros/mbql-query venues))]
                              (remove-irrelevant-keys col)))
                  (assoc :info {:card-id 2}
                         :qp/source-card-id 2))
              (resolve-source-cards
               (wrap-inner-query
                {:source-table "card__2", :limit 25})))))))

(defn- nested-nested-app-db-provider []
  (let [base     (-> (lib.metadata.jvm/application-database-metadata-provider (mt/id))
                     (qp.test-util/metadata-provider-with-cards-with-metadata-for-queries
                      [(mt/mbql-query venues {:limit 100})
                       {:database lib.schema.id/saved-questions-virtual-database-id
                        :type     :query
                        :query    {:source-table "card__1"
                                   :limit        50}}]))
        card     (lib.metadata/card base 1)
        metadata (:result-metadata card)]
    (lib.tu/merged-mock-metadata-provider base {:cards [{:id              1
                                                         :type            :model
                                                         :result-metadata metadata}]})))

(deftest ^:parallel nested-nested-queries-test-2
  (testing "Marks datasets as from a dataset"
    (testing "top level dataset queries are marked as such"
      (qp.store/with-metadata-provider (nested-nested-app-db-provider)
        (let [results (qp/process-query {:type     :query
                                         :query    {:source-table "card__1"
                                                    :limit        1}
                                         :database lib.schema.id/saved-questions-virtual-database-id})]
          (is (=? {:dataset true        ; TODO -- remove the `:dataset` key
                   :rows    1
                   :model   true}
                  (-> results :data (update :rows count)))))))))

(deftest ^:parallel nested-nested-queries-test-3
  (testing "Marks datasets as from a dataset"
    (testing "But not when the dataset is lower than top level"
      (qp.store/with-metadata-provider (nested-nested-app-db-provider)
        (let [results (qp/process-query {:type     :query
                                         :query    {:source-table "card__2"
                                                    :limit        1}
                                         :database lib.schema.id/saved-questions-virtual-database-id})]
          (is (= {:rows 1}
                 (-> results :data (select-keys [:dataset :rows]) (update :rows count)))))))))

(defn- clean-metadata
  "The metadata that comes back gets merged quite a bit. In these tests we only assert on the field_ref leave for other
  tests the actual contents of the metadata."
  [results]
  (letfn [(clean [sm] (map #(select-keys % [:field_ref]) sm))]
    (update-in results [:query :joins]
               (fn [joins]
                 (map (fn [join] (update join :source-metadata clean))
                      joins)))))

(def ^:private joins-metadata
  [{:name         "ID"
    :display_name "Card ID"
    :base_type    :type/Integer}
   {:name         "name"
    :display_name "Card Name"
    :base_type    :type/Text}])

(def ^:private joins-metadata-provider
  (-> meta/metadata-provider
      (lib.tu/metadata-provider-with-cards-for-queries [(lib.tu.macros/mbql-query categories {:limit 100})])
      (lib.tu/merged-mock-metadata-provider {:cards [{:id 1, :result-metadata joins-metadata}]})))

(deftest ^:parallel joins-test
  (qp.store/with-metadata-provider joins-metadata-provider
    (testing "Are `card__id` source tables resolved in `:joins`?"
      (is (=? (lib.tu.macros/mbql-query venues
                {:joins [{:source-query {:source-query    {:source-table $$categories, :limit 100}
                                         :source-metadata joins-metadata}
                          :alias        "c"
                          :condition    [:= $category-id [:field %categories.id {:join-alias "c"}]]}]})
              (resolve-source-cards
               (lib.tu.macros/mbql-query venues
                 {:joins [{:source-table "card__1"
                           :alias        "c"
                           :condition    [:= $category-id [:field %categories.id {:join-alias "c"}]]}]})))))))

(deftest ^:parallel joins-test-2
  (qp.store/with-metadata-provider joins-metadata-provider
    (testing "Are `card__id` source tables resolved in JOINs against a source query?"
      (is (=? (lib.tu.macros/mbql-query venues
                {:joins [{:source-query {:source-query    {:source-table $$categories, :limit 100}
                                         :source-metadata joins-metadata}
                          :alias        "c"
                          :condition    [:= $category-id [:field %categories.id {:join-alias "c"}]]}]})
              (resolve-source-cards
               (lib.tu.macros/mbql-query venues
                 {:joins [{:source-query {:source-table "card__1"}
                           :alias        "c"
                           :condition    [:= $category-id [:field %categories.id {:join-alias "c"}]]}]})))))))

(deftest ^:parallel joins-test-3
  (qp.store/with-metadata-provider joins-metadata-provider
    (testing "Are `card__id` source tables resolved in JOINs inside nested source queries?"
      (is (=? (lib.tu.macros/mbql-query venues
                {:source-query {:source-table $$venues
                                :joins        [{:source-query {:source-query    {:source-table $$categories
                                                                                 :limit        100}
                                                               :source-metadata joins-metadata}
                                                :alias        "c"
                                                :condition    [:= $category-id [:field %categories.id {:join-alias "c"}]]}]}})
              (resolve-source-cards
               (lib.tu.macros/mbql-query venues
                 {:source-query
                  {:source-table $$venues
                   :joins        [{:source-table "card__1"
                                   :alias        "c"
                                   :condition    [:= $category-id [:field %categories.id {:join-alias "c"}]]}]}})))))))

(deftest ^:parallel joins-test-4
  (qp.store/with-metadata-provider (lib.tu/mock-metadata-provider
                                    joins-metadata-provider
                                    (qp.store/with-metadata-provider joins-metadata-provider
                                      {:cards [(let [query (lib.tu.macros/mbql-query nil
                                                             {:source-table "card__1", :limit 200})]
                                                 {:id              2
                                                  :name            "Card 2"
                                                  :database-id     (meta/id)
                                                  :dataset-query   query
                                                  :result-metadata (qp.preprocess/query->expected-cols query)})]}))
    (testing "Can we recursively resolve multiple card ID `:source-table`s in Joins?"
      (is (=? (lib.tu.macros/mbql-query venues
                {:joins [{:alias        "c"
                          :condition    [:= $category-id &c.$categories.id]
                          :source-query {:source-query    {:source-query    {:source-table $$categories
                                                                             :limit        100}
                                                           :source-metadata joins-metadata
                                                           :limit           200}
                                         :source-metadata [{} {}]}}]})
              (clean-metadata
               (resolve-source-cards
                (lib.tu.macros/mbql-query venues
                  {:joins [{:source-table "card__2"
                            :alias        "c"
                            :condition    [:= $category-id &c.categories.id]}]}))))))))

(deftest ^:parallel circular-dependency-test
  (testing "Middleware should throw an Exception if we try to resolve a source query for a card whose source query is itself"
    (let [query {:database (meta/id)
                 :type     :query
                 :query    {:source-table "card__1"}}]
      (qp.store/with-metadata-provider (lib.tu/metadata-provider-with-cards-for-queries
                                        meta/metadata-provider
                                        [query])
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"Circular dependency between \"Card 1\" and \"Card 1\""
             (resolve-source-cards query)))))))

(deftest ^:parallel circular-dependency-test-2
  (testing (str "middleware should throw an Exception if we try to resolve a source query card with a source query "
                "that refers back to the original")
    ;; Card 1 refers to Card 2, and Card 2 refers to Card 1
    (qp.store/with-metadata-provider (lib.tu/metadata-provider-with-cards-for-queries
                                      meta/metadata-provider
                                      [{:database (meta/id)
                                        :type     :query
                                        :query    {:source-table "card__2"}}
                                       {:database (meta/id)
                                        :type     :query
                                        :query    {:source-table "card__1"}}])
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"Circular dependency between \"Card 1\" and \"Card 2\""
           (resolve-source-cards {:database (meta/id)
                                  :type     :query
                                  :query    {:source-table "card__2"}}))))))

;; Alow complex dependency topologies such as:
;;
;;   A
;:   | \
;;   B  |
;;   | /
;;   C
;;
(deftest ^:parallel complex-topologies-test
  (testing "We should allow complex topologies"
    (qp.store/with-metadata-provider (lib.tu/metadata-provider-with-cards-for-queries
                                      meta/metadata-provider
                                      [(lib.tu.macros/mbql-query venues)
                                       {:database (meta/id)
                                        :type     :query
                                        :query    {:source-table "card__1"}}])
      (is (some? (resolve-source-cards
                  (lib.tu.macros/mbql-query nil
                    {:source-table "card__1"
                     :joins        [{:alias        "c"
                                     :source-table "card__2"
                                     :condition    [:= *ID/Number &c.venues.id]}]})))))))

(deftest ^:parallel dont-overwrite-existing-card-id-test
  (testing "Don't overwrite existing values of `[:info :card-id]`"
    (qp.store/with-metadata-provider mock-metadata-provider
      (let [query (assoc (lib.tu.macros/mbql-query nil {:source-table "card__1"})
                         :info {:card-id Integer/MAX_VALUE})]
        (is (=? (assoc (lib.tu.macros/mbql-query nil
                         {:source-query    {:source-table (meta/id :venues)}
                          :source-metadata (for [col (qp.preprocess/query->expected-cols (lib.tu.macros/mbql-query venues))]
                                             (remove-irrelevant-keys col))})
                       :info {:card-id Integer/MAX_VALUE}
                       :qp/source-card-id 1)
                (resolve-source-cards query)))))))

;;; this is a proof-of-concept to make sure this stuff works for non-SQL drivers, that's why we're hardcoding `:mongo`
;;; below.
#_{:clj-kondo/ignore [:metabase/disallow-hardcoded-driver-names-in-tests]}
(deftest ^:parallel card-id->source-query-and-metadata-test
  (testing "card-id->source-query-and-metadata-test should preserve non-SQL native queries"
    (let [query {:type     :native
                 :native   {:projections ["_id" "user_id" "venue_id"]
                            :query       [{:$project {:_id "$_id"}}
                                          {:$limit 1048575}]
                            :collection  "checkins"
                            :mbql?       true}
                 :database (meta/id)}]
      ;; this doesn't actually need to load Mongo code, there is special casing for `:mongo`
      ;; in [[metabase.query-processor.middleware.fetch-source-query/source-query]]
      (qp.store/with-metadata-provider (-> meta/metadata-provider
                                           (lib.tu/merged-mock-metadata-provider {:database {:engine :mongo}})
                                           (lib.tu/metadata-provider-with-cards-for-queries [query]))
        (is (=? {:stages            [{:lib/type                     :mbql.stage/native
                                      :projections                  ["_id" "user_id" "venue_id"]
                                      :collection                   "checkins"
                                      :mbql?                        true
                                      :native                       [{:$project {:_id "$_id"}} {:$limit 1048575}]
                                      :qp/stage-is-from-source-card 1}
                                     {:lib/type                 :mbql.stage/mbql
                                      :qp/stage-had-source-card 1}]
                 :qp/source-card-id 1
                 :info              {:card-id 1}}
                (resolve-source-cards (lib/query (qp.store/metadata-provider) (lib.metadata/card (qp.store/metadata-provider) 1)))))))))

;;; this is a proof-of-concept to make sure this stuff works for non-SQL drivers, that's why we're hardcoding `:mongo`
;;; below.
#_{:clj-kondo/ignore [:metabase/disallow-hardcoded-driver-names-in-tests]}
(deftest ^:parallel card-id->source-query-and-metadata-test-2
  (testing "card-id->source-query-and-metadata-test should preserve mongodb native queries in string format (#30112)"
    (let [query-str (str "[{\"$project\":\n"
                         "   {\"_id\":\"$_id\",\n"
                         "    \"user_id\":\"$user_id\",\n"
                         "    \"venue_id\": \"$venue_id\"}},\n"
                         " {\"$limit\": 1048575}]")
          query     {:type     :native
                     :native   {:query      query-str
                                :collection "checkins"}
                     :database (meta/id)}]
      (qp.store/with-metadata-provider (-> meta/metadata-provider
                                           (lib.tu/merged-mock-metadata-provider {:database {:engine :mongo}})
                                           (lib.tu/metadata-provider-with-cards-for-queries [query]))
        (is (=? {:stages [{:lib/type   :mbql.stage/native
                           :collection "checkins"
                           :native     query-str}
                          {:lib/type :mbql.stage/mbql}]
                 :info   {:card-id 1}}
                (resolve-source-cards (lib/query (qp.store/metadata-provider) (lib.metadata/card (qp.store/metadata-provider) 1)))))))))

(deftest ^:parallel remove-card-id-key-test
  (testing "Strip out the :qp/source-card-id key for queries that don't have a source card"
    (qp.store/with-metadata-provider meta/metadata-provider
      (is (= {:database (meta/id)
              :type     :query
              :query    {:source-table (meta/id :venues)}}
             (resolve-source-cards
              {:database                           (meta/id)
               :type                               :query
               :query                              {:source-table (meta/id :venues)}
               :qp/source-card-id 1}))))))
