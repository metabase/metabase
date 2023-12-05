(ns ^:mb/once metabase.task.email-remove-legacy-pulse-test
  (:require
   [clojure.test :refer :all]
   [metabase.task.email-remove-legacy-pulse :as email-remove-legacy-pulse]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(deftest send-emails-to-admins-if-instance-has-legacy-pulse
  (mt/with-temp
    [:model/User  admin {:is_superuser true}
     :model/Pulse _     {:name "Legacy pulse" :dashboard_id nil :alert_condition nil}]
    (mt/with-fake-inbox
      (#'email-remove-legacy-pulse/email-remove-legacy-pulse)
      (let [regexes        [#"Hi [^,]*,"
                            #"<li><a href=\"https?://[^\/]+\/pulse/\d+\">Legacy pulse<\/a></li>"]
            expected-email {:subject "Removal of Legacy Pulses in Upcoming Metabase Release"
                            :body    (zipmap (map str regexes) (repeat true))}]
        (is (= (merge (mt/email-to :crowberto expected-email)
                      (mt/email-to admin expected-email))
               (apply mt/regex-email-bodies regexes)))))))

(deftest skip-if-instance-does-not-have-legacy-pulse
  (mt/with-temp
    [:model/User _admin {:is_superuser true}]
    ;; delete legacy pulse if any make sure this won't flake
    (t2/delete! :model/Pulse :dashboard_id nil :alert_condition nil)
    (mt/with-fake-inbox
      (#'email-remove-legacy-pulse/email-remove-legacy-pulse)
      (is (zero? (count @mt/inbox))))))
