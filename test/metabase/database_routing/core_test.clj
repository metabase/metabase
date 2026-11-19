(ns metabase.database-routing.core-test
  (:require
   [clojure.test :refer :all]
   [metabase.database-routing.core :as database-routing]
   [metabase.workspaces.core :as workspaces]))

(deftest anonymous-router-access-runs-in-no-workspace-test
  (testing "work whose results every user shares reads the Databases as themselves, in no workspace that a request names"
    (workspaces/with-workspace-id 7
      (is (= 7 (workspaces/current-workspace-id)))
      (is (nil? (database-routing/with-anonymous-router-access (workspaces/current-workspace-id))))
      (is (= 7 (workspaces/current-workspace-id))))))
