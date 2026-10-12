(ns metabase.transforms.models.transform-job-test
  "Tests for the transform job model."
  (:require
   [clojure.test :refer :all]
   [metabase.models.interface :as mi]
   [metabase.test :as mt]
   [metabase.transforms.models.transform-job :as transform-job]
   [metabase.util.i18n :as i18n]
   [toucan2.core :as t2]))

(comment transform-job/keep-me)

(def ^:private values {"hourly"
                       {:name (i18n/deferred-trs "Hourly job")
                        :description (i18n/deferred-trs "Executes transforms tagged with ''hourly'' every hour")}

                       "daily"
                       {:name (i18n/deferred-trs "Daily job")
                        :description (i18n/deferred-trs "Executes transforms tagged with ''daily'' once per day")}

                       "weekly"
                       {:name (i18n/deferred-trs "Weekly job")
                        :description (i18n/deferred-trs "Executes transforms tagged with ''weekly'' once per week")}

                       "monthly"
                       {:name (i18n/deferred-trs "Monthly job")
                        :description (i18n/deferred-trs "Executes transforms tagged with ''monthly'' once per month")}})

(deftest initial-jobs-translated-on-select
  (doseq [[type translations] values]
    (mt/with-temp [:model/TransformJob job
                   {:name "default"
                    :description "default description"
                    :schedule "* 0 0 0 0"
                    :built_in_type type}]
      (is (= (str (:name translations))
             (str (:name (t2/select-one :model/TransformJob (:id job))))))
      (is (= (str (:description translations))
             (str (:description (t2/select-one :model/TransformJob (:id job)))))))))

(deftest initial-jobs-translated-on-update
  (testing "Setting name still translates description"
    (doseq [[type translations] values]
      (mt/with-temp [:model/TransformJob job
                     {:name "default"
                      :description "default description"
                      :schedule "* 0 0 0 0"
                      :built_in_type type}]
        (t2/update! :model/TransformJob :id (:id job)
                    {:name "default2"})
        (is (= "default2"
               (str (:name (t2/select-one :model/TransformJob (:id job))))))
        (is (= (str (:description translations))
               (str (:description (t2/select-one :model/TransformJob (:id job)))))))))
  (testing "Setting description still translates name"
    (doseq [[type translations] values]
      (mt/with-temp [:model/TransformJob job
                     {:name "default"
                      :description "default description"
                      :schedule "* 0 0 0 0"
                      :built_in_type type}]
        (t2/update! :model/TransformJob :id (:id job)
                    {:description "default description 2"})
        (is (= "default description 2"
               (str (:description (t2/select-one :model/TransformJob (:id job))))))
        (is (= (str (:name translations))
               (str (:name (t2/select-one :model/TransformJob (:id job)))))))))
  (testing "Setting schedule translates description and name"
    (doseq [[type translations] values]
      (mt/with-temp [:model/TransformJob job
                     {:name "default"
                      :description "default description"
                      :schedule "* 0 0 0 0"
                      :built_in_type type}]
        (t2/update! :model/TransformJob :id (:id job)
                    {:schedule "0 0 0 0 0"})
        (is (= (str (:description translations))
               (str (:description (t2/select-one :model/TransformJob (:id job))))))
        (is (= (str (:name translations))
               (str (:name (t2/select-one :model/TransformJob (:id job))))))))))

(deftest data-analyst-job-access-follows-the-advanced-permissions-feature-test
  (testing "a data analyst reads, writes and creates transform jobs only while advanced-permissions is available"
    (mt/with-data-analyst-role! (mt/user->id :rasta)
      (mt/with-current-user (mt/user->id :rasta)
        (mt/when-ee-evailable
         (mt/with-premium-features #{:advanced-permissions}
           (is (mi/can-read? :model/TransformJob 1))
           (is (mi/can-write? (t2/instance :model/TransformJob {})))
           (is (mi/can-create? :model/TransformJob {}))))
        (testing "and none once the feature is gone"
          (mt/with-premium-features #{}
            (is (not (mi/can-read? :model/TransformJob 1)))
            (is (not (mi/can-write? (t2/instance :model/TransformJob {}))))
            (is (not (mi/can-create? :model/TransformJob {})))))))
    (testing "a superuser is unaffected"
      (mt/with-current-user (mt/user->id :crowberto)
        (mt/with-premium-features #{}
          (is (mi/can-read? :model/TransformJob 1))
          (is (mi/can-write? (t2/instance :model/TransformJob {})))
          (is (mi/can-create? :model/TransformJob {})))))))
