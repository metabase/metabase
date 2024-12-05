(ns metabase.lib.fe-util-test
  (:require
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))
   [clojure.test :refer [are deftest is testing]]
   [medley.core :as m]
   [metabase.lib.core :as lib]
   [metabase.lib.expression :as lib.expression]
   [metabase.lib.fe-util :as lib.fe-util]
   [metabase.lib.filter :as lib.filter]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.query :as lib.query]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]
   [metabase.lib.types.isa :as lib.types.isa]
   [metabase.util.time :as u.time]))

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
            op (lib/filterable-column-operators col)
            :let [short-op (:short op)
                  expression-clause (case short-op
                                      :between (lib/expression-clause short-op [col col col] {})
                                      (:contains :does-not-contain :starts-with :ends-with) (lib/expression-clause short-op [col "123"] {})
                                      (:is-null :not-null :is-empty :not-empty) (lib/expression-clause short-op [col] {})
                                      :inside (lib/expression-clause short-op [col 12 34 56 78 90] {})
                                      (:< :>) (lib/expression-clause short-op [col col] {})
                                      (lib/expression-clause short-op [col 123] {}))]]
      (testing (str short-op " with " (lib.types.isa/field-type col))
        (is (=? {:lib/type :mbql/expression-parts
                 :operator short-op
                 :args vector?}
                (lib/expression-parts query expression-clause)))))))

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
        cols (m/index-by :id (lib/filterable-columns query))
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
                 :operators (comp vector? not-empty)
                 :active true
                 :id (:id checkins-user-id-col)
                 :display-name "User ID: Auto binned"
                 :metabase.lib.join/join-alias "Checkins"}
                (assoc (meta/field-metadata :users :id) :display-name "ID: Auto binned")]}
              (lib/expression-parts query (lib/= (lib/with-binning checkins-user-id-col {:strategy :default})
                                                 (lib/with-binning user-id-col {:strategy :default}))))))
    (testing "bucketing"
      (is (=? {:lib/type :mbql/expression-parts
               :operator :=
               :args
               [{:lib/type :metadata/column
                 :lib/source-uuid string?
                 :effective-type :type/Date
                 :operators (comp vector? not-empty)
                 :id (:id checkins-date-col)
                 :metabase.lib.field/temporal-unit :day
                 :display-name "Date: Day"
                 :metabase.lib.join/join-alias "Checkins"}
                (assoc (meta/field-metadata :users :last-login) :display-name "Last Login: Day")]}
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

(deftest ^:parallel expression-clause-test
  (is (=? [:= {:lib/uuid string?} [:field {:lib/uuid string?} (meta/id :products :id)] 1]
          (lib/expression-clause := [(meta/field-metadata :products :id) 1] {})))
  (is (=? [:= {:lib/uuid string?} [:field {:lib/uuid string?} (meta/id :products :id)] 1]
          (lib/expression-clause := [(meta/field-metadata :products :id) 1] {})))
  (is (=? [:= {:lib/uuid string?} [:+ {} [:field {:lib/uuid string?} (meta/id :products :id)] 2] 1]
          (lib/expression-clause := [(lib/expression-clause :+ [(meta/field-metadata :products :id) 2] {}) 1] {}))))

(deftest ^:parallel invisible-expression-parts-test
  (is (=? {:lib/type :mbql/expression-parts
           :operator :=
           :args [{:lib/type :metadata/column
                   :name "ID"
                   :display-name "ID"}
                  1]}
          (lib/expression-parts lib.tu/venues-query -1 (lib/= (lib/ref (meta/field-metadata :products :id))
                                                              1)))))

(deftest ^:parallel string-filter-parts-test
  (let [query  lib.tu/venues-query
        column (meta/field-metadata :venues :name)]
    (testing "clause to parts roundtrip"
      (doseq [[clause parts] {(lib.filter/is-empty column)
                              {:operator :is-empty, :column column}

                              (lib.filter/not-empty column)
                              {:operator :not-empty, :column column}

                              (lib.filter/= column "A")
                              {:operator :=, :column column, :values ["A"]}

                              (lib.filter/= column "A" "B")
                              {:operator :=, :column column, :values ["A" "B"]}

                              (lib.filter/!= column "A")
                              {:operator :!=, :column column, :values ["A"]}

                              (lib.filter/!= column "A" "B")
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
        (lib.expression/concat column "A")))))

(deftest ^:parallel number-filter-parts-test
  (let [query  lib.tu/venues-query
        column (meta/field-metadata :venues :price)]
    (testing "clause to parts roundtrip"
      (doseq [[clause parts] {(lib.filter/is-null column)       {:operator :is-null, :column column}
                              (lib.filter/not-null column)      {:operator :not-null, :column column}
                              (lib.filter/= column 10)          {:operator :=, :column column, :values [10]}
                              (lib.filter/= column 10 20)       {:operator :=, :column column, :values [10 20]}
                              (lib.filter/!= column 10)         {:operator :!=, :column column, :values [10]}
                              (lib.filter/!= column 10 20)      {:operator :!=, :column column, :values [10 20]}
                              (lib.filter/> column 10)          {:operator :>, :column column, :values [10]}
                              (lib.filter/>= column 10)         {:operator :>=, :column column, :values [10]}
                              (lib.filter/< column 10)          {:operator :<, :column column, :values [10]}
                              (lib.filter/<= column 10)         {:operator :<=, :column column, :values [10]}
                              (lib.filter/between column 10 20) {:operator :between, :column column, :values [10 20]}}]
        (let [{:keys [operator column values]} parts]
          (is (=? parts (lib.fe-util/number-filter-parts query -1 clause)))
          (is (=? parts (lib.fe-util/number-filter-parts query -1 (lib.fe-util/number-filter-clause operator
                                                                                                    column
                                                                                                    values)))))))
    (testing "unsupported clauses"
      (are [clause] (nil? (lib.fe-util/number-filter-parts query -1 clause))
        (lib.filter/= 10 column)
        (lib.filter/is-null (meta/field-metadata :venues :name))
        (lib.expression/+ column 10)))))

(deftest ^:parallel coordinate-filter-parts-test
  (let [query      (lib.query/query meta/metadata-provider (meta/table-metadata :orders))
        lat-column (meta/field-metadata :people :latitude)
        lon-column (meta/field-metadata :people :longitude)]
    (testing "clause to parts roundtrip"
      (doseq [[clause parts] {(lib.filter/= lat-column 10)
                              {:operator :=, :column lat-column, :values [10]}

                              (lib.filter/!= lon-column 20)
                              {:operator :!=, :column lon-column, :values [20]}

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
                               :values           [10 20 30 40]}}]
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
        (lib.expression/+ lat-column 10)))))

(deftest ^:parallel boolean-filter-parts-test
  (let [query  (-> lib.tu/venues-query
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
        (lib.filter/is-null (meta/field-metadata :venues :name))))))

(deftest ^:parallel relative-date-filter-parts-test
  (let [query  lib.tu/venues-query
        column (meta/field-metadata :checkins :date)]
    (testing "clause to parts roundtrip"
      (doseq [[clause parts] {(lib.filter/time-interval column :current :day)
                              {:column column
                               :value  :current
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
    (testing "unsupported clauses"
      (are [clause] (nil? (lib.fe-util/relative-date-filter-parts query -1 clause))
        (lib.filter/is-null column)))))

(deftest ^:parallel exclude-date-filter-parts-test
  (let [query  lib.tu/venues-query
        column (meta/field-metadata :checkins :date)]
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

                              (lib.filter/!= (lib.expression/get-month column) 1 12)
                              {:operator :!=
                               :column   column
                               :unit     :month-of-year
                               :values   [1 12]}

                              (lib.filter/!= (lib.expression/get-quarter column) 1 4)
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
        (lib.filter/!= (lib.expression/get-year column) 2024)))))

(defn- format-time-filter-parts
  [parts]
  (update parts :values (fn [values] (mapv #(u.time/format-for-base-type % :type/Time) values))))

(deftest ^:parallel time-filter-parts-test
  (let [query  lib.tu/venues-query
        column (assoc (meta/field-metadata :checkins :date)
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
        (lib.filter/is-null (meta/field-metadata :venues :name))))))

(deftest ^:parallel date-parts-display-name-test
  (let [created-at (meta/field-metadata :products :created-at)
        date-arg-1 "2023-11-02"
        date-arg-2 "2024-01-03"]
    (are [expected clause] (=? expected (lib/filter-args-display-name lib.tu/venues-query -1 clause))
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
      "Nov 2, 2023 – Jan 3, 2024" (lib/between created-at date-arg-1 date-arg-2)
      "After Nov 2, 2023" (lib/> created-at date-arg-1)
      "Before Nov 2, 2023" (lib/< created-at date-arg-1)
      "Yesterday" (lib/time-interval created-at -1 :day)
      "Tomorrow" (lib/time-interval created-at 1 :day)
      "Previous 10 Days" (lib/time-interval created-at -10 :day)
      "Next 10 Days" (lib/time-interval created-at 10 :day)
      "Today" (lib/time-interval created-at :current :day)
      "This Month" (lib/time-interval created-at :current :month))))

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
               (lib/dependent-metadata nil :question)))))
  (testing "simple query"
    (are [query] (=? [{:type :database, :id (meta/id)}
                      {:type :schema,   :id (meta/id)}
                      {:type :table,    :id (meta/id :venues)}
                      {:type :table,    :id (meta/id :categories)}]
                     (lib/dependent-metadata query nil :question))
      lib.tu/venues-query
      (lib/append-stage lib.tu/venues-query)))
  (testing "join query"
    (are [query] (=? [{:type :database, :id (meta/id)}
                      {:type :schema,   :id (meta/id)}
                      {:type :table,    :id (meta/id :venues)}
                      {:type :table,    :id (meta/id :categories)}]
                     (lib/dependent-metadata query nil :question))
      lib.tu/query-with-join
      (lib/append-stage lib.tu/query-with-join)))
  (testing "source card based query"
    (are [query] (=? [{:type :database, :id (meta/id)}
                      {:type :schema,   :id (meta/id)}
                      {:type :table,    :id "card__1"}
                      {:type :table,    :id (meta/id :users)}]
                     (lib/dependent-metadata query nil :question))
      lib.tu/query-with-source-card
      (lib/append-stage lib.tu/query-with-source-card)))
  (testing "source card based query with result metadata"
    (are [query] (=? [{:type :database, :id (meta/id)}
                      {:type :schema,   :id (meta/id)}
                      {:type :table,    :id "card__1"}
                      {:type :table,    :id (meta/id :users)}]
                     (lib/dependent-metadata query nil :question))
      lib.tu/query-with-source-card-with-result-metadata
      (lib/append-stage lib.tu/query-with-source-card-with-result-metadata)))
  (testing "model based query"
    (let [query (assoc lib.tu/query-with-source-card :lib/metadata lib.tu/metadata-provider-with-model)]
      (are [query] (=? [{:type :database, :id (meta/id)}
                        {:type :schema,   :id (meta/id)}
                        {:type :table,    :id "card__1"}
                        {:type :table,    :id (meta/id :users)}]
                       (lib/dependent-metadata query nil :question))
        query
        (lib/append-stage query))))
  (testing "metric based query"
    (let [query (assoc lib.tu/query-with-source-card :lib/metadata lib.tu/metadata-provider-with-metric)]
      (are [query] (=? [{:type :database, :id (meta/id)}
                        {:type :schema,   :id (meta/id)}
                        {:type :table,    :id "card__1"}
                        {:type :table,    :id (meta/id :users)}
                        {:type :table,    :id (meta/id :checkins)}
                        {:type :table,    :id (meta/id :venues)}]
                       (lib/dependent-metadata query nil :question))
        query
        (lib/append-stage query))))
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
        (lib/append-stage query))))
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

(deftest ^:parallel table-or-card-dependent-metadata-test
  (testing "start from table"
    (is (= [{:type :table, :id (meta/id :checkins)}]
           (lib/table-or-card-dependent-metadata meta/metadata-provider (meta/id :checkins)))))
  (testing "start from card"
    (is (= [{:type :table, :id "card__1"}]
           (lib/table-or-card-dependent-metadata lib.tu/metadata-provider-with-card "card__1")))))

(deftest ^:parallel maybe-expand-temporal-expression-test
  (let [update-temporal-unit (fn [expr temporal-type] (update-in expr [2 1] assoc :temporal-unit temporal-type))
        expr [:=
              {:lib/uuid "4fcaefe5-5c20-4cbc-98ed-6007b67843a4"}
              [:field {:lib/uuid "3fcaefe5-5c20-4cbc-98ed-6007b67843a3"} 111]
              "2024-05-13T16:35"]]
    (testing "Expandable temporal units"
      (are [unit start end] (=? [:between map? [:field {:temporal-unit unit} int?] start end]
                                (#'lib.fe-util/maybe-expand-temporal-expression (update-temporal-unit expr unit)))
        :hour "2024-05-13T16:00:00" "2024-05-13T16:59:59"
        :week "2024-05-12" "2024-05-18"
        :month "2024-05-01" "2024-05-31"
        :quarter "2024-04-01" "2024-06-30"
        :year  "2024-01-01" "2024-12-31")
      (testing "Non-expandable temporal units"
        (are [unit] (let [expr (update-temporal-unit expr unit)]
                      (= expr
                         (#'lib.fe-util/maybe-expand-temporal-expression expr)))
          :minute :day)))))
