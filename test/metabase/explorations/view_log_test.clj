(ns ^:synchronized metabase.explorations.view-log-test
  (:require
   [clojure.test :refer :all]
   [metabase.collections.models.collection :as collection]
   [metabase.events.core :as events]
   [metabase.explorations.view-log :as explorations.view-log]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :each (fn [thunk]
                      (mt/with-temporary-setting-values [synchronous-batch-updates true]
                        (thunk))))

(defn- views
  "All view log rows for `user-id` reading exploration `exploration-id`, newest first."
  [user-id exploration-id]
  (t2/select :model/ViewLog
             :user_id user-id
             :model "exploration"
             :model_id exploration-id
             {:order-by [[:id :desc]]}))

(deftest exploration-read-ee-test
  (mt/with-premium-features #{:audit-app}
    (mt/with-temp [:model/User user {}
                   :model/Exploration exploration {:name "Why is revenue down" :creator_id (:id user)}]
      (testing "An exploration read event is recorded in the view log"
        (events/publish-event! :event/exploration-read {:object-id (:id exploration) :user-id (:id user)})
        (is (=? [{:user_id    (:id user)
                  :model      "exploration"
                  :model_id   (:id exploration)
                  :has_access true}]
                (views (:id user) (:id exploration)))))
      (testing "Repeated reads by the same user shortly after (the page polls while research runs) count once"
        (events/publish-event! :event/exploration-read {:object-id (:id exploration) :user-id (:id user)})
        (events/publish-event! :event/exploration-read {:object-id (:id exploration) :user-id (:id user)})
        (is (= 1 (count (views (:id user) (:id exploration)))))))))

(deftest exploration-read-oss-no-view-logging-test
  (mt/with-premium-features #{}
    (mt/with-temp [:model/User user {}
                   :model/Exploration exploration {:name "Why is revenue down" :creator_id (:id user)}]
      (testing "An exploration read event is not recorded without audit-app"
        (events/publish-event! :event/exploration-read {:object-id (:id exploration) :user-id (:id user)})
        (is (empty? (views (:id user) (:id exploration))))))))

(deftest get-exploration-records-view-test
  (mt/with-premium-features #{:audit-app}
    (mt/with-temp [:model/Exploration exploration {:name "Why is revenue down" :creator_id (mt/user->id :crowberto)}]
      (testing "GET /api/exploration/:id records a view for the current user"
        (mt/user-http-request :crowberto :get 200 (format "exploration/%d" (:id exploration)))
        (is (=? [{:model "exploration" :model_id (:id exploration)}]
                (views (mt/user->id :crowberto) (:id exploration))))))))

(deftest get-exploration-without-access-records-failed-view-test
  (mt/with-premium-features #{:audit-app}
    (mt/with-temp [:model/User owner {}
                   :model/User other {}
                   :model/Exploration exploration {:name          "Private"
                                                   :creator_id    (:id owner)
                                                   :collection_id (:id (collection/user->personal-collection (:id owner)))}]
      (testing "A 403 on GET /api/exploration/:id records a view without access for the current user"
        (mt/user-http-request other :get 403 (format "exploration/%d" (:id exploration)))
        (is (=? [{:user_id    (:id other)
                  :model      "exploration"
                  :model_id   (:id exploration)
                  :has_access false}]
                (views (:id other) (:id exploration))))))))

(deftest first-read-in-window-concurrent-test
  (testing "Concurrent reads of one exploration by one user claim the first read exactly once"
    (let [first-read? #'explorations.view-log/first-read-in-window?
          user-id     (- (rand-int 1000000))
          start       (java.util.concurrent.CountDownLatch. 1)
          results     (doall (for [_ (range 16)]
                               (future (.await start) (first-read? user-id -1))))]
      (.countDown start)
      (is (= 1 (count (filter true? (map deref results))))))))
