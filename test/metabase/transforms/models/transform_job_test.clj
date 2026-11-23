(ns metabase.transforms.models.transform-job-test
  "Tests for the transform job model."
  (:require
   [clojure.test :refer :all]
   [metabase.api.common :as api]
   [metabase.events.core :as events]
   [metabase.events.test-util :as events.tu]
   [metabase.models.interface :as mi]
   [metabase.test :as mt]
   [metabase.transforms.models.transform-job :as transform-job]
   [metabase.transforms.models.transform-tag :as transform-tag]
   [metabase.transforms.schedule :as transforms.schedule]
   [metabase.transforms.schema :as transforms.schema]
   [metabase.util.i18n :as i18n]
   [metabase.util.malli.registry :as mr]
   [toucan2.core :as t2]))

(def ^:private per-row-update-growth
  "The statements an update of one more row adds when the rows are in different stored states, so that Toucan writes
  them one at a time: the before-update SELECT and the UPDATE, 2 for each of the 4 rows between 2 and 6."
  8)



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
                    :schedule "0 0 0 * * ?"
                    :built_in_type type}]
      (is (= (str (:name translations))
             (str (:name (t2/select-one :model/TransformJob :id (:id job))))))
      (is (= (str (:description translations))
             (str (:description (t2/select-one :model/TransformJob :id (:id job)))))))))

(deftest initial-jobs-translated-on-update
  (testing "Setting name still translates description"
    (doseq [[type translations] values]
      (mt/with-temp [:model/TransformJob job
                     {:name "default"
                      :description "default description"
                      :schedule "0 0 0 * * ?"
                      :built_in_type type}]
        (transform-job/update-transform-jobs! [{:id (:id job) :name "default2"}])
        (is (= "default2"
               (str (:name (t2/select-one :model/TransformJob :id (:id job))))))
        (is (= (str (:description translations))
               (str (:description (t2/select-one :model/TransformJob :id (:id job)))))))))
  (testing "Setting description still translates name"
    (doseq [[type translations] values]
      (mt/with-temp [:model/TransformJob job
                     {:name "default"
                      :description "default description"
                      :schedule "0 0 0 * * ?"
                      :built_in_type type}]
        (transform-job/update-transform-jobs! [{:id (:id job) :description "default description 2"}])
        (is (= "default description 2"
               (str (:description (t2/select-one :model/TransformJob :id (:id job))))))
        (is (= (str (:name translations))
               (str (:name (t2/select-one :model/TransformJob :id (:id job)))))))))
  (testing "Setting schedule translates description and name"
    (doseq [[type translations] values]
      (mt/with-temp [:model/TransformJob job
                     {:name "default"
                      :description "default description"
                      :schedule "0 0 0 * * ?"
                      :built_in_type type}]
        (transform-job/update-transform-jobs! [{:id (:id job) :schedule "0 0 1 * * ?"}])
        (is (= (str (:description translations))
               (str (:description (t2/select-one :model/TransformJob :id (:id job))))))
        (is (= (str (:name translations))
               (str (:name (t2/select-one :model/TransformJob :id (:id job))))))))))

(deftest data-analyst-job-access-follows-the-advanced-permissions-feature-test
  (testing "a data analyst reads, writes and creates transform jobs only while advanced-permissions is available"
    (mt/with-data-analyst-role! (mt/user->id :rasta)
      (mt/with-current-user (mt/user->id :rasta)
        (mt/when-ee-evailable
         (mt/with-premium-features #{:advanced-permissions}
           (is (mi/can-read? (t2/hydrate (t2/select-one :model/TransformJob :id 1) :can_read)))
           (is (mi/can-write? (t2/hydrate (t2/instance :model/TransformJob {}) :can_write)))
           (is (mi/can-create? :model/TransformJob {}))))
        (testing "and none once the feature is gone"
          (mt/with-premium-features #{}
            (is (not (mi/can-read? (t2/hydrate (t2/select-one :model/TransformJob :id 1) :can_read))))
            (is (not (mi/can-write? (t2/hydrate (t2/instance :model/TransformJob {}) :can_write))))
            (is (not (mi/can-create? :model/TransformJob {})))))))
    (testing "a superuser is unaffected"
      (mt/with-current-user (mt/user->id :crowberto)
        (mt/with-premium-features #{}
          (is (mi/can-read? (t2/hydrate (t2/select-one :model/TransformJob :id 1) :can_read)))
          (is (mi/can-write? (t2/hydrate (t2/instance :model/TransformJob {}) :can_write)))
          (is (mi/can-create? :model/TransformJob {})))))))

(deftest schema-checks-schedule-test
  (is (mr/validate ::transforms.schema/transform-job.schedule "0 0 0 * * ?"))
  (is (not (mr/validate ::transforms.schema/transform-job.schedule "not a cron"))))

(deftest quartz-trigger-follows-job-row-test
  (mt/with-temp-scheduler!
    (let [job              (first (transform-job/create-transform-jobs! [{:name "job" :schedule "0 0 0 * * ? *"}]))
          job-id           (:id job)
          trigger-schedule #(:schedule (transforms.schedule/existing-trigger job-id))]
      (testing "a created job is scheduled"
        (is (= "0 0 0 * * ? *" (trigger-schedule))))
      (testing "a schedule change moves the trigger"
        (transform-job/update-transform-jobs! [{:id job-id :schedule "0 0 1 * * ? *"}])
        (is (= "0 0 1 * * ? *" (trigger-schedule))))
      (testing "deactivating removes the trigger, and activating restores it"
        (transform-job/update-transform-jobs! [{:id job-id :active false}])
        (is (nil? (trigger-schedule)))
        (transform-job/update-transform-jobs! [{:id job-id :schedule "0 0 2 * * ? *"}])
        (is (nil? (trigger-schedule)))
        (transform-job/update-transform-jobs! [{:id job-id :active true}])
        (is (= "0 0 2 * * ? *" (trigger-schedule))))
      (testing "deleting the job removes the trigger"
        (transform-job/delete-transform-jobs! [job-id])
        (is (nil? (trigger-schedule)))))))

(deftest job-update-check-test
  (mt/with-temp [:model/TransformTag tag {}
                 :model/TransformJob job {}]
    (testing "a superuser may update a job and move it to other tags"
      (mt/with-current-user (mt/user->id :crowberto)
        (is (true? (boolean (api/update-check job {:tag_ids [(:id tag)]}))))))
    (testing "a user with no data analyst access may not"
      (mt/with-current-user (mt/user->id :rasta)
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"permissions"
                              (api/update-check job {:name "renamed"})))
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"permissions"
                              (api/create-check :model/TransformJob {:tag_ids [(:id tag)]})))))))

(deftest write-function-statement-counts-do-not-grow-with-rows-test
  (mt/with-temp-scheduler!
    (let [created (atom [])
          create! (fn [n]
                    (events.tu/statement-count! (fn [] (swap! created into
                                                              (map :id (transform-job/create-transform-jobs!
                                                                        (vec (repeatedly n #(hash-map :name (mt/random-name)
                                                                                                      :schedule "0 0 0 * * ? *")))))))))]
      (try
        (testing "creating jobs"
          (create! 1)
          (is (= (create! 2) (create! 6))))
        (testing "updating jobs"
          (let [update! (fn [ids]
                          (events.tu/statement-count!
                           (fn [] (transform-job/update-transform-jobs! (mapv (fn [row-id] (assoc {:schedule "0 0 1 * * ? *"} :id row-id)) ids)))))
                ids     @created]
            (update! (take 1 ids))
            (is (= (update! (take 2 (drop 1 ids))) (update! (take 6 (drop 3 ids)))))))
        (testing "deleting jobs"
          (let [delete! (fn [ids]
                          (events.tu/statement-count! (fn [] (transform-job/delete-transform-jobs! ids))))
                ids     @created]
            (delete! (take 1 ids))
            (is (= (delete! (take 2 (drop 1 ids))) (delete! (take 6 (drop 3 ids)))))))
        (finally
          (t2/delete! :model/TransformJob :id [:in @created]))))))

(deftest built-in-job-update-statement-counts-do-not-grow-with-rows-test
  (mt/with-temp-scheduler!
    (mt/with-model-cleanup [:model/TransformJob]
      (let [jobs    (fn [n]
                      (mapv :id (transform-job/create-transform-jobs!
                                 (vec (repeatedly n #(hash-map :name (mt/random-name) :schedule "0 0 0 * * ? *"))))))
            built   (fn [ids built-in-type]
                      (t2/update! :model/TransformJob :id [:in ids] {:built_in_type built-in-type})
                      ids)
            counted (fn [ids]
                      (events.tu/statement-count! #(transform-job/update-transform-jobs! (mapv (fn [row-id] (assoc {:schedule "0 0 1 * * ? *"} :id row-id)) ids))))
            warm-up (jobs 1)
            two     (into (built (jobs 1) "hourly") (jobs 1))
            six     (into (built (jobs 3) "hourly") (jobs 3))]
        (counted warm-up)
        (is (= (counted two) (counted six)))
        (testing "each built-in job becomes a custom one with its translated name and description"
          (is (= {:name        (str (get-in values ["hourly" :name]))
                  :description (str (get-in values ["hourly" :description]))
                  :built_in_type nil}
                 (-> (t2/select-one :model/TransformJob :id (first six))
                     (select-keys [:name :description :built_in_type])
                     (update :name str)
                     (update :description str)))))))))

(deftest plain-update-makes-built-in-jobs-custom-test
  (mt/with-temp-scheduler!
    (mt/with-model-cleanup [:model/TransformJob]
      (let [[hourly daily custom] (mapv :id (transform-job/create-transform-jobs!
                                             (vec (repeatedly 3 #(hash-map :name (mt/random-name) :schedule "0 0 0 * * ? *")))))]
        (t2/update! :model/TransformJob :id hourly {:built_in_type "hourly"})
        (t2/update! :model/TransformJob :id daily {:built_in_type "daily"})
        (t2/update! :model/TransformJob :id custom {:description "mine"})
        (testing "a plain update of several rows holding other values stores a value for each row"
          (t2/update! :model/TransformJob :id [:in [hourly daily custom]] {:schedule "0 0 3 * * ? *"})
          (is (= [(str (get-in values ["hourly" :name])) nil
                  (str (get-in values ["daily" :name])) nil
                  "mine"]
                 (let [rows (t2/select :model/TransformJob :id [:in [hourly daily custom]] {:order-by [:id]})]
                   [(str (:name (nth rows 0))) (:built_in_type (nth rows 0))
                    (str (:name (nth rows 1))) (:built_in_type (nth rows 1))
                    (:description (nth rows 2))]))))
        (testing "a change of the name alone keeps the name it gives"
          (t2/update! :model/TransformJob :id hourly {:built_in_type "hourly"})
          (t2/update! :model/TransformJob :id hourly {:name "Renamed"})
          (is (= ["Renamed" nil]
                 ((juxt :name :built_in_type) (t2/select-one :model/TransformJob :id hourly)))))
        (testing "an update that changes nothing but the timestamp leaves a built-in job built in"
          (t2/update! :model/TransformJob :id daily {:built_in_type "daily"})
          (t2/update! :model/TransformJob :id daily {:updated_at (mi/current-timestamp)})
          (is (= "daily" (t2/select-one-fn :built_in_type :model/TransformJob :id daily))))))))

(deftest built-in-job-update-event-carries-real-values-test
  (mt/with-temp-scheduler!
    (mt/with-model-cleanup [:model/TransformJob]
      (let [id        (:id (first (transform-job/create-transform-jobs! [{:name (mt/random-name) :schedule "0 0 0 * * ? *"}])))
            published (atom [])]
        (t2/update! :model/TransformJob :id id {:built_in_type "hourly"})
        (with-redefs [events/publish-event! (fn [_topic event] (swap! published conj event))]
          (transform-job/update-transform-jobs! [{:id id :schedule "0 0 1 * * ? *"}]))
        (let [object (-> @published first :changes first :object)]
          (is (= (str (get-in values ["hourly" :name])) (str (:name object))))
          (is (nil? (:built_in_type object)))
          (is (not-any? vector? (vals object))))))))

(deftest create-transform-jobs-with-different-key-sets-test
  (mt/with-model-cleanup [:model/TransformJob]
    (let [[plain described] (transform-job/create-transform-jobs! [{:name "Plain" :schedule "0 0 0 * * ?"}
                                                                   {:name "Described" :schedule "0 0 0 * * ?" :description "About"}])]
      (is (= ["Plain" nil] [(:name plain) (:description plain)]))
      (is (true? (t2/select-one-fn :active :model/TransformJob :id (:id plain))))
      (is (= "About" (t2/select-one-fn :description :model/TransformJob :id (:id described)))))))

(deftest tag-link-writes-statement-count-does-not-grow-with-tags-test
  (mt/with-temp-scheduler!
    (mt/with-model-cleanup [:model/TransformJob :model/TransformTag]
      (let [tags    (mapv :id (transform-tag/create-transform-tags! (mapv #(hash-map :name (str "tag " % (mt/random-name))) (range 8))))
            counted (fn [n]
                      (let [id (:id (first (transform-job/create-transform-jobs! [{:name (mt/random-name) :schedule "0 0 0 * * ? *"}])))]
                        (transform-job/update-transform-job! id {:tag_ids (vec (take n tags))})
                        (events.tu/statement-count!
                         #(transform-job/update-transform-job! id {:tag_ids (into [(nth tags n)] (reverse (rest (take n tags))))}))))]
        (counted 2)
        (is (= (counted 2) (counted 6)))))))

(deftest mixed-state-job-update-statement-counts-do-not-grow-with-rows-test
  (mt/with-temp-scheduler!
    (mt/with-model-cleanup [:model/TransformJob]
      (let [jobs    (fn [n schedules]
                      (let [ids (mapv :id (transform-job/create-transform-jobs!
                                           (mapv (fn [schedule] {:name (mt/random-name) :schedule schedule})
                                                 (take n schedules))))]
                        (run! transform-job/deactivate-job! (take-nth 2 ids))
                        ids))
            counted (fn [n]
                      (let [ids (jobs n (cons "0 0 1 * * ? *" (repeat "0 0 0 * * ? *")))]
                        (events.tu/statement-count!
                         #(transform-job/update-transform-jobs! (mapv (fn [row-id] (assoc {:schedule "0 0 1 * * ? *" :description "d"} :id row-id)) ids)))))]
        (counted 1)
        (is (<= (counted 6) (+ (counted 2) per-row-update-growth)))))))
