(ns ^:mb/driver-tests metabase.query-processor-test.breakout-test
  "Tests for the `:breakout` clause."
  (:require
   [clojure.test :refer :all]
   [medley.core :as m]
   [metabase.lib-be.metadata.jvm :as lib.metadata.jvm]
   [metabase.lib.card :as lib.card]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.test-util :as lib.tu]
   [metabase.query-processor :as qp]
   [metabase.query-processor.middleware.add-remaps :as qp.add-remaps]
   [metabase.query-processor.middleware.add-source-metadata :as qp.add-source-metadata]
   [metabase.query-processor.store :as qp.store]
   [metabase.query-processor.test-util :as qp.test-util]
   [metabase.test :as mt]
   [metabase.test.data.dataset-definitions :as defs]
   [metabase.util :as u]))

(deftest ^:parallel single-column-with-breakout-test
  (mt/test-drivers (mt/normal-drivers)
    (testing "single column"
      (testing "with breakout"
        (is (=? {:rows [[1 31] [2 70] [3 75] [4 77] [5 69] [6 70] [7 76] [8 81] [9 68] [10 78] [11 74] [12 59] [13 76] [14 62] [15 34]]
                 :cols [(qp.test-util/breakout-col :checkins :user_id)
                        (qp.test-util/aggregate-col :count)]}
                (qp.test-util/rows-and-cols
                 (mt/format-rows-by
                  [int int]
                  (mt/run-mbql-query checkins
                    {:aggregation [[:count]]
                     :breakout    [$user_id]
                     :order-by    [[:asc $user_id]]})))))))))

(deftest ^:parallel single-column-without-breakout-test
  (mt/test-drivers (mt/normal-drivers)
    (testing "single column"
      (testing "without breakout"
        (testing "This should act as a \"distinct values\" query and return ordered results"
          (is (=? {:cols [(qp.test-util/breakout-col :checkins :user_id)]
                   :rows [[1] [2] [3] [4] [5] [6] [7] [8] [9] [10]]}
                  (qp.test-util/rows-and-cols
                   (mt/format-rows-by
                    [int]
                    (mt/run-mbql-query checkins
                      {:breakout [$user_id]
                       :limit    10}))))))))))

(deftest ^:parallel multiple-columns-without-order-by-test
  (mt/test-drivers (mt/normal-drivers)
    (testing "multiple columns"
      (testing "without explicit order by"
        (testing "Fields should be implicitly ordered :ASC for all the fields in `breakout` that are not specified in `order-by`"
          (is (=? {:rows [[1 1 1] [1 5 1] [1 7 1] [1 10 1] [1 13 1] [1 16 1] [1 26 1] [1 31 1] [1 35 1] [1 36 1]]
                   :cols [(qp.test-util/breakout-col :checkins :user_id)
                          (qp.test-util/breakout-col :checkins :venue_id)
                          (qp.test-util/aggregate-col :count)]}
                  (qp.test-util/rows-and-cols
                   (mt/format-rows-by
                    [int int int]
                    (mt/run-mbql-query checkins
                      {:aggregation [[:count]]
                       :breakout    [$user_id $venue_id]
                       :limit       10}))))))))))

(deftest ^:parallel multiple-columns-with-order-by-test
  (mt/test-drivers (mt/normal-drivers)
    (testing "multiple columns"
      (testing "with explicit order by"
        (testing "`breakout` should not implicitly order by any fields specified in `order-by`"
          (is (=? {:rows [[15 2 1] [15 3 1] [15 7 1] [15 14 1] [15 16 1] [15 18 1] [15 22 1] [15 23 2] [15 24 1] [15 27 1]]
                   :cols [(qp.test-util/breakout-col :checkins :user_id)
                          (qp.test-util/breakout-col :checkins :venue_id)
                          (qp.test-util/aggregate-col :count)]}
                  (qp.test-util/rows-and-cols
                   (mt/format-rows-by
                    [int int int]
                    (mt/run-mbql-query checkins
                      {:aggregation [[:count]]
                       :breakout    [$user_id $venue_id]
                       :order-by    [[:desc $user_id]]
                       :limit       10}))))))))))

(deftest ^:parallel internal-remapping-test
  (mt/test-drivers (mt/normal-drivers)
    (qp.store/with-metadata-provider (lib.tu/remap-metadata-provider
                                      (lib.metadata.jvm/application-database-metadata-provider (mt/id))
                                      (mt/id :venues :category_id)
                                      (qp.test-util/field-values-from-def defs/test-data :categories :name))
      (let [{:keys [rows cols]} (qp.test-util/rows-and-cols
                                 (mt/format-rows-by
                                  [int int str]
                                  (mt/run-mbql-query venues
                                    {:aggregation [[:count]]
                                     :breakout    [$category_id]
                                     :limit       5})))]
        (is (=? [(assoc (qp.test-util/breakout-col :venues :category_id) :remapped_to "Category ID [internal remap]")
                 (qp.test-util/aggregate-col :count)
                 (#'qp.add-remaps/create-remapped-col "Category ID [internal remap]" (mt/format-name "category_id") :type/Text)]
                cols))
        (is (= [[2 8 "American"]
                [3 2 "Artisan"]
                [4 2 "Asian"]
                [5 7 "BBQ"]
                [6 2 "Bakery"]]
               rows))))))

(deftest ^:parallel order-by-test
  (mt/test-drivers (mt/normal-drivers-with-feature :left-join)
    (qp.store/with-metadata-provider (lib.tu/remap-metadata-provider
                                      (lib.metadata.jvm/application-database-metadata-provider (mt/id))
                                      (mt/id :venues :category_id)
                                      (mt/id :categories :name))
      (doseq [[sort-order expected] {:desc ["Wine Bar" "Thai" "Thai" "Thai" "Thai" "Steakhouse" "Steakhouse"
                                            "Steakhouse" "Steakhouse" "Southern"] :asc  ["American" "American" "American" "American" "American" "American" "American"
                                                                                         "American" "Artisan" "Artisan"]}]
        (testing (format "sort order = %s" sort-order)
          (is (= expected
                 (->> (mt/run-mbql-query venues
                        {:order-by [[sort-order $category_id]]
                         :limit    10})
                      qp.test-util/rows
                      (mapv last)))))))))

(deftest ^:parallel bin-single-column-20-bins-test
  (mt/test-drivers (mt/normal-drivers-with-feature :binning)
    (testing "Bin single column"
      (testing "20 bins"
        (is (= [[10.0 1] [32.0 4] [34.0 57] [36.0 29] [40.0 9]]
               (mt/formatted-rows
                [1.0 int]
                (mt/run-mbql-query venues
                  {:aggregation [[:count]]
                   :breakout    [[:field %latitude {:binning {:strategy :num-bins, :num-bins 20}}]]}))))))))

(deftest ^:parallel bin-single-column-3-bins-test
  (mt/test-drivers (mt/normal-drivers-with-feature :binning)
    (testing "Bin single column"
      (testing "3 bins"
        (is (= [[0.0 1] [20.0 90] [40.0 9]]
               (mt/formatted-rows
                [1.0 int]
                (mt/run-mbql-query venues
                  {:aggregation [[:count]]
                   :breakout    [[:field %latitude {:binning {:strategy :num-bins, :num-bins 3}}]]}))))))))

(deftest ^:parallel bin-two-columns-test
  (mt/test-drivers (mt/normal-drivers-with-feature :binning)
    (testing "Bin two columns"
      (is (= [[10.0 -170.0 1] [32.0 -120.0 4] [34.0 -120.0 57] [36.0 -125.0 29] [40.0 -75.0 9]]
             (mt/formatted-rows
              [1.0 1.0 int]
              (mt/run-mbql-query venues
                {:aggregation [[:count]]
                 :breakout    [[:field %latitude {:binning {:strategy :num-bins, :num-bins 20}}]
                               [:field %longitude {:binning {:strategy :num-bins, :num-bins 20}}]]})))))))

(deftest ^:parallel binning-default-to-8-test
  (mt/test-drivers (mt/normal-drivers-with-feature :binning)
    (testing "should default to 8 bins when number of bins isn't specified"
      (is (= [[10.0 1] [30.0 90] [40.0 9]]
             (mt/formatted-rows
              [1.0 int]
              (mt/run-mbql-query venues
                {:aggregation [[:count]]
                 :breakout    [[:field %latitude {:binning {:strategy :default}}]]})))))))

(deftest breakout-bin-width-setting-test
  (mt/test-drivers (mt/normal-drivers-with-feature :binning)
    (testing "should default to 8 bins when number of bins isn't specified"
      (mt/with-temporary-setting-values [breakout-bin-width 5.0]
        (is (= [[10.0 1] [30.0 61] [35.0 29] [40.0 9]]
               (mt/formatted-rows
                [1.0 int]
                (mt/run-mbql-query venues
                  {:aggregation [[:count]]
                   :breakout    [[:field %latitude {:binning {:strategy :default}}]]})))))
      (mt/with-temporary-setting-values [breakout-bin-width 1.0]
        (is (= [[33.0 4] [34.0 57]]
               (mt/formatted-rows
                [1.0 int]
                (mt/run-mbql-query venues
                  {:aggregation [[:count]]
                   :filter      [:and
                                 [:< $latitude 35]
                                 [:> $latitude 20]]
                   :breakout    [[:field %latitude {:binning {:strategy :default}}]]}))))))))

(deftest ^:parallel bin-width-test
  (mt/test-drivers (mt/normal-drivers-with-feature :binning)
    (testing "bin width"
      (is (= [[10.0 1] [33.0 4] [34.0 57] [37.0 29] [40.0 9]]
             (mt/formatted-rows
              [1.0 int]
              (mt/run-mbql-query venues
                {:aggregation [[:count]]
                 :breakout    [[:field %latitude {:binning {:strategy :bin-width, :bin-width 1}}]]})))))))

(deftest ^:parallel bin-width-float-test
  (mt/test-drivers (mt/normal-drivers-with-feature :binning)
    (testing "bin width"
      (testing "using a float"
        (is (= [[10.0 1] [32.5 61] [37.5 29] [40.0 9]]
               (mt/formatted-rows
                [1.0 int]
                (mt/run-mbql-query venues
                  {:aggregation [[:count]]
                   :breakout    [[:field %latitude {:binning {:strategy :bin-width, :bin-width 2.5}}]]}))))))))

(deftest ^:parallel binning-info-test
  (mt/test-drivers (mt/normal-drivers-with-feature :binning)
    (testing "Validate binning info is returned with the binning-strategy"
      (testing "binning-strategy = default"
        ;; base_type can differ slightly between drivers and it's really not important for the purposes of this test
        (is (=? (assoc (dissoc (qp.test-util/breakout-col :venues :latitude) :base_type :effective_type)
                       :binning_info {:min_value 10.0, :max_value 50.0, :num_bins 4, :bin_width 10.0, :binning_strategy :bin-width}
                       :field_ref    [:field (mt/id :venues :latitude) {:binning {:strategy  :bin-width
                                                                                  :min-value 10.0
                                                                                  :max-value 50.0
                                                                                  :num-bins  4
                                                                                  :bin-width 10.0}}]
                       :display_name "Latitude: 10°")
                (-> (mt/run-mbql-query venues
                      {:aggregation [[:count]]
                       :breakout    [[:field %latitude {:binning {:strategy :default}}]]})
                    qp.test-util/cols
                    first
                    (dissoc :base_type :effective_type))))))))

(deftest ^:parallel binning-info-test-2
  (mt/test-drivers (mt/normal-drivers-with-feature :binning)
    (testing "Validate binning info is returned with the binning-strategy"
      (testing "binning-strategy = num-bins: 5"
        (is (=? (assoc (dissoc (qp.test-util/breakout-col :venues :latitude) :base_type :effective_type)
                       :binning_info {:min_value 7.5, :max_value 45.0, :num_bins 5, :bin_width 7.5, :binning_strategy :num-bins}
                       :field_ref    [:field (mt/id :venues :latitude) {:binning {:strategy  :num-bins
                                                                                  :min-value 7.5
                                                                                  :max-value 45.0
                                                                                  :num-bins  5
                                                                                  :bin-width 7.5}}]
                       :display_name "Latitude: 5 bins")
                (-> (mt/run-mbql-query venues
                      {:aggregation [[:count]]
                       :breakout    [[:field %latitude {:binning {:strategy :num-bins, :num-bins 5}}]]})
                    qp.test-util/cols
                    first
                    (dissoc :base_type :effective_type))))))))

(deftest ^:parallel binning-error-test
  (mt/test-drivers (mt/normal-drivers-with-feature :binning)
    (qp.store/with-metadata-provider (lib.tu/merged-mock-metadata-provider
                                      (lib.metadata.jvm/application-database-metadata-provider (mt/id))
                                      {:fields [{:id          (mt/id :venues :latitude)
                                                 :fingerprint {:type {:type/Number {:min nil, :max nil}}}}]})
      (is (=? {:status :failed
               :class  (partial = clojure.lang.ExceptionInfo)
               :error  "Unable to bin Field without a min/max value (missing or incomplete fingerprint)"}
              (qp/process-query
               (qp/userland-query
                (mt/mbql-query venues
                  {:aggregation [[:count]]
                   :breakout    [[:field %latitude {:binning {:strategy :default}}]]}))))))))

(defn- nested-venues-query [card-or-card-id]
  (mt/mbql-query nil
    {:source-table (str "card__" (u/the-id card-or-card-id))
     :aggregation  [[:count]]
     :breakout     [[:field
                     (mt/format-name :latitude)
                     {:base-type :type/Float, :binning {:strategy :num-bins, :num-bins 20}}]]}))

(deftest ^:parallel bin-nested-queries-test
  (mt/test-drivers (mt/normal-drivers-with-feature :binning :nested-queries)
    (testing "Binning should be allowed on nested queries that have result metadata"
      (qp.store/with-metadata-provider (qp.test-util/metadata-provider-with-cards-with-metadata-for-queries
                                        [(mt/mbql-query nil
                                           {:source-query {:source-table $$venues}})])
        (let [query (nested-venues-query 1)]
          (mt/with-native-query-testing-context query
            (is (= [[10.0 1] [32.0 4] [34.0 57] [36.0 29] [40.0 9]]
                   (mt/formatted-rows
                    [1.0 int]
                    (qp/process-query query))))))))))

(deftest bin-nested-queries-default-binning-test
  (mt/test-drivers (mt/normal-drivers-with-feature :binning :nested-queries)
    (testing "should be able to use :default binning in a nested query"
      (mt/with-temporary-setting-values [breakout-bin-width 5.0]
        (is (= [[10.0 1] [30.0 61] [35.0 29] [40.0 9]]
               (mt/formatted-rows
                [1.0 int]
                (mt/run-mbql-query venues
                  {:source-query
                   {:source-table $$venues
                    :aggregation  [[:count]]
                    :breakout     [[:field %latitude {:binning {:strategy :default}}]]}
                   :order-by [[:asc $latitude]]}))))))))

(deftest bin-nested-queries-no-fingerprint-test
  (mt/test-drivers (mt/normal-drivers-with-feature :binning :nested-queries)
    (testing "Binning is not supported when there is no fingerprint to determine boundaries"
      ;; Unfortunately our new `add-source-metadata` middleware is just too good at what it does and will pull in
      ;; metadata from the source query, so disable that for now so we can make sure the `update-binning-strategy`
      ;; middleware is doing the right thing
      (with-redefs [lib.card/card-metadata-columns                     (constantly nil)
                    qp.add-source-metadata/mbql-source-query->metadata (constantly nil)]
        (qp.store/with-metadata-provider (qp.test-util/metadata-provider-with-cards-for-queries
                                          [(mt/mbql-query venues)])
          (is (thrown-with-msg?
               Exception
               #"Cannot update binned field: query is missing source-metadata"
               (qp.test-util/rows
                (qp/process-query
                 (nested-venues-query 1))))))))))

(deftest ^:parallel field-in-breakout-and-fields-test
  (mt/test-drivers (mt/normal-drivers)
    (testing (str "if we include a Field in both breakout and fields, does the query still work? (Normalization should "
                  "be taking care of this) (#8760)")
      (is (= :completed
             (:status
              (mt/run-mbql-query venues
                {:breakout [$price]
                 :fields   [$price]})))))))

(deftest ^:parallel binning-with-source-card-with-explicit-joins-test
  (testing "Make sure binning works with a source card that contains explicit joins"
    (mt/test-drivers (mt/normal-drivers-with-feature :binning :nested-queries :left-join)
      (mt/dataset test-data
        (let [source-card-query (mt/mbql-query orders
                                  {:joins  [{:source-table $$people
                                             :alias        "People"
                                             :condition    [:= $user_id [:field %people.id {:join-alias "People"}]]
                                             :fields       [[:field %people.longitude {:join-alias "People"}]
                                                            [:field %people.birth_date {:temporal-unit :default, :join-alias "People"}]]}
                                            {:source-table $$products
                                             :alias        "Products"
                                             :condition    [:= $product_id &Products.products.id]
                                             :fields       [&Products.products.price]}]
                                   :fields [[:field %id {:base-type :type/BigInteger}]]})]
          (qp.store/with-metadata-provider (qp.test-util/metadata-provider-with-cards-with-metadata-for-queries
                                            [source-card-query])
            (let [query            (-> (lib/query (qp.store/metadata-provider) (lib.metadata/card (qp.store/metadata-provider) 1))
                                       (lib/aggregate (lib/count)))
                  people-longitude (m/find-first #(= (:id %) (mt/id :people :longitude))
                                                 (lib/breakoutable-columns query))
                  _                (is (some? people-longitude))
                  binning-strategy (m/find-first #(= (:display-name %) "Bin every 20 degrees")
                                                 (lib/available-binning-strategies query people-longitude))
                  _                (is (some? binning-strategy))
                  query            (-> query
                                       (lib/breakout (lib/with-binning people-longitude binning-strategy)))]
              (mt/rows (qp/process-query query)))))))))
