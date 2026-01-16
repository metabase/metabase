(ns metabase-enterprise.data-studio.api.permissions-groups-test
  (:require
   [clojure.test :refer [deftest testing is]]
   [medley.core :as m]
   [metabase.permissions.models.permissions-group :as perms-group]
   [metabase.test :as mt]
   [metabase.util.malli.schema :as ms]))

(defn- fetch-groups
  ([]
   (fetch-groups {}))
  ([& query-params]
   (set (apply mt/user-http-request
               :crowberto :get 200 "permissions/group" query-params))))

(deftest fetch-groups-test
  (testing "GET /api/permissions/group"
    (mt/with-premium-features #{}
      (is (not (contains? (set (map :id (mt/user-http-request :crowberto :get 200 "permissions/group")))
                          (:id (perms-group/data-analyst))))))
    (mt/with-premium-features #{:data-studio}
      (is (contains? (set (map :id (mt/user-http-request :crowberto :get 200 "permissions/group")))
                     (:id (perms-group/data-analyst)))))))
