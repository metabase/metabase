(ns metabase.query-processor.middleware.results-metadata-test
  (:require [clojure.string :as str]
            [clojure.test :refer :all]
            [metabase.mbql.schema :as mbql.s]
            [metabase.models :refer [Card Collection Dimension]]
            [metabase.models.permissions :as perms]
            [metabase.models.permissions-group :as perms-group]
            [metabase.query-processor :as qp]
            [metabase.query-processor.util :as qp.util]
            [metabase.sync.analyze.query-results :as qr]
            [metabase.test :as mt]
            [metabase.test.mock.util :as mock.util]
            [metabase.test.util :as tu]
            [metabase.util :as u]
            [metabase.util.schema :as su]
            [schema.core :as s]
            [toucan.db :as db]))

(use-fixtures :each (fn [thunk]
                      (mt/suppress-output (thunk))))

(defn- card-metadata [card]
  (db/select-one-field :result_metadata Card :id (u/the-id card)))

(defn- round-to-2-decimals
  "Defaults `mt/round-all-decimals` to 2 digits"
  [data]
  (mt/round-all-decimals 2 data))

(def ^:private default-card-results
  [{:name         "ID"
    :display_name "ID"
    :base_type    :type/BigInteger
    :effective_type :type/BigInteger
    :semantic_type :type/PK
    :fingerprint  (:id mock.util/venue-fingerprints)
    :field_ref    [:field "ID" {:base-type :type/BigInteger}]}
   {:name         "NAME"
    :display_name "Name"
    :base_type    :type/Text
    :effective_type :type/Text
    :semantic_type :type/Name
    :fingerprint  (:name mock.util/venue-fingerprints)
    :field_ref    [:field "NAME" {:base-type :type/Text}]}
   {:name         "PRICE"
    :display_name "Price"
    :base_type    :type/Integer
    :effective_type :type/Integer
    :semantic_type nil
    :fingerprint  (:price mock.util/venue-fingerprints)
    :field_ref    [:field "PRICE" {:base-type :type/Integer}]}
   {:name         "CATEGORY_ID"
    :display_name "Category ID"
    :base_type    :type/Integer
    :effective_type :type/Integer
    :semantic_type nil
    :fingerprint  (:category_id mock.util/venue-fingerprints)
    :field_ref    [:field "CATEGORY_ID" {:base-type :type/Integer}]}
   {:name         "LATITUDE"
    :display_name "Latitude"
    :base_type    :type/Float
    :effective_type :type/Float
    :semantic_type :type/Latitude
    :fingerprint  (:latitude mock.util/venue-fingerprints)
    :field_ref    [:field "LATITUDE" {:base-type :type/Float}]}
   {:name         "LONGITUDE"
    :display_name "Longitude"
    :base_type    :type/Float
    :effective_type :type/Float
    :semantic_type :type/Longitude
    :fingerprint  (:longitude mock.util/venue-fingerprints)
    :field_ref    [:field "LONGITUDE" {:base-type :type/Float}]}])

(def ^:private default-card-results-native
  (for [column (-> default-card-results
                   (update-in [3 :fingerprint] assoc :type {:type/Number {:min 2.0, :max 74.0, :avg 29.98, :q1 7.0, :q3 49.0 :sd 23.06}}))]
    (assoc column :display_name (:name column))))

(deftest save-result-metadata-test
  (testing "test that Card result metadata is saved after running a Card"
    (mt/with-temp Card [card]
      (let [result (qp/process-userland-query
                    (assoc (mt/native-query {:query "SELECT ID, NAME, PRICE, CATEGORY_ID, LATITUDE, LONGITUDE FROM VENUES"})
                           :info {:card-id    (u/the-id card)
                                  :query-hash (qp.util/query-hash {})}))]
        (when-not (= :completed (:status result))
          (throw (ex-info "Query failed." result))))
      (is (= default-card-results-native
             (-> card card-metadata round-to-2-decimals tu/round-fingerprint-cols)))))

  (testing "check that using a Card as your source doesn't overwrite the results metadata..."
    (mt/with-temp Card [card {:dataset_query   (mt/native-query {:query "SELECT * FROM VENUES"})
                              :result_metadata [{:name "NAME", :display_name "Name", :base_type :type/Text}]}]
      (let [result (qp/process-userland-query {:database mbql.s/saved-questions-virtual-database-id
                                               :type     :query
                                               :query    {:source-table (str "card__" (u/the-id card))}})]
        (is (partial= {:status :completed}
                      result)))
      (is (= [{:name "NAME", :display_name "Name", :base_type :type/Text}]
             (card-metadata card)))))

  (testing "...even when running via the API endpoint"
    (mt/with-temp* [Collection [collection]
                    Card       [card {:collection_id   (u/the-id collection)
                                      :dataset_query   (mt/native-query {:query "SELECT * FROM VENUES"})
                                      :result_metadata [{:name "NAME", :display_name "Name", :base_type :type/Text}]}]]
      (perms/grant-collection-read-permissions! (perms-group/all-users) collection)
      (mt/user-http-request :rasta :post 202 "dataset" {:database mbql.s/saved-questions-virtual-database-id
                                                        :type     :query
                                                        :query    {:source-table (str "card__" (u/the-id card))}})
      (is (= [{:name "NAME", :display_name "Name", :base_type :type/Text}]
             (card-metadata card))))))

(deftest metadata-in-results-test
  (testing "make sure that queries come back with metadata"
    (is (= {:columns  (for [col default-card-results-native]
                        (-> col (update :semantic_type keyword) (update :base_type keyword)))}
           (-> (qp/process-userland-query
                {:database (mt/id)
                 :type     :native
                 :native   {:query "SELECT ID, NAME, PRICE, CATEGORY_ID, LATITUDE, LONGITUDE FROM VENUES"}})
               (get-in [:data :results_metadata])
               round-to-2-decimals
               (->> (tu/round-fingerprint-cols [:columns]))))))
  (testing "datasets"
    (testing "metadata from datasets can be preserved"
      (letfn [(choose [col] (select-keys col [:name :description :display_name :semantic_type]))
              (refine-type [base-type] (condp #(isa? %2 %1) base-type
                                         :type/Integer :type/Quantity
                                         :type/Float :type/Cost
                                         :type/Text :type/Name
                                         base-type))
              (add-preserved [cols] (map merge
                                         cols
                                         (repeat {:description "user description"
                                                  :display_name "user display name"})
                                         (map (comp
                                               (fn [x] {:semantic_type x})
                                               refine-type
                                               :base_type)
                                              cols)))]
        (testing "native"
          (let [fields (str/join ", " (map :name default-card-results-native))
                native-query (str "SELECT " fields " FROM VENUES")
                existing-metadata (add-preserved default-card-results-native)
                results (qp/process-userland-query
                         {:database (mt/id)
                          :type :native
                          :native {:query native-query}
                          :info {:metadata/dataset-metadata existing-metadata}})]
            (is (= (map choose existing-metadata)
                   (map choose (-> results :data :results_metadata :columns))))))
        (testing "mbql"
          (let [query {:database (mt/id)
                       :type :query
                       :query {:source-table (mt/id :venues)}}
                existing-metadata (add-preserved (-> query
                                                     (qp/process-userland-query)
                                                     :data :results_metadata :columns))
                results (qp/process-userland-query
                         (update query
                                 :info
                                 merge
                                 {:metadata/dataset-metadata existing-metadata}))]
            (is (= (map choose existing-metadata)
                   (map choose (-> results :data :results_metadata :columns))))))))))

(deftest card-with-datetime-breakout-by-year-test
  (testing "make sure that a Card where a DateTime column is broken out by year works the way we'd expect"
    (mt/with-temp Card [card]
      (qp/process-userland-query
       {:database (mt/id)
        :type     :query
        :query    {:source-table (mt/id :checkins)
                   :aggregation  [[:count]]
                   :breakout     [[:field (mt/id :checkins :date) {:temporal-unit :year}]]}
        :info     {:card-id    (u/the-id card)
                   :query-hash (qp.util/query-hash {})}})
      (is (= [{:base_type    :type/DateTime
               :effective_type    :type/DateTime
               :coercion_strategy nil
               :display_name "Date"
               :name         "DATE"
               :unit         :year
               :settings     nil
               :description  nil
               :semantic_type nil
               :fingerprint  {:global {:distinct-count 618 :nil% 0.0}
                              :type   {:type/DateTime {:earliest "2013-01-03"
                                                       :latest   "2015-12-29"}}}
               :id           (mt/id :checkins :date)
               :field_ref    [:field (mt/id :checkins :date) {:temporal-unit :year}]}
              {:base_type    :type/BigInteger
               :effective_type :type/BigInteger
               :display_name "Count"
               :name         "count"
               :semantic_type :type/Quantity
               :fingerprint  {:global {:distinct-count 3
                                       :nil%           0.0},
                              :type   {:type/Number {:min 235.0, :max 498.0, :avg 333.33 :q1 243.0, :q3 440.0 :sd 143.5}}}
               :field_ref    [:aggregation 0]}]
             (-> card
                 card-metadata
                 round-to-2-decimals
                 tu/round-fingerprint-cols))))))

(defn- results-metadata [query]
  (-> (qp/process-query query) :data :results_metadata :columns))

(deftest valid-results-metadata-test
  (mt/test-drivers (mt/normal-drivers)
    (testing "MBQL queries should come back with valid results metadata"
      (is (schema= (su/non-empty qr/ResultsMetadata)
                   (results-metadata (mt/query venues)))))

    (testing "Native queries should come back with valid results metadata (#12265)"
      (is (schema= (su/non-empty qr/ResultsMetadata)
                   (results-metadata (-> (mt/mbql-query venues) qp/compile mt/native-query)))))))

(deftest native-query-datetime-metadata-test
  (testing "Make sure base types inferred by the `annotate` middleware come back with the results metadata"
    ;; H2 `date_trunc` returns a column of SQL type `NULL` -- so initially the `base_type` will be `:type/*`
    ;; (unknown). However, the `annotate` middleware will scan the values of the column and determine that the column
    ;; is actually a `:type/DateTime`. The query results metadata should come back with the correct type info.
    (let [results (:data
                   (qp/process-query
                    {:type     :native
                     :native   {:query "select date_trunc('day', checkins.\"DATE\") as d FROM checkins"}
                     :database (mt/id)}))]
      (testing "Sanity check: annotate should infer correct type from `:cols`"
        (is (= {:base_type    :type/DateTime,
                :effective_type :type/DateTime
                :display_name "D" :name "D"
                :source       :native
                :field_ref    [:field "D" {:base-type :type/DateTime}]}
               (first (:cols results)))))

      (testing "Results metadata should have the same type info")
      (is (= {:base_type    :type/DateTime
              :effective_type :type/DateTime
              :display_name "D"
              :name         "D"
              :semantic_type nil
              :field_ref    [:field "D" {:base-type :type/DateTime}]}
             (-> results :results_metadata :columns first (dissoc :fingerprint)))))))

(deftest results-metadata-should-have-field-refs-test
  (testing "QP results metadata should include Field refs"
    (mt/dataset sample-dataset
      (letfn [(do-test []
                (let [results-metadata       (get-in (mt/run-mbql-query orders {:limit 10})
                                                     [:data :results_metadata :columns])
                      expected-cols          (qp/query->expected-cols (mt/mbql-query orders))]
                  (testing "Card results metadata shouldn't differ wildly from QP expected cols"
                    (letfn [(select-keys-to-compare [cols]
                              (map #(select-keys % [:name :base_type :id :field_ref]) cols))]
                      (is (= (select-keys-to-compare results-metadata)
                             (select-keys-to-compare expected-cols)))))))]
        (do-test)
        (testing "With an FK column remapping"
          ;; Add column remapping from Orders Product ID -> Products.Title
          (mt/with-temp Dimension [_ (mt/$ids orders
                                       {:field_id                %product_id
                                        :name                    "Product ID"
                                        :type                    :external
                                        :human_readable_field_id %products.title})]
            (do-test)))))))

(deftest field-refs-should-be-correct-fk-forms-test
  (testing "Field refs included in results metadata should be wrapped correctly e.g. in `fk->` form"
    (mt/dataset sample-dataset
      (doseq [[description query]
              {"simple query"
               (mt/mbql-query orders
                 {:aggregation [[:count]]
                  :breakout    [$product_id->products.category]
                  :order-by    [[:asc $product_id->products.category]]
                  :limit       5})

               "query with source query"
               (mt/mbql-query orders
                 {:source-query {:source-table $$orders}
                  :aggregation  [[:count]]
                  :breakout     [$product_id->products.category]
                  :order-by     [[:asc $product_id->products.category]]
                  :limit        5})}]
        (testing (str description "\n" (u/pprint-to-str query))
          (is (schema= {:status   (s/eq :completed)
                        :data     (mt/$ids orders
                                    {:cols             [(s/one {:name      (s/eq "CATEGORY")
                                                                :field_ref (s/eq $product_id->products.category)
                                                                :id        (s/eq %products.category)
                                                                s/Keyword  s/Any}
                                                               "products.category")
                                                        (s/one {:name      (s/eq "count")
                                                                :field_ref (s/eq [:aggregation 0])
                                                                s/Keyword  s/Any}
                                                               "count aggregation")]
                                     :results_metadata {:columns  [(s/one {:name      (s/eq "CATEGORY")
                                                                           :field_ref (s/eq $product_id->products.category)
                                                                           :id        (s/eq %products.category)
                                                                           s/Keyword  s/Any}
                                                                          "results metadata for products.category")
                                                                   (s/one {:name      (s/eq "count")
                                                                           :field_ref (s/eq [:aggregation 0])
                                                                           s/Keyword  s/Any}
                                                                          "results metadata for count aggregation")]
                                                        s/Keyword s/Any}
                                     s/Keyword         s/Any})
                        s/Keyword s/Any}
                       (qp/process-query query))))))))
