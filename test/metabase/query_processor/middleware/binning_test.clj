(ns metabase.query-processor.middleware.binning-test
  "There are more 'e2e' tests related to binning in [[metabase.query-processor-test.breakout-test]]."
  (:require
   [clojure.test :refer :all]
   [medley.core :as m]
   [metabase.lib.card :as lib.card]
   [metabase.lib.convert :as lib.convert]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.jvm :as lib.metadata.jvm]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]
   [metabase.lib.test-util.macros :as lib.tu.macros]
   [metabase.query-processor :as qp]
   [metabase.query-processor.middleware.binning :as binning]
   [metabase.query-processor.preprocess :as qp.preprocess]
   [metabase.query-processor.store :as qp.store]
   [metabase.query-processor.test-util :as qp.test-util]
   [metabase.test :as mt]))

(deftest ^:parallel filter->field-map-test
  (is (= {}
         (#'binning/filter->field-map [:and
                                       [:= [:field 1 nil] 10]
                                       [:= [:field 2 nil] 10]])))

  (is (= {1 [[:< [:field 1 nil] 10] [:> [:field 1 nil] 1]]
          2 [[:> [:field 2 nil] 20] [:< [:field 2 nil] 10]]
          3 [[:between [:field 3 nil] 5 10]]}
         (#'binning/filter->field-map [:and
                                       [:< [:field 1 nil] 10]
                                       [:> [:field 1 nil] 1]
                                       [:> [:field 2 nil] 20]
                                       [:< [:field 2 nil] 10]
                                       [:between [:field 3 nil] 5 10]]))))

(def ^:private test-min-max-fingerprint
  {:type {:type/Number {:min 100 :max 1000}}})

(deftest ^:parallel extract-bounds-test
  (are [field-id->filters expected] (= expected
                                       (#'binning/extract-bounds 1 test-min-max-fingerprint field-id->filters))
    {1 [[:> [:field 1 nil] 1] [:< [:field 1 nil] 10]]}
    {:min-value 1, :max-value 10}

    {1 [[:between [:field 1 nil] 1 10]]}
    {:min-value 1, :max-value 10}

    {}
    {:min-value 100, :max-value 1000}

    {1 [[:> [:field 1 nil] 500]]}
    {:min-value 500, :max-value 1000}

    {1 [[:< [:field 1 nil] 500]]}
    {:min-value 100, :max-value 500}

    {1 [[:> [:field 1 nil] 200] [:< [:field 1 nil] 800] [:between [:field 1 nil] 600 700]]}
    {:min-value 600, :max-value 700}))

(deftest ^:parallel extract-bounds-field-name-test
  (testing "Should be able to adjust min max based on filters against named field refs. (#26202)"
    (is (= {:min-value 1, :max-value 10}
           (#'binning/extract-bounds "foo" test-min-max-fingerprint {"foo" [[:> [:field 1 nil] 1] [:< [:field 1 nil] 10]]})))))

;; Try an end-to-end test of the middleware
(defn- mock-field-metadata-provider []
  (lib.tu/mock-metadata-provider
   meta/metadata-provider
   {:fields [(merge (meta/field-metadata :orders :total)
                    {:id             1
                     :database-type  "DOUBLE"
                     :table-id       (meta/id :checkins)
                     :semantic-type  :type/Income
                     :name           "TOTAL"
                     :display-name   "Total"
                     :fingerprint    {:global {:distinct-count 10000}
                                      :type   {:type/Number {:min 12.061602936923117
                                                             :max 238.32732001721533
                                                             :avg 82.96014815230829}}}
                     :base-type      :type/Float
                     :effective-type :type/Float})]}))

(deftest ^:parallel update-binning-strategy-test
  (qp.store/with-metadata-provider (mock-field-metadata-provider)
    (is (= {:query    {:source-table (meta/id :checkins)
                       :breakout     [[:field 1
                                       {:binning
                                        {:strategy  :num-bins
                                         :num-bins  8
                                         :min-value 0.0
                                         :max-value 240.0
                                         :bin-width 30.0}}]]}
            :type     :query
            :database (meta/id)}
           (binning/update-binning-strategy
            {:query    {:source-table (meta/id :checkins)
                        :breakout     [[:field 1 {:binning {:strategy :default}}]]}
             :type     :query
             :database (meta/id)})))))

(deftest ^:parallel update-binning-strategy-test-2
  (qp.store/with-metadata-provider (mock-field-metadata-provider)
    (testing "should work recursively on nested queries"
      (is (= {:query    {:source-query
                         {:source-table (meta/id :checkins)
                          :breakout     [[:field 1 {:binning {:strategy  :num-bins
                                                              :num-bins  8
                                                              :min-value 0.0
                                                              :max-value 240.0
                                                              :bin-width 30.0}}]]}}
              :type     :query
              :database (meta/id)}
             (binning/update-binning-strategy
              {:query    {:source-query
                          {:source-table (meta/id :checkins)
                           :breakout     [[:field 1 {:binning {:strategy :default}}]]}}
               :type     :query
               :database (meta/id)}))))))

(deftest ^:parallel binning-nested-questions-test
  (qp.store/with-metadata-provider (lib.tu/metadata-provider-with-cards-for-queries
                                    (lib.metadata.jvm/application-database-metadata-provider (mt/id))
                                    [(mt/mbql-query venues)])
    (is (= [[1 22]
            [2 59]
            [3 13]
            [4 6]]
           (->> {:source-table "card__1"
                 :breakout     [[:field "PRICE" {:base-type :type/Float, :binning {:strategy :default}}]]
                 :aggregation  [[:count]]}
                (mt/run-mbql-query nil)
                (mt/formatted-rows [int int]))))))

(mt/defdataset single-row
  [["t" [{:field-name    "lat"
          :base-type     :type/Decimal
          :semantic-type :type/Latitude}
         {:field-name    "lon"
          :base-type     :type/Decimal
          :semantic-type :type/Longitude}]
    [[-27.137453079223633 -52.5982666015625]]]])

(def ^:private single-row-fingerprints
  {:lat {:global {:distinct-count 10, :nil% 0.0}
         :type   {:type/Number {:min -27.0
                                :max -27.0}}}
   :lon {:global {:distinct-count 10, :nil% 0.0}
         :type   {:type/Number {:min -53.0
                                :max -53.0}}}})

(deftest ^:parallel auto-bin-single-row-test
  (testing "Make sure we can auto-bin a Table that only has a single row (#13914)"
    (mt/dataset single-row
      (qp.store/with-metadata-provider (lib.tu/merged-mock-metadata-provider
                                        (lib.metadata.jvm/application-database-metadata-provider (mt/id))
                                        {:fields [{:id          (mt/id :t :lat)
                                                   :fingerprint (single-row-fingerprints :lat)}
                                                  {:id          (mt/id :t :lon)
                                                   :fingerprint (single-row-fingerprints :lon)}]})
        (let [query (mt/mbql-query t
                      {:breakout    [[:field %lat {:binning {:strategy :default}}]
                                     [:field %lon {:binning {:strategy :default}}]]
                       :aggregation [[:count]]})]
          (is (=? {:query {:breakout [[:field integer? {:binning {:strategy  :bin-width
                                                                  :min-value -30.0
                                                                  :max-value -20.0
                                                                  :num-bins  1
                                                                  :bin-width 10.0}}]
                                      [:field integer? {:binning {:strategy  :bin-width
                                                                  :min-value -60.0
                                                                  :max-value -50.0
                                                                  :num-bins  1
                                                                  :bin-width 10.0}}]]}}
                  (into {} (binning/update-binning-strategy query))))
          (mt/with-native-query-testing-context query
            (is (= [[-30.00M -60.00M 1]]
                   (mt/rows (qp/process-query query))))))))))

(deftest ^:parallel fuzzy-metadata-matching-test
  (testing "Make sure we use fuzzy metadata matching to update binning strategies so it works for queries generated by MLv2"
    ;; this is disabled for now, but once we stop generating broken card refs it should work again -- see #33453
    (when-not lib.card/*force-broken-card-refs*
      (qp.store/with-metadata-provider meta/metadata-provider
        (let [source-card-query (lib.tu.macros/mbql-query orders
                                  {:joins  [{:source-table $$people
                                             :alias        "People"
                                             :condition    [:= $user-id [:field %people.id {:join-alias "People"}]]
                                             :fields       [[:field %people.longitude {:join-alias "People"}]
                                                            [:field %people.birth-date {:temporal-unit :default, :join-alias "People"}]]}
                                            {:source-table $$products
                                             :alias        "Products"
                                             :condition    [:= $product-id &Products.products.id]
                                             :fields       [&Products.products.price]}]
                                   :fields [[:field %id {:base-type :type/BigInteger}]]})
              source-metadata   (qp.preprocess/query->expected-cols source-card-query)
              query             (-> (lib/query meta/metadata-provider source-card-query)
                                    lib/append-stage
                                    (lib/aggregate (lib/count)))
              people-longitude (m/find-first #(= (:id %) (meta/id :people :longitude))
                                             (lib/breakoutable-columns query))
              _                (is (some? people-longitude))
              binning-strategy (m/find-first #(= (:display-name %) "Bin every 20 degrees")
                                             (lib/available-binning-strategies query people-longitude))
              _                (is (some? binning-strategy))
              query            (-> query
                                   (lib/breakout (lib/with-binning people-longitude binning-strategy)))
              legacy-query     (-> (lib.convert/->legacy-MBQL query)
                                   (assoc-in [:query :source-metadata] source-metadata))]
          (is (=? {:query {:breakout [[:field
                                       "People__LONGITUDE"
                                       {:base-type :type/Float,
                                        :binning   {:strategy  :bin-width
                                                    :bin-width 20.0
                                                    :min-value -180.0
                                                    :max-value -60.0
                                                    :num-bins  6}}]]}}
                  (binning/update-binning-strategy legacy-query))))))))

(deftest ^:parallel match-named-field-ref-filter
  (testing "fields referencing source expressions can still properly update binning strategies (#26202)"
    (mt/with-temp [:model/Card card (-> orders
                                        (mt/mbql-query {:fields [$total [:expression "foo"]]
                                                        :expressions {"foo" [:+ $total 0]}})
                                        qp.test-util/card-with-source-metadata-for-query
                                        (assoc-in [:result_metadata 1 :semantic_type] :type/Quantity))]
      (let [mp (lib.metadata.jvm/application-database-metadata-provider (mt/id))
            query (lib/query mp (lib.metadata/card mp (:id card)))
            expr-col (m/find-first #(= (:name %) "foo") (lib/breakoutable-columns query))
            _ (is (some? expr-col))
            binning-strategy (m/find-first #(= (:display-name %) "10 bins")
                                           (lib/available-binning-strategies query expr-col))
            _ (is (some? binning-strategy))
            query (-> query
                      (lib/breakout (lib/with-binning expr-col binning-strategy)))]
        (qp.store/with-metadata-provider mp
          (testing "without filter"
            (is (=? {:query {:breakout [[:field
                                         "foo"
                                         {:base-type :type/Float,
                                          :binning {:strategy :num-bins, :num-bins 10, :min-value -50.0, :max-value 175.0, :bin-width 25.0}}]]}}
                    (binning/update-binning-strategy (-> (lib.convert/->legacy-MBQL query)
                                                         (assoc-in [:query :source-metadata] (:result_metadata card)))))))
          (testing "with filter"
            (is (=? {:query {:breakout [[:field
                                         "foo"
                                         {:base-type :type/Float,
                                          :binning {:strategy :num-bins, :num-bins 10, :min-value 20.0, :max-value 40.0, :bin-width 2.0}}]]}}
                    (binning/update-binning-strategy (-> (lib.convert/->legacy-MBQL (lib/filter query (lib/between expr-col 20 40)))
                                                         (assoc-in [:query :source-metadata] (:result_metadata card))))))))))))
