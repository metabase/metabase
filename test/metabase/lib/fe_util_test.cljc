(ns metabase.lib.fe-util-test
  (:require
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))
   [clojure.test :refer [are deftest is testing]]
   [medley.core :as m]
   [metabase.lib.core :as lib]
   [metabase.lib.fe-util :as lib.fe-util]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]
   [metabase.lib.types.isa :as lib.types.isa]))

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

(deftest ^:parallel date-parts-display-name-test
  (let [created-at (meta/field-metadata :products :created-at)
        date-arg-1 "2023-11-02"
        date-arg-2 "2024-01-03"]
    (are [expected clause] (=? expected (lib/filter-args-display-name lib.tu/venues-query -1 clause))
      "Nov 2, 2023" (lib/= created-at date-arg-1)
      "Excludes Nov 2, 2023" (lib/!= created-at date-arg-1)
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
