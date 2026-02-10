(ns ^:mb/driver-tests metabase.parameters.field-test
  (:require
   [clojure.test :refer :all]
   [metabase.parameters.field :as parameters.field]
   [metabase.query-processor.timeseries-test.util :as tqpt]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(deftest ^:parallel search-values-test
  (testing "make sure `search-values` works on with our various drivers"
    (mt/test-drivers (mt/normal-drivers)
      (is (= [[1 "Red Medicine"]
              [10 "Fred 62"]]
             (mt/format-rows-by
              [int str]
              (parameters.field/search-values (t2/select-one :model/Field :id (mt/id :venues :id))
                                              (t2/select-one :model/Field :id (mt/id :venues :name))
                                              "Red"
                                              nil)))))))

(deftest ^:parallel search-values-test-2
  (testing "make sure `search-values` works on with our various drivers"
    (tqpt/test-timeseries-drivers
      (is (= (sort-by first [["139" "Red Medicine"]
                             ["148" "Fred 62"]
                             ["308" "Fred 62"]
                             ["375" "Red Medicine"]
                             ["396" "Fred 62"]
                             ["589" "Fred 62"]
                             ["648" "Fred 62"]
                             ["72" "Red Medicine"]
                             ["977" "Fred 62"]])
             (->> (parameters.field/search-values (t2/select-one :model/Field :id (mt/id :checkins :id))
                                                  (t2/select-one :model/Field :id (mt/id :checkins :venue_name))
                                                  "Red"
                                                  nil)
                  ;; Druid JDBC returns id as int and non-JDBC as str. Also ordering is different. Following lines
                  ;; mitigate that.
                  (mapv #(update % 0 str))
                  (sort-by first)))))))

(deftest ^:parallel search-values-test-3
  (testing "make sure limit works"
    (mt/test-drivers (mt/normal-drivers)
      (is (= [[1 "Red Medicine"]]
             (mt/format-rows-by
              [int str]
              (parameters.field/search-values (t2/select-one :model/Field :id (mt/id :venues :id))
                                              (t2/select-one :model/Field :id (mt/id :venues :name))
                                              "Red"
                                              1)))))))

(deftest ^:parallel search-values-with-field-same-as-search-field-test
  (testing "make sure it also works if you use the same Field twice"
    (mt/test-drivers (mt/normal-drivers)
      (is (= [["Fred 62"] ["Red Medicine"]]
             (parameters.field/search-values (t2/select-one :model/Field :id (mt/id :venues :name))
                                             (t2/select-one :model/Field :id (mt/id :venues :name))
                                             "Red"
                                             nil))))))

(deftest ^:parallel search-values-with-field-same-as-search-field-test-2
  (testing "make sure it also works if you use the same Field twice"
    (tqpt/test-timeseries-drivers
      (is (= [["Fred 62"] ["Red Medicine"]]
             (parameters.field/search-values (t2/select-one :model/Field :id (mt/id :checkins :venue_name))
                                             (t2/select-one :model/Field :id (mt/id :checkins :venue_name))
                                             "Red"
                                             nil))))))

(deftest search-values-with-field-and-search-field-is-fk-test
  (testing "searching on a PK field should work (#32985)"
    ;; normally PKs are ids so it's not possible to do search, because search are for text fields only
    ;; but with a special setup you can have a PK that is text. In this case we should be able to search for it
    (mt/with-discard-model-updates! [:model/Field]
      ;; Ngoc: users.name is a FK to categories.name ?
      ;; I know this is weird but this test doesn't need to make sense
      ;; A real use case is : you have a user.email as text => set email as PK
      ;; Another field review.email => you set it up so that it's a FK to user.email
      ;; And the desired behavior is you can search for review.email, where the query
      ;; should query for email from user.email
      (t2/update! :model/Field (mt/id :categories :name) {:semantic_type :type/PK})
      (t2/update! :model/Field (mt/id :users :name) {:semantic_type      :type/FK
                                                     :has_field_values   "search"
                                                     :fk_target_field_id (mt/id :categories :name)})

      (is (= [["African"]]
             (parameters.field/search-values (t2/select-one :model/Field (mt/id :users :name))
                                             (t2/select-one :model/Field (mt/id :users :name))
                                             "African"
                                             nil))))))
