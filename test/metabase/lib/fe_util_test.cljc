(ns metabase.lib.fe-util-test(:require
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))
   [clojure.test :refer [deftest is testing]]
   [medley.core :as m]
   [metabase.lib.core :as lib]
   [metabase.lib.test-metadata :as meta]
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
            :let [filter-clause (case (:short op)
                                  :between (lib/filter-clause op {} [col 123 456])
                                  (:contains :does-not-contain :starts-with :ends-with) (lib/filter-clause op {} [col "123"])
                                  (:is-null :not-null :is-empty :not-empty) (lib/filter-clause op {} [col])
                                  :inside (lib/filter-clause op {} [col 12 34 56 78 90])
                                  (lib/filter-clause op {} [col 123]))]]
      (testing (str (:short op) " with " (lib.types.isa/field-type col))
        (is (=? {:lib/type :mbql/expression-parts
                 :operator (:short op)
                 :args vector?}
                (lib/expression-parts query filter-clause)))))))

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
                 :lib/source :source/joins
                 :lib/source-uuid string?
                 :effective-type :type/Integer
                 :metabase.lib.field/binning {:strategy :default}
                 :operators (comp vector? not-empty)
                 :active true
                 :id (:id checkins-user-id-col)
                 :source-alias "Checkins"
                 :lib/desired-column-alias "Checkins__USER_ID"
                 :display-name "User ID: Auto binned"
                 :metabase.lib.join/join-alias "Checkins"}
                (assoc user-id-col :display-name "ID: Auto binned")]}
              (lib/expression-parts query (lib/= (lib/with-binning checkins-user-id-col {:strategy :default})
                                                 (lib/with-binning user-id-col {:strategy :default}))))))
    (testing "bucketing"
      (is (=? {:lib/type :mbql/expression-parts
               :operator :=
               :args
               [{:lib/type :metadata/column
                 :lib/source :source/joins
                 :lib/source-uuid string?
                 :effective-type :type/Date
                 :operators (comp vector? not-empty)
                 :id (:id checkins-date-col)
                 :source-alias "Checkins"
                 :lib/desired-column-alias "Checkins__DATE"
                 :metabase.lib.field/temporal-unit :day
                 :display-name "Date: Day"
                 :metabase.lib.join/join-alias "Checkins"}
                (assoc user-last-login-col :display-name "Last Login: Day")]}
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
          (lib/expression-clause := {} [(meta/field-metadata :products :id) 1])))
  (is (=? [:= {:lib/uuid string?} [:field {:lib/uuid string?} (meta/id :products :id)] 1]
          (lib/expression-clause "=" {} [(meta/field-metadata :products :id) 1])))
  (is (=? [:= {:lib/uuid string?} [:+ {} [:field {:lib/uuid string?} (meta/id :products :id)] 2] 1]
          (lib/expression-clause "=" {} [(lib/expression-clause "+" {} [(meta/field-metadata :products :id) 2]) 1]))))
