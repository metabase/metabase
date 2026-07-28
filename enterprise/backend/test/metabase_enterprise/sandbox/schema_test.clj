(ns metabase-enterprise.sandbox.schema-test
  (:require
   [clojure.test :refer :all]
   [metabase.permissions.models.permissions-group :as perms-group]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(deftest ^:parallel normalize-attribute-remappings-test
  (testing "make sure attribute-remappings come back from the DB normalized the way we'd expect"
    (mt/with-temp [:model/Sandbox gtap {:table_id             (mt/id :venues)
                                        :group_id             (u/the-id (perms-group/all-users))
                                        :attribute_remappings {"venue_id" ["variable" ["field" (mt/id :venues :id) nil]]}}]
      (is (= {"venue_id" [:variable [:field (mt/id :venues :id) nil]]}
             (t2/select-one-fn :attribute_remappings :model/Sandbox :id (u/the-id gtap)))))))

(deftest ^:parallel normalize-attribute-remappings-test-2
  (testing "make sure attribute-remappings come back from the DB normalized the way we'd expect"
    (testing (str "apparently sometimes they are saved with just the target, but not type or value? Make sure these "
                  "get normalized correctly.")
      (mt/with-temp [:model/Sandbox gtap {:table_id             (mt/id :venues)
                                          :group_id             (u/the-id (perms-group/all-users))
                                          :attribute_remappings {"user" ["variable" ["field" (mt/id :venues :id) nil]]}}]
        (is (= {"user" [:variable [:field (mt/id :venues :id) nil]]}
               (t2/select-one-fn :attribute_remappings :model/Sandbox :id (u/the-id gtap))))))))

(deftest ^:parallel normalize-attribute-remappings-dimension-targets-test
  (testing "dimension targets (bare, with stage-number, and with field-ref options) round-trip through the normalization transform"
    (doseq [target [[:dimension [:field (mt/id :venues :category_id) nil]]
                    [:dimension [:field (mt/id :venues :category_id) nil] {"stage-number" 0}]
                    [:dimension [:field (mt/id :venues :category_id) {:base-type :type/Integer}] {"stage-number" 0}]]]
      (mt/with-temp [:model/PermissionsGroup group {}
                     :model/Sandbox g {:table_id             (mt/id :venues)
                                       :group_id             (u/the-id group)
                                       :attribute_remappings {"cat" target}}]
        (is (= {"cat" target}
               (t2/select-one-fn :attribute_remappings :model/Sandbox :id (u/the-id g))))))))
