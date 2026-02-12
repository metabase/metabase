(ns metabase.lib.fe-util-test
  (:require
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))
   [clojure.test :refer [are deftest is testing]]
   [medley.core :as m]
   [metabase.lib.core :as lib]
   [metabase.lib.expression :as lib.expression]
   [metabase.lib.fe-util :as lib.fe-util]
   [metabase.lib.field :as lib.field]
   [metabase.lib.filter :as lib.filter]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.query :as lib.query]
   [metabase.lib.ref :as lib.ref]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]
   [metabase.util.malli :as mu]
   [metabase.util.number :as u.number]
   [metabase.util.time :as u.time]))

(def ^:private all-filter-operators
  [:= :!= :> :< :>= :<= :between :inside
   :contains :does-not-contain :starts-with :ends-with
   :is-null :not-null :is-empty :not-empty])

(deftest ^:parallel basic-filter-parts-test
  (let [query (-> (lib/query meta/metadata-provider (meta/table-metadata :users))
                  (lib/join (-> (lib/join-clause (meta/table-metadata :checkins)
                                                 [(lib/=
                                                   (meta/field-metadata :checkins :user-id)
                                                   (meta/field-metadata :users :id))])
                                (lib/with-join-fields :all)))
                  (lib/join (-> (lib/join-clause (meta/table-metadata :venues)
                                                 [(lib/=
                                                   (meta/field-metadata :checkins :venue-id)
                                                   (meta/field-metadata :venues :id))])
                                (lib/with-join-fields :all))))]
    (doseq [col (lib/filterable-columns query)
            short-op all-filter-operators
            :let [expression-clause (case short-op
                                      :between (lib/expression-clause short-op [col col col] {})
                                      (:contains :does-not-contain :starts-with :ends-with) (lib/expression-clause short-op [col "123"] {})
                                      (:is-null :not-null :is-empty :not-empty) (lib/expression-clause short-op [col] {})
                                      :inside (lib/expression-clause short-op [col 12 34 56 78 90] {})
                                      (:< :>) (lib/expression-clause short-op [col col] {})
                                      (lib/expression-clause short-op [col 123] {}))]]
      (testing (str short-op " with " (:name col))
        (is (=? {:lib/type :mbql/expression-parts
                 :operator short-op
                 :args vector?}
                (lib/expression-parts query expression-clause)))))))

(deftest ^:parallel literals-expression-parts-test
  (let [query (lib/query meta/metadata-provider (meta/table-metadata :users))]
    (doseq [literal ["foo"
                     ""
                     "42"
                     42
                     0
                     -1
                     true
                     false]]
      (testing (str "literal " literal)
        (is (=? literal (lib/expression-parts query literal)))))))

(deftest ^:parallel bigint-value-expression-parts-test
  (let [query (lib/query meta/metadata-provider (meta/table-metadata :users))
        uid  (str (random-uuid))]
    (is (=? {:lib/type :mbql/expression-parts
             :operator :value
             :options {:base-type :type/BigInteger
                       :effective-type :type/BigInteger
                       :lib/uuid uid}
             :args ["12345"]}
            (lib/expression-parts query [:value {:base-type :type/BigInteger
                                                 :effective-type :type/BigInteger
                                                 :lib/uuid uid} "12345"])))))

(deftest ^:parallel filter-parts-field-properties-test
  (let [query (-> (lib/query meta/metadata-provider (meta/table-metadata :users))
                  (lib/join (-> (lib/join-clause (meta/table-metadata :checkins)
                                                 [(lib/=
                                                   (meta/field-metadata :checkins :user-id)
                                                   (meta/field-metadata :users :id))])
                                (lib/with-join-fields :all)))
                  (lib/join (-> (lib/join-clause (meta/table-metadata :venues)
                                                 [(lib/=
                                                   (meta/field-metadata :checkins :venue-id)
                                                   (meta/field-metadata :venues :id))])
                                (lib/with-join-fields :all))))
        cols (->> (lib/filterable-columns query)
                  (map #(m/filter-vals some? %))
                  (m/index-by :id))
        user-id-col (cols (meta/id :users :id))
        checkins-user-id-col (cols (meta/id :checkins :user-id))
        user-last-login-col (cols (meta/id :users :last-login))
        checkins-date-col (cols (meta/id :checkins :date))]
    (testing "binning"
      (is (=? {:lib/type :mbql/expression-parts
               :operator :=
               :args
               [{:lib/type :metadata/column
                 :lib/source-uuid string?
                 :effective-type :type/Integer
                 :metabase.lib.field/binning {:strategy :default}

                 :active true
                 :id (:id checkins-user-id-col)
                 :display-name "User ID: Auto binned"
                 :metabase.lib.join/join-alias "Checkins"}
                (assoc (m/filter-vals some? (meta/field-metadata :users :id)) :display-name "ID: Auto binned")]}
              (lib/expression-parts query (lib/= (lib/with-binning checkins-user-id-col {:strategy :default})
                                                 (lib/with-binning user-id-col {:strategy :default}))))))
    (testing "bucketing"
      (is (=? {:lib/type :mbql/expression-parts
               :operator :=
               :args
               [{:lib/type :metadata/column
                 :lib/source-uuid string?
                 :effective-type :type/Date

                 :id (:id checkins-date-col)
                 :metabase.lib.field/temporal-unit :day
                 :display-name "Date: Day"
                 :metabase.lib.join/join-alias "Checkins"}
                (assoc (m/filter-vals some? (meta/field-metadata :users :last-login)) :display-name "Last Login: Day")]}
              (lib/expression-parts query (lib/= (lib/with-temporal-bucket checkins-date-col :day)
                                                 (lib/with-temporal-bucket user-last-login-col :day))))))))

(deftest ^:parallel nested-parts-test
  (is (=? {:lib/type :mbql/expression-parts
           :operator :=
           :args [{:lib/type :metadata/column}
                  {:lib/type :mbql/expression-parts
                   :operator :+
                   :args [{:lib/type :metadata/column}
                          {:lib/type :metadata/column}
                          1]}]}
          (lib/expression-parts (lib/query meta/metadata-provider (meta/table-metadata :products))
                                (lib/= (lib/with-temporal-bucket (meta/field-metadata :products :created-at) :day)
                                       (lib/+ (meta/field-metadata :products :id)
                                              (meta/field-metadata :products :id)
                                              1))))))

(deftest ^:parallel expression-parts-column-reference-test
  (let [query (lib/query meta/metadata-provider (meta/table-metadata :users))
        stage-number -1]
    (testing "column references"
      (doseq [col (lib/filterable-columns query)]
        (is (=? {:lib/type :metadata/column
                 :id (:id col)
                 :name (:name col)
                 :display-name (:display-name col)}
                (lib/expression-parts query stage-number (lib.ref/ref col))))))
    (testing "unknown column reference"
      (let [unknown-ref [:field {:lib/uuid (str (random-uuid))} 12345678]]
        (mu/disable-enforcement
          (is (=? {:lib/type :metadata/column
                   :display-name "Unknown Field"}
                  (lib/expression-parts query stage-number unknown-ref))))))))

(deftest ^:parallel expression-parts-segment-reference-test
  (let [segment-id 100
        segment-name "FooBar"
        segment-description "This is a segment"
        segments-db  {:segments [{:id          segment-id
                                  :name        segment-name
                                  :table-id    (meta/id :venues)
                                  :definition  {}
                                  :description segment-description}]}
        metadata-provider (lib.tu/mock-metadata-provider meta/metadata-provider segments-db)
        query (lib/query metadata-provider (meta/table-metadata :venues))
        stage-number -1]
    (testing "segment references"
      (doseq [segment (lib/available-segments query)]
        (is (=? {:lib/type :metadata/segment
                 :id segment-id
                 :name segment-name
                 :description segment-description}
                (lib/expression-parts query stage-number (lib.ref/ref segment))))))
    (testing "unknown segment reference"
      (let [unknown-ref [:segment {:lib/uuid (str (random-uuid))} 101]]
        (mu/disable-enforcement
          (is (=? {:lib/type :metadata/segment
                   :display-name "Unknown Segment"}
                  (lib/expression-parts query stage-number unknown-ref))))))))

(deftest ^:parallel expression-parts-metric-reference-test
  (let [metric-id 100
        metric-name "FooBar"
        metric-description "This is a metric"
        metrics-db  {:segments [{:id          metric-id
                                 :name        metric-name
                                 :table-id    (meta/id :venues)
                                 :definition  {}
                                 :description metric-description}]}
        metadata-provider (lib.tu/mock-metadata-provider meta/metadata-provider metrics-db)
        query (lib/query metadata-provider (meta/table-metadata :venues))
        stage-number -1]
    (testing "metric references"
      (doseq [metric (lib/available-metrics query)]
        (is (=? {:lib/type :metadata/segment
                 :id metric-id
                 :name metric-name
                 :description metric-description}
                (lib/expression-parts query stage-number (lib.ref/ref metric))))))
    (testing "unknown metric reference"
      (let [unknown-ref [:metric {:lib/uuid (str (random-uuid))} 101]]
        (mu/disable-enforcement
          (is (=? {:lib/type :metadata/metric
                   :id 101
                   :display-name "Unknown Metric"}
                  (lib/expression-parts query stage-number unknown-ref))))))))

(deftest ^:parallel expression-parts-expression-reference-test
  (let [expression-name "Foo"
        other-expression-name "Bar"
        query (-> (lib.tu/venues-query)
                  (lib/expression expression-name
                                  (lib/* (lib.tu/field-clause :venues :price {:base-type :type/Integer}) 2))
                  (lib/expression other-expression-name
                                  [:expression {:base-type :type/Integer} expression-name]))
        ;;

        stage-number -1]
    (testing "expression references"
      (mu/disable-enforcement
        (is (=? {:lib/type :metadata/column
                 :name expression-name
                 :lib/expression-name expression-name
                 :lib/source :source/expressions}
                (lib/expression-parts query stage-number [:expression {:base-type :type/Integer} expression-name])))))

    (testing "nested expression references"
      (mu/disable-enforcement
        (is (=? {:lib/type :metadata/column
                 :name other-expression-name
                 :lib/expression-name other-expression-name
                 :lib/source :source/expressions}
                (lib/expression-parts query stage-number [:expression {} other-expression-name])))))))

(deftest ^:parallel expression-clause-test
  (is (=? [:= {:lib/uuid string?} [:field {:lib/uuid string?} (meta/id :products :id)] 1]
          (lib/expression-clause := [(meta/field-metadata :products :id) 1] {})))
  (is (=? [:= {:lib/uuid string?} [:field {:lib/uuid string?} (meta/id :products :id)] 1]
          (lib/expression-clause := [(meta/field-metadata :products :id) 1] {}))))

(deftest ^:parallel invisible-expression-parts-test
  (is (=? {:lib/type :mbql/expression-parts
           :operator :=
           :args [{:lib/type :metadata/column
                   :name "ID"
                   :display-name "ID"}
                  1]}
          (lib/expression-parts (lib.tu/venues-query) -1 (lib/= (lib/ref (meta/field-metadata :products :id))
                                                                1)))))

(deftest ^:parallel normalize-expression-clause-test
  (let [column (m/filter-vals some? (meta/field-metadata :checkins :date))]
    (testing "normalizes week-mode correctly"
      (doseq [[expected strings] {:us ["US" "us" "Us"], :iso ["ISO" "iso" "Iso"]}
              week-mode strings]
        (is (= expected
               (last (lib/expression-clause {:lib/type :mbql/expression-parts
                                             :operator :get-week
                                             :options {}
                                             :args [column week-mode]}))))))))

(deftest ^:parallel case-or-if-parts-test
  (let [query         (lib/query meta/metadata-provider (meta/table-metadata :venues))
        int-field     (m/filter-vals some? (meta/field-metadata :venues :category-id))
        other-int-field     (m/filter-vals some? (meta/field-metadata :venues :price))
        boolean-field (m/filter-vals some? (meta/field-metadata :venues :category-id))
        test-cases {(lib/case [[boolean-field int-field]])
                    {:operator :case
                     :options {}
                     :args [boolean-field int-field]}

                    (lib/case [[boolean-field int-field]] nil)
                    {:operator :case
                     :options {}
                     :args [boolean-field int-field]}

                    (lib/case [[boolean-field int-field]] other-int-field)
                    {:operator :case
                     :options {}
                     :args [boolean-field int-field other-int-field]}

                    (lib/case [[boolean-field int-field] [boolean-field other-int-field]])
                    {:operator :case
                     :options {}
                     :args [boolean-field int-field boolean-field other-int-field]}

                    (lib/case [[boolean-field int-field] [boolean-field other-int-field]] nil)
                    {:operator :case
                     :options {}
                     :args [boolean-field int-field boolean-field other-int-field]}

                    (lib/case [[boolean-field int-field] [boolean-field other-int-field]] other-int-field)
                    {:operator :case
                     :options {}
                     :args [boolean-field int-field boolean-field other-int-field other-int-field]}}]
    (testing "case pairs should be flattened in expression parts"
      (doseq [[clause parts] test-cases]
        (let [{:keys [operator options args]} parts
              res (lib.fe-util/expression-parts query -1 clause)]
          (is (=? operator (:operator res)))
          (is (=? options  (:options res)))
          (is (=? (map :id args) (map :id (:args res)))))))

    (testing "case pairs should be unflattened in expression clause"
      (doseq [[expected-expression parts] test-cases]
        (let [{:keys [operator options args]} parts
              actual-expression (lib.fe-util/expression-clause operator args options)
              [expected-op _ expected-args] expected-expression
              [actual-op _ actual-args] actual-expression]
          (is (=? expected-op actual-op))
          (is (=? (map :id expected-args) (map :id actual-args))))))

    (testing "case/if should round-trip through expression-parts and expression-clause"
      (doseq [[clause] test-cases]
        (let [parts                     (lib.fe-util/expression-parts query clause)
              round-tripped-expression  (lib.fe-util/expression-clause
                                         (:operator parts)
                                         (:args parts)
                                         nil)
              round-tripped-parts       (lib.fe-util/expression-parts query round-tripped-expression)]

          (is (=? (:operator parts) (:operator round-tripped-parts)))
          (is (=? (map :id (:args parts)) (map :id (:args round-tripped-parts)))))))))

(deftest ^:parallel nested-case-or-if-parts-test
  (let [query        (lib/query meta/metadata-provider (meta/table-metadata :venues))
        string-field  (m/filter-vals some? (meta/field-metadata :venues :name))
        boolean-field (m/filter-vals some? (meta/field-metadata :venues :category-id))]
    (testing "deeply nested case/if should round-trip through expression-parts and expression-clause"
      (doseq [parts [{:lib/type :mbql/expression-parts
                      :operator :case
                      :options {}
                      :args [boolean-field
                             string-field
                             "default"]}

                     {:lib/type :mbql/expression-parts
                      :operator :upper
                      :options {}
                      :args [{:lib/type :mbql/expression-parts
                              :operator :case
                              :options {}
                              :args [boolean-field
                                     string-field
                                     {:lib/type :mbql/expression-parts
                                      :operator :case
                                      :options {}
                                      :args [boolean-field
                                             string-field
                                             "default"]}]}]}

                     {:lib/type :mbql/expression-parts
                      :operator :upper
                      :options {}
                      :args [{:lib/type :mbql/expression-parts
                              :operator :lower
                              :options {}
                              :args [{:lib/type :mbql/expression-parts
                                      :operator :case
                                      :options {}
                                      :args [boolean-field string-field]}]}]}]]

        (let [expression (lib.fe-util/expression-clause
                          (:operator parts)
                          (:args parts)
                          (:options parts))
              round-tripped-parts (lib.fe-util/expression-parts query expression)]
          (is (=? parts round-tripped-parts)))))))

(deftest ^:parallel string-filter-parts-test
  (let [query  (lib.tu/venues-query)
        column (m/filter-vals some? (meta/field-metadata :venues :name))]
    (testing "clause to parts roundtrip"
      (doseq [[clause parts] {(lib.filter/is-empty column)
                              {:operator :is-empty, :column column}

                              (lib.filter/not-empty column)
                              {:operator :not-empty, :column column}

                              (lib.filter/= column "A")
                              {:operator :=, :column column, :values ["A"]}

                              (lib.filter/= column "A" "B")
                              {:operator :=, :column column, :values ["A" "B"]}

                              (lib.filter/in column "A" "B")
                              {:operator :=, :column column, :values ["A" "B"]}

                              (lib.filter/!= column "A")
                              {:operator :!=, :column column, :values ["A"]}

                              (lib.filter/!= column "A" "B")
                              {:operator :!=, :column column, :values ["A" "B"]}

                              (lib.filter/not-in column "A" "B")
                              {:operator :!=, :column column, :values ["A" "B"]}

                              (lib.filter/contains column "A")
                              {:operator :contains, :column column, :values ["A"], :options {:case-sensitive true}}

                              (lib.filter/contains column "A" "B")
                              {:operator :contains, :column column, :values ["A" "B"]}

                              (lib.filter/does-not-contain column "A" "B")
                              {:operator :does-not-contain, :column column, :values ["A" "B"]}

                              (lib.filter/starts-with column "A" "B")
                              {:operator :starts-with, :column column, :values ["A" "B"]}

                              (lib.filter/ends-with column "A" "B")
                              {:operator :ends-with, :column column, :values ["A" "B"]}

                              (lib.fe-util/expression-clause :contains [column "A"] {:case-sensitive false})
                              {:operator :contains, :column column, :values ["A"], :options {:case-sensitive false}}

                              (lib.fe-util/expression-clause :contains [column "A" "B"] {:case-sensitive false})
                              {:operator :contains, :column column, :values ["A" "B"], :options {:case-sensitive false}}}]
        (let [{:keys [operator column values options]} parts]
          (is (=? parts (lib.fe-util/string-filter-parts query -1 clause)))
          (is (=? parts (lib.fe-util/string-filter-parts query -1 (lib.fe-util/string-filter-clause operator
                                                                                                    column
                                                                                                    values
                                                                                                    options)))))))
    (testing "unsupported clauses"
      (are [clause] (nil? (lib.fe-util/string-filter-parts query -1 clause))
        (lib.filter/= "A" column)
        (lib.filter/is-null column)
        (lib.expression/concat column "A")
        (lib.filter/and (lib.filter/= column "A") true)))
    (testing "should correctly propagate `:id` when destructuring a filter clause in a nested query"
      (let [query         (lib.tu/venues-query)
            query         (-> query
                              (lib/aggregate (lib/count))
                              (lib/breakout (m/find-first #(= (:name %) "NAME") (lib/breakoutable-columns query)))
                              (lib/append-stage))
            filter-clause (lib/= (m/find-first #(= (:name %) "NAME") (lib/filterable-columns query)) "test")
            filter-parts  (lib.fe-util/string-filter-parts query -1 filter-clause)]
        (is (=? {:field-id (meta/id :venues :name)}
                (lib.field/field-values-search-info query (:column filter-parts))))))
    (testing "should create case-insensitive filter clauses unless `case-sensitive` is explicitly set to `true`"
      (doseq [operator [:contains :does-not-contain :starts-with :ends-with]]
        (are [expected options] (=? expected (lib/options (lib.fe-util/string-filter-clause operator column ["A"] options)))
          {:case-sensitive false} {}
          {:case-sensitive false} {:case-sensitive false}
          {:case-sensitive true} {:case-sensitive true})))))

(deftest ^:parallel number-filter-parts-test
  (let [query         (lib.tu/venues-query)
        column        (m/filter-vals some? (meta/field-metadata :venues :price))
        bigint-value  (u.number/bigint "9007199254740993")
        bigint-clause (lib.expression/value bigint-value)]
    (testing "clause to parts roundtrip"
      (doseq [[clause parts] {(lib.filter/is-null column)       {:operator :is-null, :column column}
                              (lib.filter/not-null column)      {:operator :not-null, :column column}
                              (lib.filter/= column 10)          {:operator :=, :column column, :values [10]}
                              (lib.filter/= column 10 20)       {:operator :=, :column column, :values [10 20]}
                              (lib.filter/in column 10 20)      {:operator :=, :column column, :values [10 20]}
                              (lib.filter/!= column 10)         {:operator :!=, :column column, :values [10]}
                              (lib.filter/!= column 10 20)      {:operator :!=, :column column, :values [10 20]}
                              (lib.filter/not-in column 10 20)  {:operator :!=, :column column, :values [10 20]}
                              (lib.filter/> column 10)          {:operator :>, :column column, :values [10]}
                              (lib.filter/>= column 10)         {:operator :>=, :column column, :values [10]}
                              (lib.filter/< column 10)          {:operator :<, :column column, :values [10]}
                              (lib.filter/<= column 10)         {:operator :<=, :column column, :values [10]}
                              (lib.filter/between column 10 20) {:operator :between, :column column, :values [10 20]}

                              ;; bigint
                              (lib.filter/= column bigint-clause) {:operator :=, :column column, :values [bigint-value]}
                              (lib.filter/!= column bigint-clause) {:operator :!=, :column column, :values [bigint-value]}
                              (lib.filter/> column bigint-clause) {:operator :>, :column column, :values [bigint-value]}}]
        (let [{:keys [operator column values]} parts]
          (is (=? parts (lib.fe-util/number-filter-parts query -1 clause)))
          (is (=? parts (lib.fe-util/number-filter-parts query -1 (lib.fe-util/number-filter-clause operator
                                                                                                    column
                                                                                                    values)))))))
    (testing "unsupported clauses"
      (are [clause] (nil? (lib.fe-util/number-filter-parts query -1 clause))
        (lib.filter/= 10 column)
        (lib.filter/is-null (meta/field-metadata :venues :name))
        (lib.expression/+ column 10)
        (lib.filter/and (lib.filter/= column 10) true)))))

(deftest ^:parallel coordinate-filter-parts-test
  (let [query         (lib.query/query meta/metadata-provider (meta/table-metadata :orders))
        lat-column    (m/filter-vals some? (meta/field-metadata :people :latitude))
        lon-column    (m/filter-vals some? (meta/field-metadata :people :longitude))
        bigint-value  (u.number/bigint "9007199254740993")
        bigint-clause (lib.expression/value bigint-value)]
    (testing "clause to parts roundtrip"
      (doseq [[clause parts] {(lib.filter/= lat-column 10)
                              {:operator :=, :column lat-column, :values [10]}

                              (lib.filter/= lat-column 10 20)
                              {:operator :=, :column lat-column, :values [10 20]}

                              (lib.filter/in lat-column 10 20)
                              {:operator :=, :column lat-column, :values [10 20]}

                              (lib.filter/!= lon-column 10)
                              {:operator :!=, :column lon-column, :values [10]}

                              (lib.filter/!= lon-column 10 20)
                              {:operator :!=, :column lon-column, :values [10 20]}

                              (lib.filter/not-in lon-column 10 20)
                              {:operator :!=, :column lon-column, :values [10 20]}

                              (lib.filter/> lat-column 10)
                              {:operator :>, :column lat-column, :values [10]}

                              (lib.filter/>= lat-column 10)
                              {:operator :>=, :column lat-column, :values [10]}

                              (lib.filter/< lat-column 10)
                              {:operator :<, :column lat-column, :values [10]}

                              (lib.filter/<= lat-column 10)
                              {:operator :<=, :column lat-column, :values [10]}

                              (lib.filter/between lat-column 10 20)
                              {:operator :between, :column lat-column, :values [10 20]}

                              (lib.filter/inside lat-column lon-column 10 20 30 40)
                              {:operator         :inside
                               :column           lat-column
                               :longitude-column lon-column
                               :values           [10 20 30 40]}

                              ;; bigint

                              (lib.filter/= lat-column bigint-clause)
                              {:operator :=, :column lat-column, :values [bigint-value]}

                              (lib.filter/!= lat-column bigint-clause)
                              {:operator :!=, :column lat-column, :values [bigint-value]}

                              (lib.filter/> lat-column bigint-clause)
                              {:operator :>, :column lat-column, :values [bigint-value]}

                              (lib.filter/between lat-column bigint-clause bigint-clause)
                              {:operator :between, :column lat-column, :values [bigint-value bigint-value]}}]
        (let [{:keys [operator column longitude-column values]} parts]
          (is (=? parts (lib.fe-util/coordinate-filter-parts query -1 clause)))
          (is (=? parts (lib.fe-util/coordinate-filter-parts query -1 (lib.fe-util/coordinate-filter-clause operator
                                                                                                            column
                                                                                                            longitude-column
                                                                                                            values)))))))
    (testing "unsupported clauses"
      (are [clause] (nil? (lib.fe-util/coordinate-filter-parts query -1 clause))
        (lib.filter/= 10 lat-column)
        (lib.filter/is-null lat-column)
        (lib.filter/= (meta/field-metadata :orders :total) 10)
        (lib.expression/+ lat-column 10)
        (lib.filter/and (lib.filter/= lat-column 10) true)))))

(deftest ^:parallel boolean-filter-parts-test
  (let [query  (-> (lib.tu/venues-query)
                   (lib.expression/expression "Boolean"
                                              (lib.filter/is-empty (meta/field-metadata :venues :name))))
        column (m/find-first #(= (:name %) "Boolean") (lib.filter/filterable-columns query))]
    (testing "clause to parts roundtrip"
      (doseq [[clause parts] {(lib.filter/is-null column)  {:operator :is-null, :column column}
                              (lib.filter/not-null column) {:operator :not-null, :column column}
                              (lib.filter/= column true)   {:operator :=, :column column, :values [true]}
                              (lib.filter/= column false)  {:operator :=, :column column, :values [false]}}]
        (let [{:keys [operator column values]} parts
              expected (merge parts {:column (select-keys column [:name])})]
          (is (=? expected (lib.fe-util/boolean-filter-parts query -1 clause)))
          (is (=? expected (lib.fe-util/boolean-filter-parts query -1 (lib.fe-util/boolean-filter-clause operator
                                                                                                         column
                                                                                                         values)))))))
    (testing "unsupported clauses"
      (are [clause] (nil? (lib.fe-util/boolean-filter-parts query -1 clause))
        (lib.filter/= true column)
        (lib.filter/!= column true)
        (lib.filter/is-null (meta/field-metadata :venues :name))
        (lib.filter/and (lib.filter/= column true) true)))))

(defn- format-date-filter-parts
  [{:keys [with-time?], :as parts}]
  (update parts :values
          (fn [values] (mapv #(u.time/format-for-base-type % (if with-time? :type/DateTime :type/Date)) values))))

(deftest ^:parallel specific-date-filter-parts-test
  (let [query  (lib.tu/venues-query)
        column (-> (m/filter-vals some? (meta/field-metadata :checkins :date))
                   (assoc :base-type :type/DateTime :effective-type :type/DateTime))]
    (testing "clause to parts roundtrip"
      (doseq [[clause parts] {(lib.filter/= column "2024-11-28")
                              {:operator   :=
                               :column     column
                               :values     [(u.time/local-date 2024 11 28)]
                               :with-time? false}

                              (lib.filter/= column "2024-11-28T00:00:00")
                              {:operator   :=
                               :column     column
                               :values     [(u.time/local-date-time 2024 11 28 0 0 0)]
                               :with-time? true}

                              (lib.filter/= column "2024-11-28T10:20:30")
                              {:operator   :=
                               :column     column
                               :values     [(u.time/local-date-time 2024 11 28 10 20 30)]
                               :with-time? true}

                              (lib.filter/> column "2024-11-28")
                              {:operator   :>
                               :column     column
                               :values     [(u.time/local-date 2024 11 28)]
                               :with-time? false}

                              (lib.filter/< column "2024-11-28")
                              {:operator   :<
                               :column     column
                               :values     [(u.time/local-date 2024 11 28)]
                               :with-time? false}

                              (lib.filter/between column "2024-11-28" "2024-12-04")
                              {:operator   :between
                               :column     column
                               :values     [(u.time/local-date 2024 11 28) (u.time/local-date 2024 12 4)]
                               :with-time? false}

                              (lib.filter/between column "2024-11-28T00:00:00" "2024-12-04T00:00:00")
                              {:operator   :between
                               :column     column
                               :values     [(u.time/local-date-time 2024 11 28 0 0 0) (u.time/local-date-time 2024 12 4 0 0 0)]
                               :with-time? true}

                              (lib.filter/between column "2024-11-28T10:20:30" "2024-12-04T11:21:31")
                              {:operator   :between
                               :column     column
                               :values     [(u.time/local-date-time 2024 11 28 10 20 30) (u.time/local-date-time 2024 12 4 11 21 31)]
                               :with-time? true}}]
        (let [{:keys [operator column values with-time?]} parts]
          (is (=? (format-date-filter-parts parts)
                  (format-date-filter-parts (lib.fe-util/specific-date-filter-parts query -1 clause))))
          (is (=? (format-date-filter-parts parts)
                  (format-date-filter-parts
                   (lib.fe-util/specific-date-filter-parts
                    query -1 (lib.fe-util/specific-date-filter-clause operator column values with-time?))))))))
    (testing "unsupported clauses"
      (are [clause] (nil? (lib.fe-util/specific-date-filter-parts query -1 clause))
        (lib.filter/is-null column)
        (lib.filter/< "2024-11-28" column)
        (lib.filter/> (meta/field-metadata :venues :price) 10)
        (lib.filter/and (lib.filter/< column "2024-11-28") true)))))

(deftest ^:parallel relative-date-filter-parts-test
  (let [query  (lib.tu/venues-query)
        column (m/filter-vals some? (meta/field-metadata :checkins :date))]
    (testing "clause to parts roundtrip"
      (doseq [[clause parts] {(lib.filter/time-interval column 0 :day)
                              {:column column
                               :value  0
                               :unit   :day}

                              (lib.filter/time-interval column -10 :month)
                              {:column column
                               :value  -10
                               :unit   :month}

                              (lib.filter/time-interval column 10 :year)
                              {:column column
                               :value  10
                               :unit   :year}

                              (lib.fe-util/expression-clause :time-interval [column -10 :month] {:include-current true})
                              {:column  column
                               :value   -10
                               :unit    :month
                               :options {:include-current true}}

                              (lib.filter/relative-time-interval column -10 :month -20 :year)
                              {:column       column
                               :value        -10
                               :unit         :month
                               :offset-value -20
                               :offset-unit  :year}

                              (lib.filter/relative-time-interval column 10 :day 20 :quarter)
                              {:column       column
                               :value        10
                               :unit         :day
                               :offset-value 20
                               :offset-unit  :quarter}}]
        (let [{:keys [column value unit offset-value offset-unit options]} parts]
          (is (=? parts (lib.fe-util/relative-date-filter-parts query -1 clause)))
          (is (=? parts (lib.fe-util/relative-date-filter-parts
                         query -1 (lib.fe-util/relative-date-filter-clause column
                                                                           value
                                                                           unit
                                                                           offset-value
                                                                           offset-unit
                                                                           options)))))))
    (testing "should convert `:current` to `0` for backward compatibility"
      (let [clause (lib.filter/time-interval column :current :day)
            parts  {:column column, :value  0, :unit :day}]
        (is (=? parts (lib.fe-util/relative-date-filter-parts query -1 clause)))))
    (testing "unsupported clauses"
      (are [clause] (nil? (lib.fe-util/relative-date-filter-parts query -1 clause))
        (lib.filter/is-null column)
        (lib.filter/and (lib.filter/time-interval column -10 :month) true)))))

(deftest ^:parallel exclude-date-filter-parts-test
  (let [query  (lib.tu/venues-query)
        column (m/filter-vals some? (meta/field-metadata :checkins :date))]
    (testing "clause to parts roundtrip"
      (doseq [[clause parts] {(lib.filter/is-null column)
                              {:operator :is-null
                               :column   column}

                              (lib.filter/not-null column)
                              {:operator :not-null
                               :column   column}

                              (lib.filter/!= (lib.expression/get-hour column) 0)
                              {:operator :!=
                               :column   column
                               :unit     :hour-of-day
                               :values   [0]}

                              (lib.filter/!= (lib.expression/get-hour column) 0 23)
                              {:operator :!=
                               :column   column
                               :unit     :hour-of-day
                               :values   [0 23]}

                              (lib.filter/not-in (lib.expression/get-hour column) 0 23)
                              {:operator :!=
                               :column   column
                               :unit     :hour-of-day
                               :values   [0 23]}

                              (lib.filter/!= (lib.expression/get-day-of-week column :iso) 1)
                              {:operator :!=
                               :column   column
                               :unit     :day-of-week
                               :values   [1]}

                              (lib.filter/!= (lib.expression/get-day-of-week column :iso) 1 7)
                              {:operator :!=
                               :column   column
                               :unit     :day-of-week
                               :values   [1 7]}

                              (lib.filter/not-in (lib.expression/get-day-of-week column :iso) 1 7)
                              {:operator :!=
                               :column   column
                               :unit     :day-of-week
                               :values   [1 7]}

                              (lib.filter/!= (lib.expression/get-month column) 1 12)
                              {:operator :!=
                               :column   column
                               :unit     :month-of-year
                               :values   [1 12]}

                              (lib.filter/not-in (lib.expression/get-month column) 1 12)
                              {:operator :!=
                               :column   column
                               :unit     :month-of-year
                               :values   [1 12]}

                              (lib.filter/!= (lib.expression/get-quarter column) 1 4)
                              {:operator :!=
                               :column   column
                               :unit     :quarter-of-year
                               :values   [1 4]}

                              (lib.filter/not-in (lib.expression/get-quarter column) 1 4)
                              {:operator :!=
                               :column   column
                               :unit     :quarter-of-year
                               :values   [1 4]}}]
        (let [{:keys [operator column unit values]} parts]
          (is (=? parts (lib.fe-util/exclude-date-filter-parts query -1 clause)))
          (is (=? parts (lib.fe-util/exclude-date-filter-parts
                         query -1 (lib.fe-util/exclude-date-filter-clause operator column unit values)))))))
    (testing "unsupported clauses"
      (are [clause] (nil? (lib.fe-util/exclude-date-filter-parts query -1 clause))
        (lib.filter/between column "2020-01-01" "2021-01-01")
        (lib.filter/!= (lib.expression/get-day-of-week column) 1)
        (lib.filter/!= (lib.expression/get-year column) 2024)
        (lib.filter/and (lib.filter/!= (lib.expression/get-hour column) 0) true)))))

(defn- format-time-filter-parts
  [parts]
  (update parts :values (fn [values] (mapv #(u.time/format-for-base-type % :type/Time) values))))

(deftest ^:parallel time-filter-parts-test
  (let [query  (lib.tu/venues-query)
        column (assoc (m/filter-vals some? (meta/field-metadata :checkins :date))
                      :base-type      :type/Time
                      :effective-type :type/Time)]
    (testing "clause to parts roundtrip"
      (doseq [[clause parts] {(lib.filter/is-null column)
                              {:operator :is-null, :column column}

                              (lib.filter/not-null column)
                              {:operator :not-null, :column column}

                              (lib.filter/> column "10:20")
                              {:operator :>, :column column, :values [(u.time/local-time 10 20)]}

                              (lib.filter/> column "10:20:30")
                              {:operator :>, :column column, :values [(u.time/local-time 10 20 30)]}

                              (lib.filter/> column "10:20:30.123")
                              {:operator :>, :column column, :values [(u.time/local-time 10 20 30 123)]}

                              ;; timezone should be ignored
                              (lib.filter/> column "10:20:30.123Z")
                              {:operator :>, :column column, :values [(u.time/local-time 10 20 30 123)]}

                              (lib.filter/< column "15:40")
                              {:operator :<, :column column, :values [(u.time/local-time 15 40)]}

                              (lib.filter/between column "10:20" "15:40")
                              {:operator :between
                               :column column
                               :values [(u.time/local-time 10 20) (u.time/local-time 15 40)]}}]
        (let [{:keys [operator column values]} parts]
          (is (=? (format-time-filter-parts parts)
                  (format-time-filter-parts (lib.fe-util/time-filter-parts query -1 clause))))
          (is (=? (format-time-filter-parts parts)
                  (format-time-filter-parts (lib.fe-util/time-filter-parts query -1
                                                                           (lib.fe-util/time-filter-clause operator
                                                                                                           column
                                                                                                           values))))))))
    (testing "unsupported clauses"
      (are [clause] (nil? (lib.fe-util/time-filter-parts query -1 clause))
        (lib.filter/= column "10:20")
        (lib.filter/> "10:20" column)
        (lib.filter/is-null (meta/field-metadata :venues :name))
        (lib.filter/and (lib.filter/> column "10:20") true)))))

(deftest ^:parallel default-filter-parts-test
  (let [query  (lib.tu/venues-query)
        column (m/filter-vals some? (meta/field-metadata :venues :price))]
    (testing "clause to parts roundtrip"
      (doseq [[clause parts] {(lib.filter/is-null column)       {:operator :is-null, :column column}
                              (lib.filter/not-null column)      {:operator :not-null, :column column}}]
        (let [{:keys [operator column]} parts]
          (is (=? parts (lib.fe-util/default-filter-parts query -1 clause)))
          (is (=? parts (lib.fe-util/default-filter-parts query -1 (lib.fe-util/default-filter-clause operator
                                                                                                      column)))))))
    (testing "unsupported clauses"
      (are [clause] (nil? (lib.fe-util/default-filter-parts query -1 clause))
        (lib.filter/is-null (meta/field-metadata :venues :name))
        (lib.filter/not-null (meta/field-metadata :venues :name))
        (lib.filter/> column 10)
        (lib.filter/and (lib.filter/is-null column) true)))))

(deftest ^:parallel aggregation-ref-parts-test
  (let [query (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
                  (lib/aggregate (lib/sum (meta/field-metadata :orders :total))))
        sum   (->> (lib/aggregable-columns query nil)
                   (m/find-first (comp #{"sum"} :name)))
        query (lib/aggregate query (lib/with-expression-name (lib/* 2 sum) "2*sum"))]
    (is (=? {:lib/type :mbql/expression-parts,
             :operator :*,
             :options  {:name "2*sum", :display-name "2*sum"},
             :args     [2
                        {:lib/type :metadata/column
                         :base-type :type/Float
                         :name "sum"
                         :display-name "Sum of Total"
                         :effective-type :type/Float
                         :lib/source :source/aggregations
                         :lib/source-uuid string?}]}
            (lib.fe-util/expression-parts query (second (lib/aggregations query)))))))

(deftest ^:parallel join-condition-clause-test
  (let [lhs (lib/ref (meta/field-metadata :orders :product-id))
        rhs (lib/ref (meta/field-metadata :products :id))]
    (is (=? [:= {} lhs rhs]
            (lib.fe-util/join-condition-clause := lhs rhs)))))

(deftest ^:parallel join-condition-parts-test
  (let [lhs (lib/ref (meta/field-metadata :orders :product-id))
        rhs (lib/ref (meta/field-metadata :products :id))]
    (is (= {:operator :=, :lhs-expression lhs, :rhs-expression rhs}
           (lib.fe-util/join-condition-parts (lib/= lhs rhs))))))

(deftest ^:parallel join-condition-lhs-or-rhs-literal?-test
  (let [query             (lib/query meta/metadata-provider (meta/table-metadata :orders))
        products          (meta/table-metadata :products)
        lhs-columns       (lib/join-condition-lhs-columns query products nil nil)
        lhs-order-tax     (m/find-first (comp #{"TAX"} :name) lhs-columns)
        rhs-columns       (lib/join-condition-rhs-columns query products nil nil)
        rhs-product-price (m/find-first (comp #{"PRICE"} :name) rhs-columns)]
    (are [lhs-or-rhs] (true? (lib.fe-util/join-condition-lhs-or-rhs-literal? lhs-or-rhs))
      (lib.expression/value 10)
      (lib.expression/value "abc")
      (lib.expression/value true)
      (lib.expression/value false))
    (are [lhs-or-rhs] (false? (lib.fe-util/join-condition-lhs-or-rhs-literal? lhs-or-rhs))
      (lib/ref lhs-order-tax)
      (lib/ref rhs-product-price)
      (lib/+ lhs-order-tax 1)
      (lib/+ lhs-order-tax lhs-order-tax)
      (lib/+ 1 rhs-product-price)
      (lib/+ rhs-product-price rhs-product-price))))

(deftest ^:parallel join-condition-lhs-or-rhs-column?-test
  (let [query             (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
                              (lib/expression "double-total" (lib/* (meta/field-metadata :orders :total) 2)))
        products          (meta/table-metadata :products)
        lhs-columns       (lib/join-condition-lhs-columns query products nil nil)
        lhs-order-tax     (m/find-first (comp #{"TAX"} :name) lhs-columns)
        rhs-columns       (lib/join-condition-rhs-columns query products nil nil)
        rhs-product-price (m/find-first (comp #{"PRICE"} :name) rhs-columns)
        lhs-custom-column (m/find-first (comp #{"double-total"} :name) lhs-columns)]
    (are [lhs-or-rhs] (true? (lib.fe-util/join-condition-lhs-or-rhs-column? lhs-or-rhs))
      (lib/ref lhs-order-tax)
      (lib/ref rhs-product-price)
      (lib/ref lhs-custom-column))
    (are [lhs-or-rhs] (false? (lib.fe-util/join-condition-lhs-or-rhs-column? lhs-or-rhs))
      (lib.expression/value 1)
      (lib/+ lhs-order-tax 1)
      (lib/+ lhs-order-tax lhs-order-tax)
      (lib/+ 1 rhs-product-price)
      (lib/+ rhs-product-price rhs-product-price))))

(deftest ^:parallel date-parts-display-name-test
  (let [created-at (m/filter-vals some? (meta/field-metadata :products :created-at))
        date-arg-1 "2023-11-02"
        date-arg-2 "2024-01-03"
        datetime-arg "2024-12-05T22:50:27"]
    (are [expected clause] (=? expected (lib/filter-args-display-name (lib.tu/venues-query) -1 clause))
      "4 AM" (lib/= (lib/get-hour created-at) 4)
      "Excludes 12 PM" (lib/!= (lib/get-hour created-at) 12)
      "Mondays" (lib/= (lib.expression/get-day-of-week created-at :iso) 1)
      "Excludes Wednesdays" (lib/!= (lib.expression/get-day-of-week created-at :iso) 3)
      "Jan" (lib/= (lib/get-month created-at) 1)
      "Excludes Mar" (lib/!= (lib/get-month created-at) 3)
      "Nov 2, 2023" (lib/= created-at date-arg-1)
      "Excludes Nov 2, 2023" (lib/!= created-at date-arg-1)
      "Q1" (lib/= (lib/get-quarter created-at) 1)
      "Excludes Q4" (lib/!= (lib/get-quarter created-at) 4)
      "Excludes Q4" (lib/!= (lib/with-temporal-bucket created-at :quarter-of-year) date-arg-1)
      "Excludes Q4" (lib/not-in (lib/get-quarter created-at) 4)
      "Nov 2, 2023 – Jan 3, 2024" (lib/between created-at date-arg-1 date-arg-2)
      "After Nov 2, 2023" (lib/> created-at date-arg-1)
      "Before Nov 2, 2023" (lib/< created-at date-arg-1)
      "Yesterday" (lib/time-interval created-at -1 :day)
      "Tomorrow" (lib/time-interval created-at 1 :day)
      "Previous 10 days" (lib/time-interval created-at -10 :day)
      "Next 10 days" (lib/time-interval created-at 10 :day)
      "Today" (lib/time-interval created-at :current :day)
      "This month" (lib/time-interval created-at :current :month)
      "Previous 64 months, starting 7 months ago" (lib/relative-time-interval created-at -64 :month -7 :month)
      "Dec 5, 2024, 10:50 PM" (lib.filter/during created-at datetime-arg :minute)
      "Dec 5, 2024, 10:00 PM – 10:59 PM" (lib.filter/during created-at datetime-arg :hour)
      "Dec 5, 2024" (lib.filter/during created-at datetime-arg :day)
      "Nov 1–30, 2023" (lib.filter/during created-at date-arg-1 :month)
      "Jan 1 – Dec 31, 2024" (lib.filter/during created-at date-arg-2 :year))))

(deftest ^:parallel dependent-metadata-test
  (testing "native query"
    (is (= [{:type :database, :id (meta/id)}
            {:type :schema,   :id (meta/id)}
            {:type :field,    :id 1}]
           (-> (lib/native-query meta/metadata-provider "select * {{foo}}")
               (lib/with-template-tags {"foo" {:type :dimension
                                               :id "1"
                                               :name "foo"
                                               :widget-type :text
                                               :display-name "foo"
                                               :dimension [:field {:lib/uuid (str (random-uuid))} 1]}})
               (lib/dependent-metadata nil :question))))))

(deftest ^:parallel dependent-metadata-test-2
  (testing "simple query"
    (are [query] (=? [{:type :database, :id (meta/id)}
                      {:type :schema,   :id (meta/id)}
                      {:type :table,    :id (meta/id :venues)}
                      {:type :table,    :id (meta/id :categories)}]
                     (lib/dependent-metadata query nil :question))
      (lib.tu/venues-query)
      (lib/append-stage (lib.tu/venues-query)))))

(deftest ^:parallel dependent-metadata-test-3
  (testing "join query"
    (are [query] (=? [{:type :database, :id (meta/id)}
                      {:type :schema,   :id (meta/id)}
                      {:type :table,    :id (meta/id :venues)}
                      {:type :table,    :id (meta/id :categories)}]
                     (lib/dependent-metadata query nil :question))
      (lib.tu/query-with-join)
      (lib/append-stage (lib.tu/query-with-join)))))

(deftest ^:parallel dependent-metadata-test-4
  (testing "source card based query"
    (are [query] (=? [{:type :database, :id (meta/id)}
                      {:type :schema,   :id (meta/id)}
                      {:type :table,    :id "card__1"}
                      {:type :table,    :id (meta/id :users)}]
                     (lib/dependent-metadata query nil :question))
      (lib.tu/query-with-source-card)
      (lib/append-stage (lib.tu/query-with-source-card)))))

(deftest ^:parallel dependent-metadata-test-5
  (testing "source card based query with result metadata"
    (are [query] (=? [{:type :database, :id (meta/id)}
                      {:type :schema,   :id (meta/id)}
                      {:type :table,    :id "card__1"}
                      {:type :table,    :id (meta/id :users)}]
                     (lib/dependent-metadata query nil :question))
      (lib.tu/query-with-source-card-with-result-metadata)
      (lib/append-stage (lib.tu/query-with-source-card-with-result-metadata)))))

(deftest ^:parallel dependent-metadata-test-6
  (testing "model based query"
    (let [query (assoc (lib.tu/query-with-source-card) :lib/metadata lib.tu/metadata-provider-with-model)]
      (are [query] (=? [{:type :database, :id (meta/id)}
                        {:type :schema,   :id (meta/id)}
                        {:type :table,    :id "card__1"}
                        {:type :table,    :id (meta/id :users)}]
                       (lib/dependent-metadata query nil :question))
        query
        (lib/append-stage query)))))

(deftest ^:parallel dependent-metadata-test-7
  (testing "metric based query"
    (let [query (assoc (lib.tu/query-with-source-card) :lib/metadata lib.tu/metadata-provider-with-metric)]
      (are [query] (=? [{:type :database, :id (meta/id)}
                        {:type :schema,   :id (meta/id)}
                        {:type :table,    :id "card__1"}
                        {:type :table,    :id (meta/id :users)}
                        {:type :table,    :id (meta/id :checkins)}
                        {:type :table,    :id (meta/id :venues)}]
                       (lib/dependent-metadata query nil :question))
        query
        (lib/append-stage query)))))

(deftest ^:parallel dependent-metadata-test-8
  (testing "editing a model"
    (let [metadata-provider lib.tu/metadata-provider-with-model
          query (->> (lib.metadata/card metadata-provider 1)
                     :dataset-query
                     (lib/query metadata-provider))]
      (are [query] (=? [{:type :database, :id (meta/id)}
                        {:type :schema,   :id (meta/id)}
                        {:type :table,    :id (meta/id :checkins)}
                        {:type :table,    :id (meta/id :users)}
                        {:type :table,    :id (meta/id :venues)}
                        {:type :table,    :id "card__1"}]
                       (lib/dependent-metadata query 1 :model))
        query
        (lib/append-stage query)))))

(deftest ^:parallel dependent-metadata-test-9
  (testing "editing a metric"
    (let [metadata-provider lib.tu/metadata-provider-with-metric
          query (->> (lib.metadata/card metadata-provider 1)
                     :dataset-query
                     (lib/query metadata-provider))]
      (are [query] (=? [{:type :database, :id (meta/id)}
                        {:type :schema,   :id (meta/id)}
                        {:type :table,    :id (meta/id :checkins)}
                        {:type :table,    :id (meta/id :users)}
                        {:type :table,    :id (meta/id :venues)}
                        {:type :table,    :id "card__1"}]
                       (lib/dependent-metadata query 1 :metric))
        query
        (lib/append-stage query)))))

(deftest ^:parallel dependent-metadata-test-10
  (testing "Native query snippets should be included in dependent metadata"
    (let [;; lib/native-query would try to look up the snippets:
          query {:lib/type :mbql/query
                 :database 1
                 :stages [{:lib/type :mbql.stage/native
                           :native "SELECT * WHERE {{snippet: filter1}} AND {{snippet: filter2}}"
                           :template-tags {"snippet: filter1" {:type :snippet
                                                               :snippet-id 10
                                                               :snippet-name "filter1"
                                                               :name "snippet: filter1"
                                                               :display-name "Filter 1"
                                                               :id "def456"}
                                           "snippet: filter2" {:type :snippet
                                                               :snippet-id 20
                                                               :snippet-name "filter2"
                                                               :name "snippet: filter2"
                                                               :display-name "Filter 2"
                                                               :id "ghi789"}}}]}]
      (is (=? [{:type :database}
               {:type :schema}
               {:type :native-query-snippet :id 10}
               {:type :native-query-snippet :id 20}]
              (lib/dependent-metadata query nil :question))))))

(deftest ^:parallel recursive-snippet-dependencies-test
  (testing "Recursive snippet dependencies should be resolved"
    (let [metadata-provider (lib.tu/mock-metadata-provider
                             {:native-query-snippets
                              [{:lib/type :metadata/native-query-snippet
                                :id 10
                                :name "filter1"
                                :template-tags {"snippet: nested1" {:type :snippet
                                                                    :snippet-id 30
                                                                    :snippet-name "nested1"
                                                                    :name "snippet: nested1"
                                                                    :display-name "Nested 1"
                                                                    :id "test-id-30"}
                                                "snippet: nested2" {:type :snippet
                                                                    :snippet-id 40
                                                                    :snippet-name "nested2"
                                                                    :name "snippet: nested2"
                                                                    :display-name "Nested 2"
                                                                    :id "test-id-40"}}}
                               {:lib/type :metadata/native-query-snippet
                                :id 30
                                :name "nested1"
                                :template-tags {"snippet: deeply-nested" {:type :snippet
                                                                          :snippet-id 50
                                                                          :snippet-name "deeply-nested"
                                                                          :name "snippet: deeply-nested"
                                                                          :display-name "Deeply Nested"
                                                                          :id "test-id-50"}}}
                               {:lib/type :metadata/native-query-snippet
                                :id 40
                                :name "nested2"
                                :template-tags {}}
                               {:lib/type :metadata/native-query-snippet
                                :id 50
                                :name "deeply-nested"
                                :template-tags {}}]})
          query (lib/query metadata-provider
                           {:lib/type :mbql/query
                            :database 1
                            :stages [{:lib/type :mbql.stage/native
                                      :native "SELECT * WHERE {{snippet: filter1}}"
                                      :template-tags {"snippet: filter1" {:type :snippet
                                                                          :snippet-id 10
                                                                          :snippet-name "filter1"
                                                                          :name "snippet: filter1"
                                                                          :display-name "Filter 1"
                                                                          :id "test-id-1"}}}]})]
      (is (=? [{:type :database}
               {:type :schema}
               {:type :native-query-snippet :id 10}
               {:type :native-query-snippet :id 30}
               {:type :native-query-snippet :id 50}
               {:type :native-query-snippet :id 40}]
              (lib/dependent-metadata query nil :question))))))

(deftest ^:parallel table-or-card-dependent-metadata-test
  (testing "start from table"
    (is (= [{:type :table, :id (meta/id :checkins)}]
           (lib/table-or-card-dependent-metadata meta/metadata-provider (meta/id :checkins)))))
  (testing "start from card"
    (is (= [{:type :table, :id "card__1"}]
           (lib/table-or-card-dependent-metadata lib.tu/metadata-provider-with-card "card__1")))))

(deftest ^:parallel expand-temporal-expression-test
  (let [update-temporal-unit (fn [expr temporal-type] (update-in expr [2 1] assoc :temporal-unit temporal-type))
        expr [:=
              {:lib/uuid "4fcaefe5-5c20-4cbc-98ed-6007b67843a4"}
              [:field {:lib/uuid "3fcaefe5-5c20-4cbc-98ed-6007b67843a3"} 111]
              "2024-05-13T16:35"]]
    (testing "Expandable temporal units"
      (are [unit start end] (=? [:between map? [:field {:temporal-unit unit} int?] start end]
                                (#'lib.fe-util/expand-temporal-expression (update-temporal-unit expr unit)))
        :hour "2024-05-13T16:00:00" "2024-05-13T16:59:59"
        :week "2024-05-12" "2024-05-18"
        :month "2024-05-01" "2024-05-31"
        :quarter "2024-04-01" "2024-06-30"
        :year  "2024-01-01" "2024-12-31")
      (testing "Non-expandable temporal units"
        (are [unit] (let [expr (update-temporal-unit expr unit)]
                      (= false
                         (#'lib.fe-util/expandable-temporal-expression? expr)))
          :minute :day)))))
