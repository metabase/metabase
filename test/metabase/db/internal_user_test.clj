(ns ^:mb/once metabase.db.internal-user-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.config :as config]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(deftest internal-user-is-in-all-users-test
  (testing "The internal user should be in the All Users group, just like any other user."
    (let [memberships  (-> (t2/select-one :model/User config/internal-mb-user-id)
                           (t2/hydrate :user_group_memberships)
                           :user_group_memberships
                           (->> (map :id)))
          all-users-id (t2/select-one-pk :model/PermissionsGroup :name "All Users")]
      (is [all-users-id] memberships))))

(deftest internal-user-is-unmodifiable-via-api-test
  (testing "GET /api/user"
    ;; since the Internal user is inactive, we only need to check in the `:include_deactivated` `true`
    (let [{:keys [data total]} (mt/user-http-request :crowberto :get 200 "user", :include_deactivated true)
          internal-user-email  (t2/select-one-fn :email :model/User config/internal-mb-user-id)]
      (testing "does not return the internal user"
        (is (not-any? (comp #{internal-user-email} :email) data)))
      (testing "does not count the internal user"
        (is (= total (count data))))))

  (testing "User Endpoints with :id"
    (doseq [[method endpoint status-code] [[:put "user/:id" 400]
                                           [:put "user/:id/reactivate" 400]
                                           [:delete "user/:id" 400]
                                           [:put "user/:id/modal/qbnewb" 400]
                                           [:post "user/:id/send_invite" 400]]]
      (let [endpoint (str/replace endpoint #":id" (str config/internal-mb-user-id))
            testing-details-string (str/join " " [(u/upper-case-en (name method))
                                                  endpoint
                                                  "does not allow modifying the internal user"])]
        (testing testing-details-string
          (is (= "Not able to modify the internal user"
                 (mt/user-http-request :crowberto method status-code endpoint))))))))
