(ns metabase.transform.transform-test
  "Test for transforms"
  (:require
   [clojure.set :as set]
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.test :as mt]
   [metabase.util :as u]))

(deftest create-view-test
  (mt/test-drivers
    (-> (mt/normal-drivers-with-feature :view)
        ;; WIP: for now we're focusing just on those two, full support later
        (set/intersection #{:postgres :h2}))
    (testing "Can create a new view"
      (mt/dataset (mt/dataset-definition "users-db"
                                         ["users"
                                          [{:field-name "name" :base-type :type/Text}
                                           {:field-name "age" :base-type :type/Integer}]
                                          [["Foo" 10]
                                           ["Bar" 20]
                                           ["Baz" 30]]])
        (is (driver/create-view! driver/*driver* (u/the-id (mt/db))
                                 "young_users"
                                 "SELECT * FROM users where age < 25"))))))
