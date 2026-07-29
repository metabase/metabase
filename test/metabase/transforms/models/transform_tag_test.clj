(ns metabase.transforms.models.transform-tag-test
  "Tests for the transform tag model."
  (:require
   [clojure.test :refer :all]
   [metabase.api.common :as api]
   [metabase.test :as mt]
   [metabase.transforms.models.transform-tag :as transform-tag]
   [metabase.util.i18n :as i18n]
   [toucan2.core :as t2]))

(comment transform-tag/keep-me)

(deftest initial-tags-translated-on-select
  (doseq [[type name] [["hourly"  (i18n/trs "hourly")]
                       ["daily"   (i18n/trs "daily")]
                       ["weekly"  (i18n/trs "weekly")]
                       ["monthly" (i18n/trs "monthly")]]]
    (mt/with-temp [:model/TransformTag tag {:name "default" :built_in_type type}]
      (is (= name
             (str (:name (t2/select-one :model/TransformTag (:id tag)))))))))

(deftest initial-tags-translated-on-update
  (doseq [type ["hourly" "daily" "weekly" "monthly"]]
    (mt/with-temp [:model/TransformTag tag {:name "default" :built_in_type type}]
      (t2/update! :model/TransformTag :id (:id tag)
                  {:name "default2"})
      (is (= "default2"
             (:name (t2/select-one :model/TransformTag (:id tag))))))))

(deftest visible-transform-tag-filter-clause-test
  (testing "data analysts and superusers get a nil clause (no filtering), matching can-read?"
    (mt/with-current-user (mt/user->id :crowberto)
      (is (nil? (transform-tag/visible-transform-tag-filter-clause))))
    (mt/with-temp-vals-in-db :model/User (mt/user->id :rasta) {:is_data_analyst true}
      (mt/with-current-user (mt/user->id :rasta)
        (binding [api/*is-data-analyst?* true]
          (is (nil? (transform-tag/visible-transform-tag-filter-clause)))))))
  (testing "non-analysts get an always-false clause, matching can-read?"
    (mt/with-current-user (mt/user->id :rasta)
      (is (= [:= [:inline 1] [:inline 0]]
             (transform-tag/visible-transform-tag-filter-clause)))))
  (testing "no bound user -> nil clause; outside the request cycle filtering is the caller's concern"
    (is (nil? (transform-tag/visible-transform-tag-filter-clause)))))
