(ns metabase.permissions.collection-permissions-test
  (:require
   [clojure.test :refer :all]
   [metabase.collections.models.collection :as collection]
   [metabase.permissions.core :as perms]
   [metabase.permissions.test-util :as perms.tu]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(defn- user-info
  "The `::permissions.schema/collection-user-info` of the test user `user`."
  [user]
  {:user-id          (mt/user->id user)
   :is-superuser?    (= user :crowberto)
   :is-data-analyst? (boolean (t2/select-one-fn :is_data_analyst :model/User :id (mt/user->id user)))})

(def ^:private root-namespaces
  [nil :data-actions :snippets :transforms])

(defn- check-against-permission-set
  "Checks `collection-permissions-for-user` against the permission set of the test user `user` on `ids` and on the root
  Collections."
  [user ids]
  (let [user-id     (user-info user)
        perm-set    (perms/user-permissions-set (mt/user->id user))
        expected    (fn [object]
                      (cond
                        (perms/set-has-full-permissions? perm-set (perms/collection-readwrite-path object)) :read-and-write
                        (perms/set-has-full-permissions? perm-set (perms/collection-read-path object))      :read
                        :else                                                                               :none))
        permissions (perms/collection-permissions-for-user user-id (vec ids) {:root-namespace nil})]
    (testing "Collections"
      (is (= (into {} (map (juxt identity expected)) ids)
             permissions)))
    (doseq [root-namespace root-namespaces]
      (testing (str "root of " root-namespace)
        (is (= {nil (expected (assoc collection/root-collection :namespace root-namespace))}
               (perms/collection-permissions-for-user user-id [nil] {:root-namespace root-namespace})))))))

(deftest collection-permissions-match-permission-set-test
  (mt/with-non-admin-groups-no-root-collection-perms
    (let [rasta-id    (mt/user->id :rasta)
          personal-id (:id (collection/user->personal-collection rasta-id))]
      (mt/with-temp [:model/Collection {read-id :id}           {}
                     :model/Collection {write-id :id}          {}
                     :model/Collection {none-id :id}           {}
                     :model/Collection {child-id :id}          {:location (str "/" write-id "/")}
                     :model/Collection {archived-id :id}       {:archived true}
                     :model/Collection {transforms-id :id}     {:namespace "transforms"}
                     :model/Collection {personal-child-id :id} {:location (str "/" personal-id "/")}]
        (perms/grant-collection-read-permissions! (perms/all-users-group) read-id)
        (perms/grant-collection-readwrite-permissions! (perms/all-users-group) write-id)
        (perms/grant-collection-read-permissions! (perms/all-users-group) child-id)
        (perms/grant-collection-readwrite-permissions! (perms/all-users-group) archived-id)
        (let [ids [read-id write-id none-id child-id archived-id transforms-id personal-id personal-child-id
                   (collection/trash-collection-id)]]
          (testing "a user"
            (check-against-permission-set :rasta ids))
          (testing "a data analyst"
            (perms.tu/with-data-analyst-role! rasta-id
              (check-against-permission-set :rasta ids)))
          (testing "a superuser"
            (check-against-permission-set :crowberto ids))
          (testing "with root Collection permissions"
            (perms/grant-collection-readwrite-permissions! (perms/all-users-group) collection/root-collection)
            (mt/with-all-users-permission "/collection/namespace/data-actions/root/read/"
              (check-against-permission-set :rasta ids))))))))

(deftest collection-permissions-answer-every-id-asked-test
  (mt/with-non-admin-groups-no-root-collection-perms
    (mt/with-temp [:model/Collection {read-id :id}  {}
                   :model/Collection {write-id :id} {}
                   :model/Collection {none-id :id}  {}]
      (perms/grant-collection-read-permissions! (perms/all-users-group) read-id)
      (perms/grant-collection-readwrite-permissions! (perms/all-users-group) write-id)
      (let [rasta-id   (user-info :rasta)
            missing-id (inc (:max (t2/select-one [:model/Collection [:%max.id :max]])))]
        (testing "every id asked has an entry, repeated ids and ids of no Collection included"
          (is (= {read-id :read, write-id :read-and-write, none-id :none, missing-id :none, nil :none}
                 (perms/collection-permissions-for-user rasta-id
                                                        [read-id write-id none-id read-id missing-id nil nil]
                                                        {:root-namespace nil}))))
        (testing "no ids"
          (is (= {} (perms/collection-permissions-for-user rasta-id [] {:root-namespace nil}))))
        (testing "no user has nothing"
          (is (= {read-id :none, nil :none}
                 (perms/collection-permissions-for-user {:user-id nil :is-superuser? false :is-data-analyst? false}
                                                        [read-id nil]
                                                        {:root-namespace nil}))))
        (testing "no user in a superuser context has everything"
          (is (= {none-id :read-and-write, nil :read-and-write}
                 (perms/collection-permissions-for-user {:user-id nil :is-superuser? true :is-data-analyst? false}
                                                        [none-id nil]
                                                        {:root-namespace nil}))))))))

(deftest collection-permissions-query-count-test
  (mt/with-non-admin-groups-no-root-collection-perms
    (mt/with-temp [:model/Collection {a :id} {}
                   :model/Collection {b :id} {}
                   :model/Collection {c :id} {}]
      (perms/grant-collection-read-permissions! (perms/all-users-group) a)
      (mt/with-current-user (mt/user->id :rasta)
        (testing "many Collections are answered by one permission query, and two cost as much as three"
          (let [queries (fn [ids]
                          (t2/with-call-count [call-count]
                            (perms/collection-permissions-for-user (user-info :rasta) ids {:root-namespace nil})
                            (call-count)))]
            (is (= (queries [a b]) (queries [a b c])))
            (testing "the root costs one more"
              (is (= (inc (queries [a b])) (queries [a b nil]))))))))))

(deftest some-collection-permission-for-user-test
  (mt/with-non-admin-groups-no-root-collection-perms
    (testing "a user always writes their personal Collection"
      (is (= :read-and-write (perms/some-collection-permission-for-user (user-info :rasta)))))
    (testing "a superuser writes"
      (is (= :read-and-write (perms/some-collection-permission-for-user (user-info :crowberto)))))))
