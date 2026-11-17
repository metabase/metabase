(ns metabase.permissions.settings-test
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.app-db.core :as mdb]
   [metabase.permissions.settings :as permissions.settings]
   [metabase.test :as mt]))

(def ^:private ->expected
  {{:new-admin? true :setting-value true} false
   {:new-admin? true :setting-value false} false
   {:new-admin? false :setting-value true} true
   {:new-admin? false :setting-value false} false})

(deftest show-updated-permission-modal-test
  (doseq [instance-creation-time [(t/local-date-time 2020) (t/local-date-time 2022)]
          fifty-migration-time [(t/local-date-time 2021) (t/local-date-time 2023)]
          modal-setting-value [true false]]
    (testing (str "instance-creation-time: " instance-creation-time
                  ", migration-time: " fifty-migration-time
                  ", modal-setting-value: " modal-setting-value)
      (mt/with-current-user (mt/user->id :crowberto)
        (permissions.settings/show-updated-permission-modal! modal-setting-value)
        (mt/with-dynamic-fn-redefs [permissions.settings/instance-create-time (constantly instance-creation-time)
                                    permissions.settings/v-fifty-migration-time (constantly fifty-migration-time)]
          (let [expected-modal-value (get ->expected
                                          {:new-admin? (t/after? instance-creation-time fifty-migration-time)
                                           :setting-value modal-setting-value})]
            (is (= expected-modal-value (permissions.settings/show-updated-permission-modal)))))))))

(deftest show-updated-permission-banner-test
  (doseq [instance-creation-time [(t/local-date-time 2020) (t/local-date-time 2022)]
          fifty-migration-time [(t/local-date-time 2021) (t/local-date-time 2023)]
          banner-setting-value [true false]]
    (testing (str "instance-creation-time: " instance-creation-time
                  ", migration-time: " fifty-migration-time
                  ", banner-setting-value: " banner-setting-value)
      (mt/with-current-user (mt/user->id :crowberto)
        (permissions.settings/show-updated-permission-banner! banner-setting-value)
        (mt/with-dynamic-fn-redefs [permissions.settings/instance-create-time (constantly instance-creation-time)
                                    permissions.settings/v-fifty-migration-time (constantly fifty-migration-time)]
          (let [expected-banner-value (get ->expected
                                           {:new-admin? (t/after? instance-creation-time fifty-migration-time)
                                            :setting-value banner-setting-value})]
            (is (= expected-banner-value (permissions.settings/show-updated-permission-banner)))))))))

(deftest show-updated-permission-settings-offset-date-time-migration-time-test
  (testing "permission modal/banner settings work when the changelog returns an OffsetDateTime (#65043)"
    ;; MySQL app DBs whose DATABASECHANGELOG.DATEEXECUTED column is a TIMESTAMP return OffsetDateTimes
    (mt/with-current-user (mt/user->id :crowberto)
      (permissions.settings/show-updated-permission-modal! true)
      (permissions.settings/show-updated-permission-banner! true)
      (doseq [[instance-creation-time expected] [[(t/local-date-time 2020) true]
                                                 [(t/local-date-time 2022) false]]]
        (testing (str "instance-creation-time: " instance-creation-time)
          (mt/with-dynamic-fn-redefs [permissions.settings/instance-create-time (constantly instance-creation-time)
                                      mdb/changelog-by-id                       (constantly {:dateexecuted (t/offset-date-time 2021 1 1 0 0 0 0 0)})]
            (is (= expected (permissions.settings/show-updated-permission-modal)))
            (is (= expected (permissions.settings/show-updated-permission-banner)))))))))
