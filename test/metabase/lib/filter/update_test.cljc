(ns metabase.lib.filter.update-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.lib.core :as lib]
   [metabase.lib.test-metadata :as meta]
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))))

#?(:cljs (comment metabase.test-runner.assert-exprs.approximately-equal/keep-me))

(deftest ^:parallel update-numeric-filter-test
  (testing "Add a new filter"
    (let [query (lib/query meta/metadata-provider (meta/table-metadata :orders))]
      (is (=? {:stages [{:filters [[:between {} [:field {} (meta/id :orders :id)] -100 200]]}]}
              (lib/update-numeric-filter query (meta/field-metadata :orders :id) -100 200))))))

(deftest ^:parallel update-numeric-filter-remove-existing-test
  (testing "Remove existing filter(s) against this column. Don't remove ones from a different source"
    (let [query (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
                    (lib/join (-> (lib/join-clause (meta/table-metadata :orders))
                                  (lib/with-join-conditions [(lib/= (meta/field-metadata :orders :id)
                                                                    (-> (meta/field-metadata :orders :id)
                                                                        (lib/with-join-alias "O2")))])
                                  (lib/with-join-alias "O2")))
                    (lib/filter (lib/= (meta/field-metadata :orders :id) 1))
                    (lib/filter (lib/= (meta/field-metadata :orders :id) 2))
                    (lib/filter (lib/= (lib/with-join-alias (meta/field-metadata :orders :id) "O2") 4)))]
      (is (=? {:stages [{:filters [[:= {} [:field {:join-alias "O2"} (meta/id :orders :id)] 4]
                                   [:between {} [:field {} (meta/id :orders :id)] -100 200]]}]}
              (lib/update-numeric-filter query (meta/field-metadata :orders :id) -100 200))))))

(deftest ^:parallel update-numeric-filter-fix-order-test
  (testing "If min and max are in the wrong order, flip them around"
    (let [query (lib/query meta/metadata-provider (meta/table-metadata :orders))]
      (is (=? {:stages [{:filters [[:between {} [:field {} (meta/id :orders :id)] -100 200]]}]}
              (lib/update-numeric-filter query (meta/field-metadata :orders :id) 200 -100))))))

(deftest ^:parallel update-lat-lon-filter-test
  (testing "Add a new filter"
    (let [query (lib/query meta/metadata-provider (meta/table-metadata :venues))]
      (is (=? {:stages [{:filters [[:inside
                                    {}
                                    [:field {} (meta/id :venues :latitude)]
                                    [:field {} (meta/id :venues :longitude)]
                                    10
                                    -20
                                    -10
                                    20]]}]}
              (lib/update-lat-lon-filter query
                                         (meta/field-metadata :venues :latitude)
                                         (meta/field-metadata :venues :longitude)
                                         {:north 10, :south -10, :east 20, :west -20}))))))

(deftest ^:parallel update-lat-lon-filter-remove-existing-test
  (testing "Remove existing filter(s) against this column. Don't remove ones from a different source"
    (let [query (-> (lib/query meta/metadata-provider (meta/table-metadata :venues))
                    (lib/join (-> (lib/join-clause (meta/table-metadata :venues))
                                  (lib/with-join-conditions [(lib/= (meta/field-metadata :venues :id)
                                                                    (-> (meta/field-metadata :venues :id)
                                                                        (lib/with-join-alias "V2")))])
                                  (lib/with-join-alias "V2")))
                    (lib/filter (lib/= (meta/field-metadata :venues :latitude) 1))
                    (lib/filter (lib/= (meta/field-metadata :venues :longitude) 2))
                    (lib/filter (lib/= (lib/with-join-alias (meta/field-metadata :venues :latitude) "V2") 4)))]
      (is (=? {:stages [{:filters [[:= {} [:field {:join-alias "V2"} (meta/id :venues :latitude)] 4]
                                   [:inside
                                    {}
                                    [:field {} (meta/id :venues :latitude)]
                                    [:field {} (meta/id :venues :longitude)]
                                    10
                                    -20
                                    -10
                                    20]]}]}
              (lib/update-lat-lon-filter query
                                         (meta/field-metadata :venues :latitude)
                                         (meta/field-metadata :venues :longitude)
                                         {:north 10, :south -10, :east 20, :west -20}))))))

(deftest ^:parallel update-lat-lon-filter-fix-order-test
  (testing "Fix lat/lon min/max if values are passed in backwards"
    (let [query (lib/query meta/metadata-provider (meta/table-metadata :venues))]
      (is (=? {:stages [{:filters [[:inside
                                    {}
                                    [:field {} (meta/id :venues :latitude)]
                                    [:field {} (meta/id :venues :longitude)]
                                    10
                                    -20
                                    -10
                                    20]]}]}
              (lib/update-lat-lon-filter query
                                         (meta/field-metadata :venues :latitude)
                                         (meta/field-metadata :venues :longitude)
                                         {:north -10, :south 10, :east -20, :west 20}))))))

(deftest ^:parallel update-temporal-filter-test
  (testing "Add a new filter -- no unit"
    (let [query (lib/query meta/metadata-provider (meta/table-metadata :checkins))]
      (is (=? {:stages [{:filters [[:between
                                    {}
                                    [:field {} (meta/id :checkins :date)]
                                    "2024-01-02"
                                    "2025-02-01"]]}]}
              (lib/update-temporal-filter query (meta/field-metadata :checkins :date) "2024-01-02" "2025-02-01"))))))

(deftest ^:parallel update-temporal-filter-unit-test
  (testing "Add a new filter -- with temporal unit"
    (let [query (lib/query meta/metadata-provider (meta/table-metadata :checkins))]
      (is (=? {:stages [{:filters [[:between
                                    {}
                                    [:field {} (meta/id :checkins :date)]
                                    ;; since 2024-01-02T15:22 starts after 2024-01-02T00:00 we should round up to the
                                    ;; next whole day.
                                    "2024-01-03T00:00"
                                    "2025-02-01T00:00"]]}]}
              (lib/update-temporal-filter query
                                          (-> (meta/field-metadata :checkins :date)
                                              (lib/with-temporal-bucket :day))
                                          "2024-01-02T15:22:00"
                                          "2025-02-01T15:22:00"))))))

(deftest ^:parallel update-temporal-filter-existing-breakout-test
  (testing "Update an existing query with breakout and filter against this column"
    (let [query (-> (lib/query meta/metadata-provider (meta/table-metadata :checkins))
                    (lib/breakout (-> (meta/field-metadata :checkins :date)
                                      (lib/with-temporal-bucket :day)))
                    (lib/filter (lib/= (-> (meta/field-metadata :checkins :date)
                                           (lib/with-temporal-bucket :day))
                                       "2024-01-02T15:00")))]
      (is (=? {:stages [{:breakout [[:field {:temporal-unit :day} (meta/id :checkins :date)]]
                         :filters  [[:between
                                     {}
                                     [:field {} (meta/id :checkins :date)]
                                     ;; since 2024-01-02T15:22 starts after 2024-01-02T00:00 we should round up to the
                                     ;; next whole day.
                                     "2024-01-03T00:00"
                                     "2025-02-01T00:00"]]}]}
              (lib/update-temporal-filter query
                                          (-> (meta/field-metadata :checkins :date)
                                              (lib/with-temporal-bucket :day))
                                          "2024-01-02T15:22:00"
                                          "2025-02-01T15:22:00"))))))

(deftest ^:parallel update-temporal-filter-existing-breakout-change-unit-test
  (testing "Update an existing query with breakout and filter against this column; update the breakout unit"
    (let [query (-> (lib/query meta/metadata-provider (meta/table-metadata :checkins))
                    (lib/breakout (-> (meta/field-metadata :checkins :date)
                                      (lib/with-temporal-bucket :day)))
                    (lib/filter (lib/= (-> (meta/field-metadata :checkins :date)
                                           (lib/with-temporal-bucket :day))
                                       "2024-01-02T15:00")))]
      (is (=? {:stages [{:breakout [[:field
                                     ;; `:day` should have been changed to `:hour`, because there aren't enough days
                                     ;; between `2024-01-02` and `2024-01-03`
                                     {:temporal-unit :hour}
                                     (meta/id :checkins :date)]]
                         :filters  [[:between
                                     {}
                                     [:field {} (meta/id :checkins :date)]
                                     "2024-01-02"
                                     "2024-01-03"]]}]}
              (lib/update-temporal-filter query
                                          (-> (meta/field-metadata :checkins :date)
                                              (lib/with-temporal-bucket :day))
                                          "2024-01-01"
                                          "2024-01-03"))))))

(deftest ^:parallel update-temporal-filter-equals-test
  (testing "If the resulting start and end values are the same then generate an := filter instead of :between"
    (let [query (lib/query meta/metadata-provider (meta/table-metadata :checkins))]
      (is (=? {:stages [{:filters [[:=
                                    {}
                                    [:field {:temporal-unit :day} (meta/id :checkins :date)]
                                    "2024-01-02"]]}]}
              (lib/update-temporal-filter query
                                          (-> (meta/field-metadata :checkins :date)
                                              (lib/with-temporal-bucket :day))
                                          "2024-01-01"
                                          "2024-01-02"))))))

#?(:cljs
   (deftest ^:parallel update-temporal-filter-js-Date-test
     (testing "Should work with native JavaScript Dates (#37304)"
       (let [query (lib/query meta/metadata-provider (meta/table-metadata :checkins))]
         (is (=? {:stages [{:filters [[:between
                                       {}
                                       [:field {} (meta/id :checkins :date)]
                                       "2024-01-02"
                                       "2025-02-01"]]}]}
                 (lib/update-temporal-filter query
                                             (meta/field-metadata :checkins :date)
                                             (js/Date. "2024-01-02")
                                             (js/Date. "2025-02-01"))))))))

#?(:cljs
   (deftest ^:parallel update-temporal-filter-js-Date-unit-test
     (testing "Add a new filter -- with temporal unit"
       (let [query (lib/query meta/metadata-provider (meta/table-metadata :checkins))]
         (is (=? {:stages [{:filters [[:between
                                       {}
                                       [:field {} (meta/id :checkins :date)]
                                       ;; since 2024-01-02T15:22 starts after 2024-01-02T00:00 we should round up to the
                                       ;; next whole day.
                                       "2024-01-03T00:00"
                                       "2025-02-01T00:00"]]}]}
                 (lib/update-temporal-filter query
                                             (-> (meta/field-metadata :checkins :date)
                                                 (lib/with-temporal-bucket :day)
                                                 ;; make sure conversion of Date -> String is based on the effective-type
                                                 (assoc :effective-type :type/DateTime))
                                             (js/Date. "2024-01-02T15:22:00")
                                             (js/Date. "2025-02-01T15:22:00"))))))))
