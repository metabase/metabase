(ns metabase.usage-metadata.extract-test
  (:require
   [clojure.test :refer :all]
   [metabase.lib.core :as lib]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]
   [metabase.usage-metadata.extract :as extract]
   [metabase.util.json :as json]))

(defn- decode-json
  [s]
  (json/decode+kw s))

(deftest ^:parallel select-root-owner-test
  (testing "table roots are attributed to the table"
    (is (= {:source-type :table, :source-id (meta/id :venues)}
           (extract/select-root-owner (lib.tu/venues-query)))))

  (testing "card roots are attributed to the card"
    (is (= {:source-type :card, :source-id 1}
           (extract/select-root-owner (lib.tu/query-with-source-card)))))

  (testing "model roots are still attributed as cards"
    (is (= {:source-type :card, :source-id 1}
           (extract/select-root-owner (lib.tu/query-with-source-model)))))

  (testing "native queries are skipped"
    (is (nil? (extract/select-root-owner (lib.tu/native-query))))))

(deftest ^:parallel segment-extraction-test
  (let [query (-> (lib.tu/venues-query)
                  (lib/filter (lib/= (meta/field-metadata :venues :price) 4))
                  (lib/filter (lib/> (meta/field-metadata :venues :id) 10)))
        rows  (:segments (extract/extract-usage-facts query))]
    (is (= 2 (count rows)))
    (is (= #{:direct} (set (map :ownership-mode rows))))
    (is (= #{{:source-type :table, :source-id (meta/id :venues), :field-id (meta/id :venues :price)}
             {:source-type :table, :source-id (meta/id :venues), :field-id (meta/id :venues :id)}}
           (set (map #(select-keys % [:source-type :source-id :field-id]) rows))))
    (is (= #{["=" 4] [">" 10]}
           (set (map (fn [{:keys [predicate]}]
                       (let [decoded (decode-json predicate)]
                         [(first decoded) (last decoded)]))
                     rows))))))

(deftest ^:parallel compound-filter-extraction-test
  (let [query (lib/filter (lib.tu/venues-query)
                          (lib/or (lib/= (meta/field-metadata :venues :price) 1)
                                  (lib/= (meta/field-metadata :venues :price) 2)))
        rows  (:segments (extract/extract-usage-facts query))]
    (is (= 1 (count rows)))
    (is (= :direct (:ownership-mode (first rows))))
    (is (= (meta/id :venues :price) (:field-id (first rows))))
    (is (= "or"
           (first (decode-json (:predicate (first rows))))))))

(deftest ^:parallel metric-extraction-test
  (let [query (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
                  (lib/aggregate (lib/sum (meta/field-metadata :orders :subtotal)))
                  (lib/breakout (lib/with-temporal-bucket (meta/field-metadata :orders :created-at) :month))
                  (lib/breakout (meta/field-metadata :orders :product-id)))
        rows  (:metrics (extract/extract-usage-facts query))]
    (is (= [{:source-type       :table
             :source-id         (meta/id :orders)
             :ownership-mode    :direct
             :agg               :sum
             :agg-field-id      (meta/id :orders :subtotal)
             :temporal-field-id (meta/id :orders :created-at)
             :temporal-unit     :month}]
           rows))))

(deftest ^:parallel metric-extraction-without-temporal-breakout-test
  (let [query (-> (lib.tu/venues-query)
                  (lib/aggregate (lib/count)))
        rows  (:metrics (extract/extract-usage-facts query))]
    (is (= [{:source-type       :table
             :source-id         (meta/id :venues)
             :ownership-mode    :direct
             :agg               :count
             :agg-field-id      nil
             :temporal-field-id nil
             :temporal-unit     nil}]
           rows))))

(deftest ^:parallel dimension-extraction-test
  (let [query (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
                  (lib/breakout (lib/with-temporal-bucket (meta/field-metadata :orders :created-at) :month))
                  (lib/breakout (lib/with-binning (meta/field-metadata :orders :subtotal)
                                                  {:strategy :num-bins, :num-bins 10})))
        rows  (:dimensions (extract/extract-usage-facts query))]
    (is (= [{:source-type    :table
             :source-id      (meta/id :orders)
             :ownership-mode :direct
             :field-id       (meta/id :orders :created-at)
             :temporal-unit  :month
             :binning        nil}
            {:source-type    :table
             :source-id      (meta/id :orders)
             :ownership-mode :direct
             :field-id       (meta/id :orders :subtotal)
             :temporal-unit  nil
             :binning        "{\"num-bins\":10,\"strategy\":\"num-bins\"}"}]
           rows))
    (is (= {:num-bins 10, :strategy "num-bins"}
           (decode-json (:binning (second rows)))))))

(deftest ^:parallel joined-field-is-owned-by-joined-source-test
  (let [query (-> (lib.tu/query-with-join)
                  (lib/filter (lib/= (meta/field-metadata :venues :price) 1))
                  (lib/filter (lib/= (lib/with-join-alias (meta/field-metadata :categories :name) "Cat") "Pizza")))
        rows  (:segments (extract/extract-usage-facts query))]
    (is (= #{{:source-type :table, :source-id (meta/id :venues), :ownership-mode :direct, :field-id (meta/id :venues :price)}
             {:source-type :table, :source-id (meta/id :categories), :ownership-mode :direct, :field-id (meta/id :categories :name)}}
           (set (map #(select-keys % [:source-type :source-id :ownership-mode :field-id]) rows))))))

(deftest ^:parallel source-card-fields-stay-card-owned-test
  (let [query (-> (lib.tu/query-with-source-model)
                  (lib/append-stage)
                  (lib/filter -1 (lib/= (meta/field-metadata :checkins :user-id) 10)))
        rows  (:segments (extract/extract-usage-facts query))]
    (is (= 1 (count rows)))
    (is (= {:source-type :card, :source-id 1, :ownership-mode :direct, :field-id (meta/id :checkins :user-id)}
           (select-keys (first rows) [:source-type :source-id :ownership-mode :field-id])))))

(deftest ^:parallel composite-extraction-single-owner-test
  (testing "a top-level :and clause produces exactly one composite fact on a single-owner query"
    (let [query (lib/filter (lib.tu/venues-query)
                            (lib/and (lib/= (meta/field-metadata :venues :price) 4)
                                     (lib/> (meta/field-metadata :venues :id) 10)))
          facts (:composites (extract/extract-usage-facts query))]
      (is (= 1 (count facts)))
      (let [{:keys [source-type source-id ownership-mode clause atom-fingerprints atom-count]} (first facts)]
        (is (= :table source-type))
        (is (= (meta/id :venues) source-id))
        (is (= :direct ownership-mode))
        (is (= 2 atom-count))
        (is (= 2 (count atom-fingerprints)))
        (is (= atom-fingerprints (vec (sort atom-fingerprints)))
            "atom-fingerprints should be sorted for stable basket identity")
        (is (= "and" (first (decode-json clause))))
        (testing "atom fingerprints round-trip to canonical atom JSON"
          (is (= #{"=" ">"} (set (map (comp first decode-json) atom-fingerprints)))))))))

(deftest ^:parallel composite-extraction-single-atom-is-skipped-test
  (testing "single-atom top-level filters emit NO composite (atom rollup already captures them)"
    (let [query (lib/filter (lib.tu/venues-query)
                            (lib/= (meta/field-metadata :venues :price) 4))]
      (is (empty? (:composites (extract/extract-usage-facts query)))))))

(deftest ^:parallel composite-extraction-accumulated-filters-combine-into-one-basket-test
  (testing "two separate lib/filter calls form a single composite basket (the stage's implicit :and)"
    (let [query (-> (lib.tu/venues-query)
                    (lib/filter (lib/= (meta/field-metadata :venues :price) 4))
                    (lib/filter (lib/> (meta/field-metadata :venues :id) 10)))
          facts (:composites (extract/extract-usage-facts query))]
      (is (= 1 (count facts)))
      (is (= 2 (:atom-count (first facts)))))))

(deftest ^:parallel composite-extraction-multi-owner-test
  (testing ":and spanning multiple owners yields :mixed + per-owner :projected composite facts"
    (let [query (lib/filter (lib.tu/query-with-join)
                            (lib/and (lib/= (meta/field-metadata :venues :price) 1)
                                     (lib/= (lib/with-join-alias (meta/field-metadata :categories :name) "Cat") "Pizza")))
          facts (:composites (extract/extract-usage-facts query))]
      (is (= 3 (count facts)))
      (is (= 1 (count (filter #(= :mixed (:ownership-mode %)) facts))))
      (is (= #{{:source-type :table, :source-id (meta/id :venues),      :ownership-mode :projected}
               {:source-type :table, :source-id (meta/id :categories),  :ownership-mode :projected}}
             (set (map #(select-keys % [:source-type :source-id :ownership-mode])
                       (filter #(= :projected (:ownership-mode %)) facts)))))
      (testing "all projected rows share the same clause+atom fingerprints as the mixed row"
        (let [fingerprints (into #{} (map (juxt :clause :atom-fingerprints)) facts)]
          (is (= 1 (count fingerprints))))))))

(deftest ^:parallel cross-source-predicate-produces-mixed-and-projected-test
  (let [query (-> (lib.tu/query-with-join)
                  (lib/filter (lib/= (meta/field-metadata :venues :category-id)
                                     (lib/with-join-alias (meta/field-metadata :categories :id) "Cat"))))
        rows  (:segments (extract/extract-usage-facts query))]
    (is (= 3 (count rows)))
    (is (= 1 (count (filter #(= :mixed (:ownership-mode %)) rows))))
    (is (= #{{:source-type :table, :source-id (meta/id :venues), :ownership-mode :projected, :field-id (meta/id :venues :category-id)}
             {:source-type :table, :source-id (meta/id :categories), :ownership-mode :projected, :field-id (meta/id :categories :id)}}
           (set (map #(select-keys % [:source-type :source-id :ownership-mode :field-id])
                     (filter #(= :projected (:ownership-mode %)) rows)))))))
