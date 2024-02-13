(ns ^:mb/once metabase.task.email-remove-legacy-pulse-test
  (:require
   [clojure.test :refer :all]
   [metabase.task.email-remove-legacy-pulse :as email-remove-legacy-pulse]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db :test-users))

(deftest send-emails-to-admins-if-instance-has-legacy-pulse
  (mt/with-temp
    [:model/User  admin  {:is_superuser true :first_name "Ngoc" :last_name "Khuat"}
     :model/User  _user  {:is_superuser false}
     :model/Pulse _      {:name "Legacy pulse" :dashboard_id nil :alert_condition nil}
     :model/Pulse _      {:name "Archived pulse" :dashboard_id nil :alert_condition nil :archived true}]
    (mt/with-fake-inbox
      (#'email-remove-legacy-pulse/email-remove-legacy-pulse)
      (testing "all receivers are superuser"
        (is (every? true? (t2/select-fn-vec :is_superuser  :model/User :email [:in (keys @mt/inbox)]))))
      (let [found-regexes  [#"Hi Ngoc Khuat,"
                            #"<li><a href=\"https?://[^\/]+\/pulse/\d+\">Legacy pulse<\/a></li>"]
            not-found-re   #"<li><a href=\"https?://[^\/]+\/pulse/\d+\">Archived pulse<\/a></li>"
            expected-email {:subject "[Metabase] Removal of legacy pulses in upcoming Metabase release"
                            :body    (merge (zipmap (map str found-regexes) (repeat true))
                                            {(str not-found-re) false})}]
        (testing "the email should say Hi and contains link to active pulses"
          (is (= (mt/email-to admin expected-email)
                 (select-keys (apply mt/regex-email-bodies (conj found-regexes not-found-re)) [(:email admin)]))))))))

(deftest skip-if-instance-does-not-have-active-legacy-pulse
  (mt/with-temp
    [:model/User _admin  {:is_superuser true}
     :model/Pulse _      {:name "Archived pulse" :dashboard_id nil :alert_condition nil :archived true}]
    ;; delete legacy pulse if any make sure this won't flake
    (t2/delete! :model/Pulse :dashboard_id nil :alert_condition nil)
    (mt/with-fake-inbox
      (#'email-remove-legacy-pulse/email-remove-legacy-pulse)
      (is (zero? (count @mt/inbox))))))
