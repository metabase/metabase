(ns metabase-enterprise.data-studio.api.permissions-groups-test
  (:require
   [clojure.test :refer [deftest testing is]]
   [metabase.permissions.models.permissions-group :as perms-group]
   [metabase.test :as mt]))

(deftest fetch-groups-test
  (testing "GET /api/permissions/group - Data Analysts group is always visible on EE"
    (is (contains? (set (map :id (mt/user-http-request :crowberto :get 200 "permissions/group")))
                   (:id (perms-group/data-analyst))))))
