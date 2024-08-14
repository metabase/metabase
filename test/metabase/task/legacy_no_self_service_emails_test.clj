(ns metabase.task.legacy-no-self-service-emails-test
  (:require
   [clojure.test :refer :all]
   [metabase.models.data-permissions :as data-perms]
   [metabase.models.permissions-group :as perms-group]
   [metabase.task.legacy-no-self-service-emails
    :as legacy-no-self-service-emails]
   [metabase.test :as mt]))

(deftest legacy-no-self-service-groups-test
  (testing "legacy-no-self-service-groups returns a list of groups with any `legacy-no-self-service` permissions"
    (mt/with-full-data-perms-for-all-users!
      (is (= 0 (count (#'legacy-no-self-service-emails/legacy-no-self-service-groups))))

      ;; `legacy-no-self-service` set at the DB-level
      (data-perms/set-database-permission! (perms-group/all-users) (mt/id) :perms/view-data :legacy-no-self-service)
      (is (= [(perms-group/all-users)]
             (#'legacy-no-self-service-emails/legacy-no-self-service-groups)))

      (data-perms/set-database-permission! (perms-group/all-users) (mt/id) :perms/view-data :unrestricted)
      (is (= 0 (count (#'legacy-no-self-service-emails/legacy-no-self-service-groups))))

      ;; `legacy-no-self-service` set at the table-level
      (data-perms/set-table-permission! (perms-group/all-users) (mt/id :venues) :perms/view-data :legacy-no-self-service)
      (is (= [(perms-group/all-users)]
             (#'legacy-no-self-service-emails/legacy-no-self-service-groups))))))
