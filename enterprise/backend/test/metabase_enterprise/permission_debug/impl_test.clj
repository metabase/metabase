(ns metabase-enterprise.permission-debug.impl-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.permission-debug.impl :as permission-debug.impl]
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
                     :model-id (str (:id card))
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
                         :model-id (str (:id card))
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
                     :model-id (str (:id card))
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
                       :model-id (str (:id card))
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
                         :model-id (str (:id card))
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
                       :model-id (str (:id card))
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
                         :model-id (str (:id card))
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
                     :model-id (str (:id card))
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
                       :model-id (str (:id card))
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
                       :model-id (str (:id card))
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
                       :model-id (str (:id card))
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
                       :model-id (str (:id card))
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
                       :model-id (str (:id joined-card))
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
                       :model-id (str (:id card))
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
                         :model-id (str (:id card))
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
                       :model-id (str (:id card))
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
                         :model-id (str (:id card))
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
                     :model-id (str (:id card))
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
                       :model-id (str (:id card))
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
                         :model-id (str (:id card))
                         :action-type :card/download-data})]
            (is (= "limited" (:decision result)))
            (is (= #{} (:segment result)))
            (is (= [(tru "User has permission to download some data from this card")]
                   (:message result)))
            (is (= {:download-limited-tables {"test-data (h2).PUBLIC.CHECKINS" #{"test other group"}}}
                   (:data result)))
            (is (= {} (:suggestions result)))))))))
