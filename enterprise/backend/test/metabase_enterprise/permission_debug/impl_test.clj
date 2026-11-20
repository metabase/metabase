(ns metabase-enterprise.permission-debug.impl-test
  {:clj-kondo/config '{:linters {:deprecated-var {:exclude {metabase.test.data/mbql-query {:namespaces [metabase-enterprise.permission-debug.impl-test]}}}}}}
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.permission-debug.impl :as permission-debug.impl]
   [metabase-enterprise.test :as met]
   [metabase.permissions.core :as perms]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util.i18n :refer [tru]]))

(use-fixtures :once (fixtures/initialize :db))

(defmacro with-temp-revoke-collection-perms!
  [group-or-id collection-or-id & body]
  `(do (perms/revoke-collection-permissions! ~group-or-id ~collection-or-id)
       ~@body
       (perms/grant-collection-readwrite-permissions! ~group-or-id ~collection-or-id)))

(deftest debug-permissions-card-read-with-permission-test
  (testing "debug-permissions for :card/read when user has permission to read the card"
    (mt/with-temp [:model/Collection collection {}
                   :model/Card card {:collection_id (:id collection)}]
      (let [regular-user-id (mt/user->id :rasta)
            result (permission-debug.impl/debug-permissions
                    {:user-id regular-user-id
                     :model-id (:id card)
                     :action-type :card/read})]
        (is (= "allow" (:decision result)))
        (is (= #{} (:segment result)))
        (is (= [(tru "User has permission to read this card")] (:message result)))
        (is (= {} (:suggestions result)))))))

(deftest debug-permissions-card-read-without-permission-test
  (testing "debug-permissions for :card/read when user does not have permission to read the card"
    (mt/with-temp [:model/Collection collection {}
                   :model/Card card {:collection_id (:id collection)}]
      (let [regular-user-id (mt/user->id :rasta)]
        (with-temp-revoke-collection-perms! (perms/all-users-group) collection
          (let [result (permission-debug.impl/debug-permissions
                        {:user-id regular-user-id
                         :model-id (:id card)
                         :action-type :card/read})]
            (is (= "denied" (:decision result)))
            (is (= #{} (:segment result)))
            (is (= [(tru "User does not have permission to read this card")] (:message result)))
            (is (= {} (:suggestions result)))))))))

(deftest debug-permissions-card-read-admin-test
  (testing "debug-permissions for :card/read when user is admin"
    (mt/with-temp [:model/Collection collection {}
                   :model/Card card {:collection_id (:id collection)}]
      (let [admin-user-id (mt/user->id :crowberto)
            result (permission-debug.impl/debug-permissions
                    {:user-id admin-user-id
                     :model-id (:id card)
                     :action-type :card/read})]
        (is (= "allow" (:decision result)))))))

(deftest debug-permissions-card-query-with-permission-test
  (testing "debug-permissions for :card/query when user has permission to read the card and query all tables"
    (mt/with-temp [:model/Collection collection {}
                   :model/Card card {:collection_id (:id collection)
                                     :dataset_query (mt/mbql-query checkins {:filter [:> $date "2014-01-01"]})}]
      (let [regular-user-id (mt/user->id :rasta)]
        (perms/set-table-permission! (perms/all-users-group) (mt/id :checkins) :perms/view-data :unrestricted)
        (let [result (permission-debug.impl/debug-permissions
                      {:user-id regular-user-id
                       :model-id (:id card)
                       :action-type :card/query})]
          (is (= "allow" (:decision result)))
          (is (= #{} (:segment result)))
          (is (= [(tru "User has permission to read this card")
                  (tru "User has permission to query this card")]
                 (:message result)))
          (is (= {} (:suggestions result))))))))

(deftest debug-permissions-card-query-without-card-permission-test
  (testing "debug-permissions for :card/query when user does not have permission to read the card"
    (mt/with-temp [:model/Collection collection {}
                   :model/Card card {:collection_id (:id collection)
                                     :dataset_query (mt/mbql-query checkins {:filter [:> $date "2014-01-01"]})}]
      (let [regular-user-id (mt/user->id :rasta)]
        (with-temp-revoke-collection-perms! (perms/all-users-group) collection
          (perms/set-table-permission! (perms/all-users-group) (mt/id :checkins) :perms/view-data :unrestricted)
          (let [result (permission-debug.impl/debug-permissions
                        {:user-id regular-user-id
                         :model-id (:id card)
                         :action-type :card/query})]
            (is (= "denied" (:decision result)))
            (is (= #{} (:segment result)))
            (is (= [(tru "User does not have permission to read this card")] (:message result)))
            (is (= {} (:suggestions result)))))))))

(deftest debug-permissions-card-query-with-blocked-tables-test
  (testing "debug-permissions for :card/query when user has permission to read the card but tables are blocked"
    (mt/with-temp [:model/Collection collection {}
                   :model/Card card {:collection_id (:id collection)
                                     :dataset_query (mt/mbql-query checkins {:filter [:> $date "2014-01-01"]})}]
      (let [regular-user-id (mt/user->id :rasta)]
        (perms/set-table-permission! (perms/all-users-group) (mt/id :checkins) :perms/view-data :blocked)
        (let [result (permission-debug.impl/debug-permissions
                      {:user-id regular-user-id
                       :model-id (:id card)
                       :action-type :card/query})]
          (is (= "denied" (:decision result)))
          (is (= #{} (:segment result)))
          (is (= #{(tru "User does not have permission to query this card")}
                 (into #{} (:message result))))
          (is (= {:blocked-tables {"test-data (h2).PUBLIC.CHECKINS" #{"All Users"}}} (:data result)))
          (is (= {} (:suggestions result))))))))

(deftest debug-permissions-card-query-mixed-permissions-test
  (testing "debug-permissions for :card/query when one group grants permissions and another blocks them"
    (mt/with-temp [:model/Collection collection {}
                   :model/Card card {:collection_id (:id collection)
                                     :dataset_query (mt/mbql-query checkins {:filter [:> $date "2014-01-01"]})}]
      (let [regular-user-id (mt/user->id :rasta)]
        (mt/with-temp [:model/PermissionsGroup {pg-id :id} {}
                       :model/PermissionsGroupMembership _ {:group_id pg-id :user_id regular-user-id}]
          (perms/set-table-permission! pg-id (mt/id :checkins) :perms/view-data :unrestricted)
          (perms/set-table-permission! (perms/all-users-group) (mt/id :checkins) :perms/view-data :blocked)
          (let [result (permission-debug.impl/debug-permissions
                        {:user-id regular-user-id
                         :model-id (:id card)
                         :action-type :card/query})]
            (is (= "allow" (:decision result)))
            (is (= #{} (:segment result)))
            (is (= [(tru "User has permission to read this card")
                    (tru "User has permission to query this card")]
                   (:message result)))
            (is (= {} (:suggestions result)))))))))

(deftest debug-permissions-card-query-admin-test
  (testing "debug-permissions for :card/query when user is admin"
    (mt/with-temp [:model/Collection collection {}
                   :model/Card card {:collection_id (:id collection)
                                     :dataset_query (mt/mbql-query checkins {:filter [:> $date "2014-01-01"]})}]
      (let [admin-user-id (mt/user->id :crowberto)
            result (permission-debug.impl/debug-permissions
                    {:user-id admin-user-id
                     :model-id (:id card)
                     :action-type :card/query})]
        (is (= "allow" (:decision result)))))))

(deftest debug-permissions-card-query-native-query-test
  (testing "debug-permissions for :card/query when user has permission to read the card with native query"
    (mt/with-temp [:model/Collection collection {}
                   :model/Card card {:collection_id (:id collection)
                                     :dataset_query {:database (mt/id)
                                                     :type :native
                                                     :native {:query "SELECT * FROM checkins WHERE date > '2014-01-01'"}}}]
      (let [regular-user-id (mt/user->id :rasta)]
        (perms/set-database-permission! (perms/all-users-group) (mt/id) :perms/view-data :unrestricted)
        (let [result (permission-debug.impl/debug-permissions
                      {:user-id regular-user-id
                       :model-id (:id card)
                       :action-type :card/query})]
          (is (= "allow" (:decision result)))
          (is (= #{} (:segment result)))
          (is (= [(tru "User has permission to read this card")
                  (tru "User has permission to query this card")]
                 (:message result)))
          (is (= {} (:data result)))
          (is (= {} (:suggestions result))))))))

(deftest debug-permissions-card-query-native-query-allowed-test
  (testing "debug-permissions for :card/query when user has permission to read the card with native query"
    (mt/with-temp [:model/Collection collection {}
                   :model/Card card {:collection_id (:id collection)
                                     :dataset_query (mt/native-query {:query "SELECT * FROM checkins WHERE date > '2014-01-01'"})}]
      (let [regular-user-id (mt/user->id :rasta)]
        (perms/set-database-permission! (perms/all-users-group) (mt/id) :perms/view-data :unrestricted)
        (let [result (permission-debug.impl/debug-permissions
                      {:user-id regular-user-id
                       :model-id (:id card)
                       :action-type :card/query})]
          (is (= "allow" (:decision result)))
          (is (= #{} (:segment result)))
          (is (= [(tru "User has permission to read this card")
                  (tru "User has permission to query this card")]
                 (:message result)))
          (is (= {} (:data result)))
          (is (= {} (:suggestions result))))))))

(deftest debug-permissions-card-query-native-query-blocked-table-test
  (testing "debug-permissions for :card/query when user does not have permission to read one table in the database"
    (mt/with-temp [:model/Collection collection {}
                   :model/Card card {:collection_id (:id collection)
                                     :dataset_query (mt/native-query {:query "SELECT * FROM checkins WHERE date > '2014-01-01'"})}]
      (let [regular-user-id (mt/user->id :rasta)]
        (perms/set-database-permission! (perms/all-users-group) (mt/id) :perms/view-data :unrestricted)
        (perms/set-table-permission! (perms/all-users-group) (mt/id :venues) :perms/view-data :blocked)
        (let [result (permission-debug.impl/debug-permissions
                      {:user-id regular-user-id
                       :model-id (:id card)
                       :action-type :card/query})]
          (is (= "denied" (:decision result)))
          (is (= #{} (:segment result)))
          (is (= [(tru "User does not have permission to query this card")]
                 (:message result)))
          (is (= {:blocked-tables {"test-data (h2).PUBLIC.VENUES" #{"All Users"}}}
                 (:data result)))
          (is (= {} (:suggestions result))))))))

(deftest debug-permissions-card-query-native-query-blocked-test
  (testing "debug-permissions for :card/query when user has permission to read the card with native query"
    (mt/with-temp [:model/Collection collection {}
                   :model/Card card {:collection_id (:id collection)
                                     :dataset_query (mt/native-query {:query "SELECT * FROM checkins WHERE date > '2014-01-01'"})}]
      (let [regular-user-id (mt/user->id :rasta)]
        (perms/set-database-permission! (perms/all-users-group) (mt/id) :perms/view-data :blocked)
        (let [result (permission-debug.impl/debug-permissions
                      {:user-id regular-user-id
                       :model-id (:id card)
                       :action-type :card/query})]
          (is (= "denied" (:decision result)))
          (is (= #{} (:segment result)))
          (is (= [(tru "User does not have permission to query this card")]
                 (:message result)))
          (is (= {:blocked-tables {"test-data (h2).PUBLIC.CATEGORIES" #{"All Users"}
                                   "test-data (h2).PUBLIC.CHECKINS" #{"All Users"}
                                   "test-data (h2).PUBLIC.ORDERS" #{"All Users"}
                                   "test-data (h2).PUBLIC.PEOPLE" #{"All Users"}
                                   "test-data (h2).PUBLIC.PRODUCTS" #{"All Users"}
                                   "test-data (h2).PUBLIC.REVIEWS" #{"All Users"}
                                   "test-data (h2).PUBLIC.USERS" #{"All Users"}
                                   "test-data (h2).PUBLIC.VENUES" #{"All Users"}}}
                 (:data result)))
          (is (= {} (:suggestions result))))))))

(deftest debug-permissions-card-query-with-joined-card-blocked-test
  (testing "debug-permissions for :card/query when card joins data from another card with blocked source table"
    (mt/with-temp [:model/Collection collection {}
                   :model/Card source-card {:collection_id (:id collection)
                                            :dataset_query (mt/mbql-query venues {:fields [$id $name]})}
                   :model/Card joined-card {:collection_id (:id collection)
                                            :dataset_query {:database (mt/id)
                                                            :type :query
                                                            :query {:source-table (str "card__" (:id source-card))
                                                                    :joins [{:fields :all
                                                                             :source-table (mt/id :checkins)
                                                                             :condition [:=
                                                                                         [:field (mt/id :venues :id) nil]
                                                                                         [:field (mt/id :checkins :venue_id) {:join-alias "CHECKINS"}]]
                                                                             :alias "CHECKINS"}]}}}]
      (let [regular-user-id (mt/user->id :rasta)]
        ;; Grant access to venues table but block checkins table
        (perms/set-table-permission! (perms/all-users-group) (mt/id :venues) :perms/view-data :unrestricted)
        (perms/set-table-permission! (perms/all-users-group) (mt/id :checkins) :perms/view-data :blocked)
        (let [result (permission-debug.impl/debug-permissions
                      {:user-id regular-user-id
                       :model-id (:id joined-card)
                       :action-type :card/query})]
          (is (= "denied" (:decision result)))
          (is (= #{} (:segment result)))
          (is (= #{(tru "User does not have permission to query this card")}
                 (into #{} (:message result))))
          (is (= {:blocked-tables {"test-data (h2).PUBLIC.CHECKINS" #{"All Users"}}} (:data result)))
          (is (= {} (:suggestions result))))))))

(deftest debug-permissions-card-download-results-with-permission-test
  (testing "debug-permissions for :card/download-data when user has permission to read the card and download data"
    (mt/with-temp [:model/Collection collection {}
                   :model/Card card {:collection_id (:id collection)
                                     :dataset_query (mt/mbql-query checkins {:filter [:> $date "2014-01-01"]})}]
      (let [regular-user-id (mt/user->id :rasta)]
        (perms/set-table-permission! (perms/all-users-group) (mt/id :checkins) :perms/download-results :one-million-rows)
        (let [result (permission-debug.impl/debug-permissions
                      {:user-id regular-user-id
                       :model-id (:id card)
                       :action-type :card/download-data})]
          (is (= "allow" (:decision result)))
          (is (= #{} (:segment result)))
          (is (= [(tru "User has permission to read this card")
                  (tru "User has permission to query this card")
                  (tru "User has permission to download data from this card")] (:message result)))
          (is (= {} (:data result)))
          (is (= {} (:suggestions result))))))))

(deftest debug-permissions-card-download-results-without-card-permission-test
  (testing "debug-permissions for :card/download-data when user does not have permission to read the card"
    (mt/with-temp [:model/Collection collection {}
                   :model/Card card {:collection_id (:id collection)
                                     :dataset_query (mt/mbql-query checkins {:filter [:> $date "2014-01-01"]})}]
      (let [regular-user-id (mt/user->id :rasta)]
        (with-temp-revoke-collection-perms! (perms/all-users-group) collection
          (perms/set-table-permission! (perms/all-users-group) (mt/id :checkins) :perms/download-results :one-million-rows)
          (let [result (permission-debug.impl/debug-permissions
                        {:user-id regular-user-id
                         :model-id (:id card)
                         :action-type :card/download-data})]
            (is (= "denied" (:decision result)))
            (is (= #{} (:segment result)))
            (is (= [(tru "User does not have permission to read this card")] (:message result)))
            (is (= {} (:suggestions result)))))))))

(deftest debug-permissions-card-download-results-blocked-download-test
  (testing "debug-permissions for :card/download-data when user has permission to read the card but download is blocked"
    (mt/with-temp [:model/Collection collection {}
                   :model/Card card {:collection_id (:id collection)
                                     :dataset_query (mt/mbql-query checkins {:filter [:> $date "2014-01-01"]})}]
      (let [regular-user-id (mt/user->id :rasta)]
        (perms/set-table-permission! (perms/all-users-group) (mt/id :checkins) :perms/view-data :unrestricted)
        (perms/set-table-permission! (perms/all-users-group) (mt/id :checkins) :perms/download-results :no)
        (let [result (permission-debug.impl/debug-permissions
                      {:user-id regular-user-id
                       :model-id (:id card)
                       :action-type :card/download-data})]
          (is (= "denied" (:decision result)))
          (is (= #{} (:segment result)))
          (is (= [(tru "User does not have permission to download data from this card")] (:message result)))
          (is (= {:download-no-tables {"test-data (h2).PUBLIC.CHECKINS" #{"All Users"}}} (:data result)))
          (is (= {} (:suggestions result))))))))

(deftest debug-permissions-card-download-results-mixed-permissions-test
  (testing "debug-permissions for :card/download-data when one group grants download permissions and another blocks them"
    (mt/with-temp [:model/Collection collection {}
                   :model/Card card {:collection_id (:id collection)
                                     :dataset_query (mt/mbql-query checkins {:filter [:> $date "2014-01-01"]})}]
      (let [regular-user-id (mt/user->id :rasta)]
        (mt/with-temp [:model/PermissionsGroup {pg-id :id} {}
                       :model/PermissionsGroupMembership _ {:group_id pg-id :user_id regular-user-id}]
          (perms/set-table-permission! (perms/all-users-group) (mt/id :checkins) :perms/view-data :unrestricted)
          (perms/set-table-permission! pg-id (mt/id :checkins) :perms/download-results :one-million-rows)
          (perms/set-table-permission! (perms/all-users-group) (mt/id :checkins) :perms/download-results :no)
          (let [result (permission-debug.impl/debug-permissions
                        {:user-id regular-user-id
                         :model-id (:id card)
                         :action-type :card/download-data})]
            (is (= "allow" (:decision result)))
            (is (= #{} (:segment result)))
            (is (= [(tru "User has permission to read this card")
                    (tru "User has permission to query this card")
                    (tru "User has permission to download data from this card")]
                   (:message result)))
            (is (= {}
                   (:data result)))
            (is (= {} (:suggestions result)))))))))

(deftest debug-permissions-card-download-results-admin-test
  (testing "debug-permissions for :card/download-data when user is admin"
    (mt/with-temp [:model/Collection collection {}
                   :model/Card card {:collection_id (:id collection)
                                     :dataset_query (mt/mbql-query checkins {:filter [:> $date "2014-01-01"]})}]
      (let [admin-user-id (mt/user->id :crowberto)
            result (permission-debug.impl/debug-permissions
                    {:user-id admin-user-id
                     :model-id (:id card)
                     :action-type :card/download-data})]
        (is (= "allow" (:decision result)))))))

(deftest debug-permissions-card-download-results-ten-thousand-rows-test
  (testing "debug-permissions for :card/download-data when user has permission to read the card and download up to ten thousand rows"
    (mt/with-temp [:model/Collection collection {}
                   :model/Card card {:collection_id (:id collection)
                                     :dataset_query (mt/mbql-query checkins {:filter [:> $date "2014-01-01"]})}]
      (let [regular-user-id (mt/user->id :rasta)]
        (perms/set-table-permission! (perms/all-users-group) (mt/id :checkins) :perms/view-data :unrestricted)
        (perms/set-table-permission! (perms/all-users-group) (mt/id :checkins) :perms/download-results :ten-thousand-rows)
        (let [result (permission-debug.impl/debug-permissions
                      {:user-id regular-user-id
                       :model-id (:id card)
                       :action-type :card/download-data})]
          (is (= "limited" (:decision result)))
          (is (= #{} (:segment result)))
          (is (= [(tru "User has permission to download some data from this card")] (:message result)))
          (is (= {:download-limited-tables {"test-data (h2).PUBLIC.CHECKINS" #{"All Users"}}}
                 (:data result)))
          (is (= {} (:suggestions result))))))))

(deftest debug-permissions-card-download-results-mixed-limited-permissions-test
  (testing "debug-permissions for :card/download-data when one group grants download permissions and another blocks them"
    (mt/with-temp [:model/Collection collection {}
                   :model/Card card {:collection_id (:id collection)
                                     :dataset_query (mt/mbql-query checkins {:filter [:> $date "2014-01-01"]})}]
      (let [regular-user-id (mt/user->id :rasta)]
        (mt/with-temp [:model/PermissionsGroup {pg-id :id} {:name "test other group"}
                       :model/PermissionsGroupMembership _ {:group_id pg-id :user_id regular-user-id}]
          (perms/set-table-permission! (perms/all-users-group) (mt/id :checkins) :perms/view-data :unrestricted)
          (perms/set-table-permission! pg-id (mt/id :checkins) :perms/download-results :ten-thousand-rows)
          (perms/set-table-permission! (perms/all-users-group) (mt/id :checkins) :perms/download-results :no)
          (let [result (permission-debug.impl/debug-permissions
                        {:user-id regular-user-id
                         :model-id (:id card)
                         :action-type :card/download-data})]
            (is (= "limited" (:decision result)))
            (is (= #{} (:segment result)))
            (is (= [(tru "User has permission to download some data from this card")]
                   (:message result)))
            (is (= {:download-limited-tables {"test-data (h2).PUBLIC.CHECKINS" #{"test other group"}}}
                   (:data result)))
            (is (= {} (:suggestions result)))))))))

(deftest debug-permissions-dashboard-read-test
  (mt/with-temp [:model/Collection collection {}
                 :model/Dashboard dashboard {:collection_id (:id collection)}]
    (let [check #(permission-debug.impl/debug-permissions
                  {:user-id (mt/user->id :rasta) :model-id (:id dashboard) :action-type :dashboard/read})]
      (testing "a dashboard opens when its collection does"
        (is (= {:decision "allow" :model-type "dashboard" :data {}}
               (select-keys (check) [:decision :model-type :data]))))
      (testing "and not when the user's groups can't open the collection"
        (mt/with-non-admin-groups-no-collection-perms collection
          (is (= "denied" (:decision (check)))))))))

(deftest debug-permissions-dashboard-query-test
  (mt/with-temp [:model/Collection collection {}
                 :model/Dashboard dashboard {:collection_id (:id collection)}
                 :model/Card checkins-card {:collection_id (:id collection)
                                            :dataset_query (mt/mbql-query checkins)}
                 :model/Card venues-card {:collection_id (:id collection)
                                          :dataset_query (mt/mbql-query venues)}
                 :model/DashboardCard _ {:dashboard_id (:id dashboard) :card_id (:id checkins-card)}
                 :model/DashboardCard _ {:dashboard_id (:id dashboard) :card_id (:id venues-card)}]
    (let [check #(permission-debug.impl/debug-permissions
                  {:user-id (mt/user->id :rasta) :model-id (:id dashboard) :action-type :dashboard/query})]
      (testing "every card loads"
        (is (= {:decision "allow" :data {:card-count 2 :blocked-card-count 0}}
               (select-keys (check) [:decision :data]))))
      (mt/with-restored-data-perms!
        (perms/set-table-permission! (perms/all-users-group) (mt/id :checkins) :perms/view-data :blocked)
        (testing "one card of two reads a blocked table"
          (is (= {:decision "limited"
                  :data     {:card-count         2
                             :blocked-card-count 1
                             :blocked-tables     {"test-data (h2).PUBLIC.CHECKINS" #{"All Users"}}
                             :blocked-cards      [{:id     (:id checkins-card)
                                                   :name   (:name checkins-card)
                                                   :tables ["CHECKINS"]}]}}
                 (select-keys (check) [:decision :data]))))
        (perms/set-table-permission! (perms/all-users-group) (mt/id :venues) :perms/view-data :blocked)
        (testing "every card reads a blocked table"
          (let [result (check)]
            (is (= "denied" (:decision result)))
            (is (= 2 (get-in result [:data :blocked-card-count])))
            (is (= #{[(:id checkins-card) ["CHECKINS"]] [(:id venues-card) ["VENUES"]]}
                   (set (map (juxt :id :tables) (get-in result [:data :blocked-cards])))))))))))

(deftest debug-permissions-collection-read-test
  (mt/with-temp [:model/Collection collection {}]
    (let [check #(permission-debug.impl/debug-permissions
                  {:user-id (mt/user->id :rasta) :model-id (:id collection) :action-type :collection/read})]
      (testing "a collection the user's groups can open"
        (is (= {:decision "allow" :model-type "collection"}
               (select-keys (check) [:decision :model-type]))))
      (testing "a collection none of them can"
        (mt/with-non-admin-groups-no-collection-perms collection
          (is (= "denied" (:decision (check)))))))))

;; a guard: Explain access calls this as the admin, about the previewed user
(deftest debug-permissions-read-checks-the-user-not-the-admin-caller-test
  (testing "an admin asking about a user gets the user's answer, not the admin's own"
    (mt/with-temp [:model/Collection collection {}
                   :model/Dashboard dashboard {:collection_id (:id collection)}]
      (mt/with-non-admin-groups-no-collection-perms collection
        (mt/with-current-user (mt/user->id :crowberto)
          (doseq [[action-type model-id] [[:dashboard/read (:id dashboard)]
                                          [:collection/read (:id collection)]]]
            (testing action-type
              (is (= "denied"
                     (:decision (permission-debug.impl/debug-permissions
                                 {:user-id (mt/user->id :rasta) :model-id model-id :action-type action-type})))))))))))

(defn- venues-category-remapping
  []
  {"cat" [:dimension [:field (mt/id :venues :category_id) nil]]})

(defn- do-with-second-venues-sandbox!
  "Inside `met/with-gtaps!`, whose group sandboxes Venues for rasta: a second group of rasta with its own sandbox on
  Venues, so two sandboxes apply to the table."
  [f]
  (mt/with-temp [:model/PermissionsGroup           {other-group-id :id} {}
                 :model/PermissionsGroupMembership _ {:group_id other-group-id :user_id (mt/user->id :rasta)}
                 :model/Sandbox                    _ {:group_id             other-group-id
                                                      :table_id             (mt/id :venues)
                                                      :attribute_remappings (venues-category-remapping)}]
    ;; only Venues, or Can view on the other tables would lift the sandboxes on them
    (perms/set-table-permission! other-group-id (mt/id :venues) :perms/view-data :unrestricted)
    (f)))

(defn- query-check
  "The check Explain access asks for, as the admin about rasta, with the attribute values picked in the preview."
  ([model-id action-type]
   (query-check model-id action-type nil))
  ([model-id action-type attribute-overrides]
   (mt/with-current-user (mt/user->id :crowberto)
     (permission-debug.impl/debug-permissions
      (cond-> {:user-id (mt/user->id :rasta) :model-id model-id :action-type action-type}
        attribute-overrides (assoc :attribute-overrides attribute-overrides))))))

(deftest debug-permissions-card-query-two-sandboxes-on-a-table-test
  (met/with-gtaps! {:gtaps      {:venues {:remappings (venues-category-remapping)}}
                    :attributes {"cat" 50}}
    (mt/with-temp [:model/Collection collection {}
                   :model/Card card {:collection_id (:id collection)
                                     :dataset_query (mt/mbql-query venues)}]
      (testing "one group's row and column security on a table still loads"
        (is (= {:decision "allow" :data {}}
               (select-keys (query-check (:id card) :card/query) [:decision :data]))))
      (do-with-second-venues-sandbox!
       (fn []
         (testing "two groups' row and column security on a table the card reads fail it"
           (is (= {:decision "denied" :data {:conflicting-tables [(mt/id :venues)]}}
                  (select-keys (query-check (:id card) :card/query) [:decision :data]))))
         (testing "another group's Can view lifts both, so nothing conflicts"
           (mt/with-temp [:model/PermissionsGroup           {lifting-group-id :id} {}
                          :model/PermissionsGroupMembership _ {:group_id lifting-group-id :user_id (mt/user->id :rasta)}]
             (perms/set-database-permission! lifting-group-id (mt/id) :perms/view-data :unrestricted)
             (is (= {:decision "allow" :data {}}
                    (select-keys (query-check (:id card) :card/query) [:decision :data]))))))))))

(deftest debug-permissions-card-query-two-sandboxes-reached-through-a-filter-test
  (met/with-gtaps! {:gtaps      {:venues   {:remappings (venues-category-remapping)}
                                 ;; Checkins filters by its venue's category, so it reads Venues too
                                 :checkins {:remappings {"cat" [:dimension [:field (mt/id :venues :category_id)
                                                                            {:source-field (mt/id :checkins :venue_id)}]]}}}
                    :attributes {"cat" 50}}
    (mt/with-temp [:model/Collection collection {}
                   :model/Card card {:collection_id (:id collection)
                                     :dataset_query (mt/mbql-query checkins {:limit 1})}]
      (do-with-second-venues-sandbox!
       (fn []
         (testing "a card that reads only Checkins fails on the table its policy filters through"
           (is (= {:decision "denied" :data {:conflicting-tables [(mt/id :venues)]}}
                  (select-keys (query-check (:id card) :card/query) [:decision :data]))))
         (testing "as the query processor does when the card runs"
           (is (re-find #"Found more than one group table access policy"
                        (str (mt/user-http-request :rasta :post 400 "dataset" (mt/mbql-query checkins {:limit 1})))))))))))

(deftest debug-permissions-dashboard-query-two-sandboxes-on-a-table-test
  (met/with-gtaps! {:gtaps      {:venues {:remappings (venues-category-remapping)}}
                    :attributes {"cat" 50}}
    (mt/with-temp [:model/Collection collection {}
                   :model/Dashboard dashboard {:collection_id (:id collection)}
                   :model/Card venues-card {:collection_id (:id collection)
                                            :dataset_query (mt/mbql-query venues)}
                   :model/Card users-card {:collection_id (:id collection)
                                           :dataset_query (mt/mbql-query users)}
                   :model/DashboardCard _ {:dashboard_id (:id dashboard) :card_id (:id venues-card)}
                   :model/DashboardCard _ {:dashboard_id (:id dashboard) :card_id (:id users-card)}]
      (do-with-second-venues-sandbox!
       (fn []
         (testing "the card that reads the conflicting table can't load, the other loads"
           (is (= {:decision "limited"
                   :data     {:card-count         2
                              :blocked-card-count 1
                              :conflicting-tables [(mt/id :venues)]
                              :blocked-cards      [{:id                 (:id venues-card)
                                                    :name               (:name venues-card)
                                                    :tables             []
                                                    :conflicting-tables [(mt/id :venues)]}]}}
                  (select-keys (query-check (:id dashboard) :dashboard/query) [:decision :data])))))))))

(deftest debug-permissions-card-query-sandbox-attribute-missing-test
  (met/with-gtaps! {:gtaps {:venues {:remappings (venues-category-remapping)}}}
    (mt/with-temp [:model/Collection collection {}
                   :model/Card card {:collection_id (:id collection)
                                     :dataset_query (mt/mbql-query venues)}]
      (testing "a user without the attribute a row and column security rule reads can't load the card"
        (is (= {:decision "denied"
                :data     {:missing-attributes [{:attribute "cat" :table-id (mt/id :venues) :group-id (:id &group)}]}}
               (select-keys (query-check (:id card) :card/query) [:decision :data])))
        (testing "as the query processor does when the card runs"
          (is (re-find #"Query requires user attribute `cat`"
                       (str (mt/user-http-request :rasta :post 400 "dataset" (mt/mbql-query venues)))))))
      (testing "a value picked in the preview makes it load"
        (is (= {:decision "allow" :data {}}
               (select-keys (query-check (:id card) :card/query {"cat" "50"}) [:decision :data]))))
      (testing "an empty value picked in the preview takes the attribute away again"
        (met/with-user-attributes! :rasta {"cat" 50}
          (is (= {:decision "allow" :data {}}
                 (select-keys (query-check (:id card) :card/query) [:decision :data])))
          (is (= "denied"
                 (:decision (query-check (:id card) :card/query {"cat" ""})))))))))

(deftest debug-permissions-card-query-sandbox-attribute-missing-reached-through-a-filter-test
  (met/with-gtaps! {:gtaps {:venues   {:remappings (venues-category-remapping)}
                            ;; Checkins filters by its venue's category, so it reads Venues too
                            :checkins {:remappings {"cat" [:dimension [:field (mt/id :venues :category_id)
                                                                       {:source-field (mt/id :checkins :venue_id)}]]}}}}
    (mt/with-temp [:model/Collection collection {}
                   :model/Card card {:collection_id (:id collection)
                                     :dataset_query (mt/mbql-query checkins {:limit 1})}]
      (testing "a card that reads only Checkins also needs what the policy on Venues reads"
        (is (= #{{:attribute "cat" :table-id (mt/id :venues)   :group-id (:id &group)}
                 {:attribute "cat" :table-id (mt/id :checkins) :group-id (:id &group)}}
               (set (:missing-attributes (:data (query-check (:id card) :card/query))))))))))

(deftest debug-permissions-card-query-sandbox-attribute-missing-and-two-sandboxes-test
  (met/with-gtaps! {:gtaps {:venues {:remappings (venues-category-remapping)}}}
    (mt/with-temp [:model/Collection collection {}
                   :model/Card card {:collection_id (:id collection)
                                     :dataset_query (mt/mbql-query venues)}]
      (do-with-second-venues-sandbox!
       (fn []
         (testing "the conflict and the missing attribute are both reported, each group's rule once"
           (let [{:keys [decision data]} (query-check (:id card) :card/query)]
             (is (= "denied" decision))
             (is (= [(mt/id :venues)] (:conflicting-tables data)))
             (is (= [["cat" (mt/id :venues)] ["cat" (mt/id :venues)]]
                    (map (juxt :attribute :table-id) (:missing-attributes data))))
             (is (= 2 (count (set (map :group-id (:missing-attributes data))))))))
         (testing "once a value is picked, only the conflict is left"
           (is (= {:decision "denied" :data {:conflicting-tables [(mt/id :venues)]}}
                  (select-keys (query-check (:id card) :card/query {"cat" "50"}) [:decision :data])))))))))

(deftest debug-permissions-dashboard-query-sandbox-attribute-missing-test
  (met/with-gtaps! {:gtaps {:venues {:remappings (venues-category-remapping)}}}
    (mt/with-temp [:model/Collection collection {}
                   :model/Dashboard dashboard {:collection_id (:id collection)}
                   :model/Card venues-card {:collection_id (:id collection)
                                            :dataset_query (mt/mbql-query venues)}
                   :model/Card users-card {:collection_id (:id collection)
                                           :dataset_query (mt/mbql-query users)}
                   :model/DashboardCard _ {:dashboard_id (:id dashboard) :card_id (:id venues-card)}
                   :model/DashboardCard _ {:dashboard_id (:id dashboard) :card_id (:id users-card)}]
      (let [missing [{:attribute "cat" :table-id (mt/id :venues) :group-id (:id &group)}]]
        (testing "the card that reads the table can't load, the other loads"
          (is (= {:decision "limited"
                  :data     {:card-count         2
                             :blocked-card-count 1
                             :missing-attributes missing
                             :blocked-cards      [{:id                 (:id venues-card)
                                                   :name               (:name venues-card)
                                                   :tables             []
                                                   :missing-attributes missing}]}}
                 (select-keys (query-check (:id dashboard) :dashboard/query) [:decision :data]))))
        (testing "a value picked in the preview makes both load"
          (is (= {:decision "allow" :data {:card-count 2 :blocked-card-count 0}}
                 (select-keys (query-check (:id dashboard) :dashboard/query {"cat" "50"}) [:decision :data]))))))))

(defn- do-with-impersonation!
  "Calls `f` with the id of a new group of rasta that has Can view on the test database and a connection impersonation
  policy reading the `attribute` user attribute. Run it inside `met/with-gtaps!` to give rasta a sandbox too, which
  already removes Can view from All Users."
  [attribute f]
  (mt/with-temp [:model/PermissionsGroup           {group-id :id} {}
                 :model/PermissionsGroupMembership _ {:group_id group-id :user_id (mt/user->id :rasta)}
                 :model/ConnectionImpersonation    _ {:group_id group-id :db_id (mt/id) :attribute attribute}]
    (perms/set-database-permission! group-id (mt/id) :perms/view-data :unrestricted)
    (f group-id)))

(deftest debug-permissions-card-query-sandbox-and-impersonation-test
  (met/with-gtaps! {:gtaps      {:venues {:remappings (venues-category-remapping)}}
                    :attributes {"cat" 50 "role" "reader"}}
    (mt/with-temp [:model/Collection collection {}
                   :model/Card card {:collection_id (:id collection)
                                     :dataset_query (mt/mbql-query venues)}]
      (testing "row and column security alone still loads"
        (is (= {:decision "allow" :data {}}
               (select-keys (query-check (:id card) :card/query) [:decision :data]))))
      (do-with-impersonation!
       "role"
       (fn [impersonation-group-id]
         (testing "row and column security and impersonation on one database fail the card, naming both groups"
           (is (= {:decision "denied"
                   :data     {:conflicting-databases [{:database-id             (mt/id)
                                                       :sandbox-group-ids       [(:id &group)]
                                                       :impersonation-group-ids [impersonation-group-id]}]}}
                  (select-keys (query-check (:id card) :card/query) [:decision :data])))))))))

(deftest debug-permissions-dashboard-query-sandbox-and-impersonation-test
  (met/with-gtaps! {:gtaps      {:venues {:remappings (venues-category-remapping)}}
                    :attributes {"cat" 50 "role" "reader"}}
    (mt/with-temp [:model/Collection collection {}
                   :model/Dashboard dashboard {:collection_id (:id collection)}
                   :model/Card card {:collection_id (:id collection)
                                     :dataset_query (mt/mbql-query users)}
                   :model/DashboardCard _ {:dashboard_id (:id dashboard) :card_id (:id card)}]
      (do-with-impersonation!
       "role"
       (fn [impersonation-group-id]
         (let [conflicting [{:database-id             (mt/id)
                             :sandbox-group-ids       [(:id &group)]
                             :impersonation-group-ids [impersonation-group-id]}]]
           (testing "a card on the database fails even when it reads no table with a rule"
             (is (= {:decision "denied"
                     :data     {:card-count            1
                                :blocked-card-count    1
                                :conflicting-databases conflicting
                                :blocked-cards         [{:id                    (:id card)
                                                         :name                  (:name card)
                                                         :tables                []
                                                         :conflicting-databases conflicting}]}}
                    (select-keys (query-check (:id dashboard) :dashboard/query) [:decision :data]))))))))))

(deftest debug-permissions-card-query-impersonation-attribute-missing-test
  (mt/with-no-data-perms-for-all-users!
    (mt/with-temp [:model/Collection collection {}
                   :model/Card card {:collection_id (:id collection)
                                     :dataset_query (mt/mbql-query venues)}]
      (do-with-impersonation!
       "role"
       (fn [impersonation-group-id]
         (testing "a person with the attribute impersonation reads loads as before"
           (met/with-user-attributes! :rasta {"role" "reader"}
             (is (= {:decision "allow" :data {}}
                    (select-keys (query-check (:id card) :card/query) [:decision :data])))))
         (testing "a person without it can't load the card, and the policy's group is named"
           (is (= {:decision "denied"
                   :data     {:missing-database-attributes [{:attribute   "role"
                                                             :database-id (mt/id)
                                                             :kind        "impersonation"
                                                             :group-id    impersonation-group-id}]}}
                  (select-keys (query-check (:id card) :card/query) [:decision :data]))))
         (testing "a value picked in the preview makes it load"
           (is (= {:decision "allow" :data {}}
                  (select-keys (query-check (:id card) :card/query {"role" "reader"}) [:decision :data]))))
         (testing "another group's Can view on the database lifts the impersonation, so it needs no attribute"
           (mt/with-temp [:model/PermissionsGroup           {lifting-group-id :id} {}
                          :model/PermissionsGroupMembership _ {:group_id lifting-group-id :user_id (mt/user->id :rasta)}]
             (perms/set-database-permission! lifting-group-id (mt/id) :perms/view-data :unrestricted)
             (is (= {:decision "allow" :data {}}
                    (select-keys (query-check (:id card) :card/query) [:decision :data]))))))))))

(deftest debug-permissions-card-query-routing-attribute-missing-test
  (mt/with-temp [:model/Collection collection {}
                 :model/Card card {:collection_id (:id collection)
                                   :dataset_query (mt/mbql-query venues)}
                 :model/DatabaseRouter _ {:database_id (mt/id) :user_attribute "tenant"}]
    (testing "a person without the attribute the database routes on can't load the card"
      (is (= {:decision "denied"
              :data     {:missing-database-attributes [{:attribute "tenant" :database-id (mt/id) :kind "routing"}]}}
             (select-keys (query-check (:id card) :card/query) [:decision :data]))))
    (testing "a value picked in the preview makes it load"
      (is (= {:decision "allow" :data {}}
             (select-keys (query-check (:id card) :card/query {"tenant" "acme"}) [:decision :data]))))
    (testing "an admin with no value queries the router database, so isn't reported"
      (mt/with-current-user (mt/user->id :crowberto)
        (is (= {:decision "allow" :data {}}
               (select-keys (permission-debug.impl/debug-permissions
                             {:user-id (mt/user->id :crowberto) :model-id (:id card) :action-type :card/query})
                            [:decision :data])))))))

(deftest debug-permissions-dashboard-query-routing-attribute-missing-test
  (mt/with-temp [:model/Collection collection {}
                 :model/Dashboard dashboard {:collection_id (:id collection)}
                 :model/Card card {:collection_id (:id collection)
                                   :dataset_query (mt/mbql-query venues)}
                 :model/DashboardCard _ {:dashboard_id (:id dashboard) :card_id (:id card)}
                 :model/DatabaseRouter _ {:database_id (mt/id) :user_attribute "tenant"}]
    (let [missing [{:attribute "tenant" :database-id (mt/id) :kind "routing"}]]
      (testing "the card on the router database can't load"
        (is (= {:decision "denied"
                :data     {:card-count                  1
                           :blocked-card-count          1
                           :missing-database-attributes missing
                           :blocked-cards               [{:id                          (:id card)
                                                          :name                        (:name card)
                                                          :tables                      []
                                                          :missing-database-attributes missing}]}}
               (select-keys (query-check (:id dashboard) :dashboard/query) [:decision :data]))))
      (testing "a value picked in the preview makes it load"
        (is (= {:decision "allow" :data {:card-count 1 :blocked-card-count 0}}
               (select-keys (query-check (:id dashboard) :dashboard/query {"tenant" "acme"}) [:decision :data])))))))
