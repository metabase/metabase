(ns metabase.collections-rest.archive-update-permissions-test
  "A user-by-change table of the answers and statuses of archiving and restoring a Collection with `PUT /api/collection/:id`."
  (:require
   [clojure.test :refer :all]
   [metabase.permissions.models.permissions :as perms]
   [metabase.permissions.models.permissions-group :as perms-group]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- grant!
  [level collection]
  (case level
    :write (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection)
    :read  (perms/grant-collection-read-permissions! (perms-group/all-users) collection)
    :none  nil))

(deftest archive-collection-test
  (doseq [[user top-level sub-level expected-status]
          [[:rasta     :write :write 200]
           [:rasta     :write :read  403]
           [:rasta     :write :none  403]
           [:rasta     :read  :write 403]
           [:rasta     :none  :none  403]
           [:crowberto :none  :none  200]]]
    (testing (str user " archives a collection with " top-level " that holds one with " sub-level)
      (mt/with-non-admin-groups-no-root-collection-perms
        (mt/with-temp [:model/Collection top {}
                       :model/Collection sub {:location (format "/%d/" (:id top))}]
          (grant! top-level top)
          (grant! sub-level sub)
          (let [response (mt/user-http-request user :put expected-status (str "collection/" (:id top)) {:archived true})]
            (if (= 200 expected-status)
              (do (is (true? (t2/select-one-fn :archived :model/Collection :id (:id top))))
                  (is (true? (t2/select-one-fn :archived :model/Collection :id (:id sub)))))
              (do (is (= "You don't have permissions to do that." response))
                  (is (false? (t2/select-one-fn :archived :model/Collection :id (:id top))))
                  (is (false? (t2/select-one-fn :archived :model/Collection :id (:id sub)))))))))))
  (testing "rasta archives a collection whose card another user wrote and whose child he cannot read"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp [:model/Collection top  {}
                     :model/Collection sub  {:location (format "/%d/" (:id top))}
                     :model/Card       card {:collection_id (:id sub)}]
        (grant! :write top)
        (is (= "You don't have permissions to do that."
               (mt/user-http-request :rasta :put 403 (str "collection/" (:id top)) {:archived true})))
        (is (false? (t2/select-one-fn :archived :model/Card :id (:id card))))))))

(deftest restore-collection-test
  (doseq [[user top-level sub-level expected-status]
          [[:rasta     :write :write 200]
           [:rasta     :write :read  403]
           [:rasta     :read  :write 403]
           [:rasta     :none  :none  403]
           [:crowberto :none  :none  200]]]
    (testing (str user " restores a collection with " top-level " that held one with " sub-level)
      (mt/with-non-admin-groups-no-root-collection-perms
        (mt/with-temp [:model/Collection top {}
                       :model/Collection sub {:location (format "/%d/" (:id top))}]
          (grant! top-level top)
          (grant! sub-level sub)
          (mt/user-http-request :crowberto :put 200 (str "collection/" (:id top)) {:archived true})
          (let [response (mt/user-http-request user :put expected-status (str "collection/" (:id top)) {:archived false})]
            (if (= 200 expected-status)
              (is (false? (t2/select-one-fn :archived :model/Collection :id (:id top))))
              (do (is (= "You don't have permissions to do that." response))
                  (is (true? (t2/select-one-fn :archived :model/Collection :id (:id top)))))))))))
  (doseq [[user target-level expected-status]
          [[:rasta     :write 200]
           [:rasta     :read  403]
           [:rasta     :none  403]
           [:crowberto :none  200]]]
    (testing (str user " restores a collection into another parent with " target-level)
      (mt/with-non-admin-groups-no-root-collection-perms
        (mt/with-temp [:model/Collection top    {}
                       :model/Collection target {}]
          (grant! :write top)
          (grant! target-level target)
          (mt/user-http-request :crowberto :put 200 (str "collection/" (:id top)) {:archived true})
          (let [response (mt/user-http-request user :put expected-status (str "collection/" (:id top))
                                               {:archived false :parent_id (:id target)})]
            (if (= 200 expected-status)
              (is (= (format "/%d/" (:id target)) (t2/select-one-fn :location :model/Collection :id (:id top))))
              (do (is (= "You don't have permissions to do that." response))
                  (is (true? (t2/select-one-fn :archived :model/Collection :id (:id top))))))))))
    (testing "restoring into an archived parent is a 400 whoever asks"
      (mt/with-non-admin-groups-no-root-collection-perms
        (mt/with-temp [:model/Collection top    {}
                       :model/Collection target {}]
          (grant! :write top)
          (mt/user-http-request :crowberto :put 200 (str "collection/" (:id top)) {:archived true})
          (mt/user-http-request :crowberto :put 200 (str "collection/" (:id target)) {:archived true})
          (doseq [user [:rasta :crowberto]]
            (mt/user-http-request user :put 400 (str "collection/" (:id top))
                                  {:archived false :parent_id (:id target)}))))))
  (testing "restoring into a parent that does not exist is a 404"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp [:model/Collection top {}]
        (grant! :write top)
        (mt/user-http-request :crowberto :put 200 (str "collection/" (:id top)) {:archived true})
        (mt/user-http-request :rasta :put 404 (str "collection/" (:id top))
                              {:archived false :parent_id Integer/MAX_VALUE})))))
