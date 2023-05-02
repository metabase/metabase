(ns metabase.lib.metadata-test
  (:require
   [clojure.test :refer [are deftest is testing]]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))))

#?(:cljs (comment metabase.test-runner.assert-exprs.approximately-equal/keep-me))

(deftest ^:parallel field-metadata-test
  (are [x] (=? (merge
                {:lib/type :metadata/field}
                (meta/field-metadata :venues :category-id))
               x)
    (lib.metadata/field meta/metadata-provider (meta/id :venues :category-id))
    (lib.metadata/field meta/metadata-provider (meta/id :venues) "CATEGORY_ID")
    (lib.metadata/field meta/metadata-provider "PUBLIC" "VENUES" "CATEGORY_ID")
    (lib.metadata/field meta/metadata-provider nil "VENUES" "CATEGORY_ID")))

(deftest ^:parallel stage-metadata-test
  (let [query (lib/saved-question-query meta/metadata-provider meta/saved-question)]
    (is (=? {:columns [{:name "ID"}
                       {:name "NAME"}
                       {:name "CATEGORY_ID"}
                       {:name "LATITUDE"}
                       {:name "LONGITUDE"}
                       {:name "PRICE"}]}
            (lib.metadata/stage query -1)))))

(deftest ^:parallel stage-column-metadata-test
  (let [query (lib/saved-question-query meta/metadata-provider meta/saved-question)]
    (are [x] (=? {:lib/type       :metadata/field
                  :display-name   "CATEGORY_ID"
                  :name           "CATEGORY_ID"
                  :base-type      :type/Integer
                  :effective-type :type/Integer
                  :semantic-type  nil}
                 x)
      (lib.metadata/stage-column query "CATEGORY_ID")
      (lib.metadata/stage-column query -1 "CATEGORY_ID"))))

(deftest ^:parallel display-name-from-name-test
  (testing "Use the 'simple humanization' logic to calculate a display name for a Field that doesn't have one"
    (is (= "Venue ID"
           (lib.metadata.calculation/display-name lib.tu/venues-query -1 {:lib/type :metadata/field
                                                                          :name     "venue_id"})))))
