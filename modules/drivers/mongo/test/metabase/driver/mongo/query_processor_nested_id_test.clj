(ns metabase.driver.mongo.query-processor-nested-id-test
  "Unit tests for MongoDB nested _id field handling"
  (:require

   [clojure.test :refer :all]
   [flatland.ordered.map :as ordered-map]
   [metabase.driver-api.core :as driver-api]
   [metabase.driver.mongo.operators :refer [$group $project $sort $sum]]
   [metabase.driver.mongo.query-processor :as mongo.qp]))

(deftest field-alias-nested-id-test
  (testing "field-alias behavior"
    (testing "Uses desired-alias when present"
      (is (= "my-custom-alias"
             (#'mongo.qp/field-alias [:field 123 {driver-api/qp.add.desired-alias "my-custom-alias"}]))))

    (testing "Constructs path for nested _id fields without desired-alias"
      ;; For this test, we'll verify the behavior by providing a string field name
      ;; which takes a simpler code path in ->lvalue :field
      (is (string? (#'mongo.qp/field-alias [:field "_id.widgetType" {}])))
      (is (= "_id.widgetType" (#'mongo.qp/field-alias [:field "_id.widgetType" {}]))))))

; Removed mongodb-path-collision-issue-test - redundant with integration tests

; Removed field-name-handling-test - was just asserting "widgetType" = "widgetType"

; Removed projection-group-map-handling-test - redundant with integration tests

; Removed breakouts-and-ags->projected-fields-handling-test - redundant with integration tests

; Removed path-collision-reproduction-test - was documentation not a test

(deftest build-optimized-projections-test
  (testing "build-optimized-projections creates nested structure for _id fields"
    (testing "Single _id field"
      (is (= (ordered-map/ordered-map "_id" {"widgetType" "$_id.widgetType"}
                                      "sum" true)
             (#'mongo.qp/build-optimized-projections
              [["_id.widgetType" "$_id.widgetType"]
               ["sum" true]]))))

    (testing "Multiple _id fields"
      (is (= (ordered-map/ordered-map "_id" {"widgetType" "$_id.widgetType"
                                             "userId"     "$_id.userId"}
                                      "sum" true)
             (#'mongo.qp/build-optimized-projections
              [["_id.widgetType" "$_id.widgetType"]
               ["_id.userId" "$_id.userId"]
               ["sum" true]]))))

    (testing "Deep nesting"
      (is (= (ordered-map/ordered-map "_id" {"user" {"name" "$_id.user.name"
                                                     "id"   "$_id.user.id"}}
                                      "count" true)
             (#'mongo.qp/build-optimized-projections
              [["_id.user.name" "$_id.user.name"]
               ["_id.user.id" "$_id.user.id"]
               ["count" true]]))))

    (testing "No _id fields - suppresses _id"
      (is (= (ordered-map/ordered-map "_id" false
                                      "category" "$category"
                                      "sum" true)
             (#'mongo.qp/build-optimized-projections
              [["category" "$category"]
               ["sum" true]]))))

    (testing "Mixed _id and regular fields"
      (is (= (ordered-map/ordered-map "_id" {"widgetType" "$_id.widgetType"}
                                      "category" "$category"
                                      "sum" true)
             (#'mongo.qp/build-optimized-projections
              [["_id.widgetType" "$_id.widgetType"]
               ["category" "$category"]
               ["sum" true]]))))))

; Removed column-ordering-field-mappings-test - was reimplementing the logic it claimed to test

(deftest deep-nesting-levels-test
  (testing "build-optimized-projections handles arbitrarily deep nesting"
    (testing "3-level deep nesting"
      (is (= (ordered-map/ordered-map "_id" {"user" {"profile" {"theme" "$_id.user.profile.theme"}}}
                                      "count" true)
             (#'mongo.qp/build-optimized-projections
              [["_id.user.profile.theme" "$_id.user.profile.theme"]
               ["count" true]]))))

    (testing "4-level deep nesting"
      (is (= (ordered-map/ordered-map "_id" {"org" {"dept" {"team" {"lead" "$_id.org.dept.team.lead"}}}}
                                      "sum" true)
             (#'mongo.qp/build-optimized-projections
              [["_id.org.dept.team.lead" "$_id.org.dept.team.lead"]
               ["sum" true]]))))

    (testing "Multiple fields at various nesting depths"
      (is (= (ordered-map/ordered-map "_id" {"user" {"name"    "$_id.user.name"
                                                     "profile" {"settings" {"theme" "$_id.user.profile.settings.theme"
                                                                            "lang"  "$_id.user.profile.settings.lang"}}}
                                             "org"  {"name" "$_id.org.name"}}
                                      "count" true)
             (#'mongo.qp/build-optimized-projections
              [["_id.user.name" "$_id.user.name"]
               ["_id.user.profile.settings.theme" "$_id.user.profile.settings.theme"]
               ["_id.user.profile.settings.lang" "$_id.user.profile.settings.lang"]
               ["_id.org.name" "$_id.org.name"]
               ["count" true]]))))

    (testing "Mix of different depth levels maintains structure"
      ;; This tests that we correctly build the nested structure even when fields
      ;; are provided in a non-hierarchical order
      (is (= (ordered-map/ordered-map "_id" {"a" "$_id.a"
                                             "b" {"c" "$_id.b.c"
                                                  "d" {"e" {"f" "$_id.b.d.e.f"}}}}
                                      "metric" true)
             (#'mongo.qp/build-optimized-projections
              [["_id.b.d.e.f" "$_id.b.d.e.f"] ; deepest first
               ["_id.a" "$_id.a"] ; shallow
               ["_id.b.c" "$_id.b.c"] ; medium depth
               ["metric" true]]))))))
