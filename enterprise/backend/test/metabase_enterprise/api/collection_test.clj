(ns metabase-enterprise.api.collection-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.audit-db :as audit-db]
   [metabase-enterprise.audit-db-test :as audit-db-test]
   [metabase.models :refer [Collection]]
   [metabase.public-settings.premium-features-test :as premium-features-test]
   [metabase.test :as mt]
   [toucan2.tools.with-temp :as t2.with-temp]))

(deftest list-collections-instance-analytics-test
  (premium-features-test/with-premium-features #{:audit-app}
    (audit-db-test/with-audit-db-restoration
      (audit-db/ensure-audit-db-installed!)
      (t2.with-temp/with-temp [Collection _ {:name "Zippy"}]
        (testing "Instance Analytics Collection should be the last collection."
          (testing "GET /api/collection"
            (is (= "instance-analytics"
                   (->> (mt/user-http-request :rasta :get 200 "collection")
                        last
                        :type))))
          (testing "GET /api/collection/test"
            (is (= "instance-analytics"
                   (->> (mt/user-http-request :rasta :get 200 "collection/tree")
                        last
                        :type)))))))))
