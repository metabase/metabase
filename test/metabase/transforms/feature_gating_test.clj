(ns metabase.transforms.feature-gating-test
  (:require
   [clojure.test :refer :all]
   [metabase.test :as mt]
   [metabase.transforms.feature-gating :as transforms.gating]))

(deftest enabled-source-types-for-user-follows-the-advanced-permissions-feature-test
  (testing "a data analyst sees the enabled source types only while advanced-permissions is available"
    (mt/with-data-analyst-role! (mt/user->id :rasta)
      (mt/with-current-user (mt/user->id :rasta)
        (mt/when-ee-evailable
         (mt/with-premium-features #{:transforms-basic :hosting :advanced-permissions}
           (is (= #{"native" "mbql"} (transforms.gating/enabled-source-types-for-user)))))
        (testing "and none once the feature is gone"
          (mt/with-premium-features #{:transforms-basic :hosting}
            (is (nil? (transforms.gating/enabled-source-types-for-user))))))))
  (testing "a superuser is unaffected"
    (mt/with-current-user (mt/user->id :crowberto)
      (mt/with-premium-features #{:transforms-basic :hosting}
        (is (= #{"native" "mbql"} (transforms.gating/enabled-source-types-for-user)))))))
