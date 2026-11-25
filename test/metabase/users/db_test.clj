(ns metabase.users.db-test
  (:require
   [clojure.test :refer :all]
   [metabase.test :as mt]
   [metabase.users.db :as users.db]
   [toucan2.core :as t2]))

(deftest partitioned-reads-and-deletes-test
  (testing "reads of more users than one partition answer the same"
    (let [user-ids (set (map mt/user->id [:rasta :lucky :crowberto :trashbird]))
          reads    (fn []
                     {:memberships (set (users.db/group-memberships-for-users user-ids))
                      :personal    (set (users.db/user-ids-of-type (vec user-ids) :personal))})
          single   (reads)]
      (is (= user-ids (:personal single)))
      (is (= single (mt/with-partition-size 2 (reads))))))
  (testing "deleting more parameter values than one partition deletes and counts all of them"
    (mt/with-temp [:model/Dashboard {dashboard-id :id} {}]
      (let [user-id    (mt/user->id :rasta)
            parameters (for [parameter-id ["a" "b" "c" "d" "e"]]
                         {:user_id user-id :dashboard_id dashboard-id :parameter_id parameter-id})]
        (users.db/insert-user-parameter-values! (map #(assoc % :value ["x"]) parameters))
        (is (= 5 (mt/with-partition-size 2
                   (users.db/delete-user-parameter-values! parameters))))
        (is (zero? (t2/count :model/UserParameterValue :dashboard_id dashboard-id)))))))
