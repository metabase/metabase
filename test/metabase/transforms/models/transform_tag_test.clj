(ns metabase.transforms.models.transform-tag-test
  "Tests for the transform tag model."
  (:require
   [clojure.test :refer :all]
   [metabase.models.interface :as mi]
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

(deftest data-analyst-tag-access-follows-the-advanced-permissions-feature-test
  (testing "a data analyst reads, writes and creates transform tags only while advanced-permissions is available"
    (mt/with-temp [:model/TransformTag tag {:name "gated"}]
      (mt/with-data-analyst-role! (mt/user->id :rasta)
        (mt/with-current-user (mt/user->id :rasta)
          (mt/when-ee-evailable
           (mt/with-premium-features #{:advanced-permissions}
             (is (mi/can-read? :model/TransformTag 1))
             (is (mi/can-write? tag))
             (is (mi/can-create? :model/TransformTag {}))))
          (testing "and none once the feature is gone"
            (mt/with-premium-features #{}
              (is (not (mi/can-read? :model/TransformTag 1)))
              (is (not (mi/can-write? tag)))
              (is (not (mi/can-create? :model/TransformTag {})))))))
      (testing "a superuser is unaffected"
        (mt/with-current-user (mt/user->id :crowberto)
          (mt/with-premium-features #{}
            (is (mi/can-read? :model/TransformTag 1))
            (is (mi/can-write? tag))
            (is (mi/can-create? :model/TransformTag {}))))))))
