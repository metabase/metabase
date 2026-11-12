(ns metabase.permissions.collection-permissions-test
  (:require
   [clojure.set :as set]
   [clojure.test :refer :all]
   [metabase.api.common :as api]
   [metabase.collections.models.collection :as collection]
   [metabase.permissions.core :as perms]
   [metabase.permissions.test-util :as perms.tu]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(def ^:private level->permission
  {:read :read, :write :read-and-write})

(defn- legacy-visible-ids
  "The Collections among `ids` that `visible-collection-filter-clause` selects at `level` with `config`."
  [ids level config]
  (set/intersection ids (t2/select-pks-set :model/Collection
                                           {:where (collection/visible-collection-filter-clause
                                                    :id (merge {:permission-level level} config))})))

(defn- check-against-legacy
  "Checks the getters and the filter clause against `visible-collection-filter-clause` for the current user on `ids`."
  [ids]
  (doseq [level [:read :write]
          :let  [permission (level->permission level)
                 user-id    api/*current-user-id*]]
    (testing (str level)
      (testing "the getter grants what the legacy clause selects without its listing filters, the trash aside"
        (let [ids (disj ids (collection/trash-collection-id))]
          (is (= (legacy-visible-ids ids level {:include-archived-items :all})
                 (set (filter #(perms/user-has-permission-for-collection? user-id permission %) ids))))))
      (testing "the filter clause selects what the legacy clause selects"
        (is (= (legacy-visible-ids ids level {})
               (set/intersection ids (into #{} (map :id) (t2/query {:select [:row.id]
                                                                    :from   [[:collection :row]]
                                                                    :where  (perms/collection-permission-filter-clause
                                                                             user-id :row.id permission)}))))))
      (doseq [root-namespace [nil :data-actions]]
        (testing (str "the root Collection of namespace " root-namespace)
          (is (= (collection/should-display-root-collection? {:permission-level       level
                                                              :include-archived-items :exclude
                                                              :root-namespace         root-namespace})
                 (perms/user-has-permission-for-collection? user-id permission nil {:namespace root-namespace}))))))))

(deftest collection-permissions-match-visible-collection-filter-clause-test
  (mt/with-non-admin-groups-no-root-collection-perms
    (let [personal-id (:id (collection/user->personal-collection (mt/user->id :rasta)))]
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
        (let [ids #{read-id write-id none-id child-id archived-id transforms-id personal-id personal-child-id
                    (collection/trash-collection-id)}]
          (testing "a user"
            (mt/with-current-user (mt/user->id :rasta)
              (check-against-legacy ids)))
          (testing "a data analyst"
            (perms.tu/with-data-analyst-role! (mt/user->id :rasta)
              (mt/with-current-user (mt/user->id :rasta)
                (check-against-legacy ids))))
          (testing "a superuser"
            (mt/with-current-user (mt/user->id :crowberto)
              (check-against-legacy ids)))
          (testing "with root Collection permission"
            (perms/grant-collection-readwrite-permissions! (perms/all-users-group) collection/root-collection)
            (mt/with-current-user (mt/user->id :rasta)
              (check-against-legacy ids)))
          (testing "with read permission on the root Collection of another namespace"
            (mt/with-all-users-permission "/collection/namespace/data-actions/root/read/"
              (mt/with-current-user (mt/user->id :rasta)
                (check-against-legacy ids)))))))))

(defn- check-against-permission-set
  "Checks the getter against the current user's permission set on `ids` and the root Collections."
  [ids]
  (let [user-id api/*current-user-id*
        perm-set @api/*current-user-permissions-set*]
    (doseq [[permission path-fn] [[:read perms/collection-read-path] [:read-and-write perms/collection-readwrite-path]]]
      (testing (str permission)
        (doseq [id ids]
          (is (= (perms/set-has-full-permissions? perm-set (path-fn id))
                 (perms/user-has-permission-for-collection? user-id permission id))
              (str "Collection " id)))
        (doseq [root-namespace [nil :data-actions :snippets :transforms]]
          (is (= (perms/set-has-full-permissions? perm-set (path-fn (assoc collection/root-collection
                                                                           :namespace root-namespace)))
                 (perms/user-has-permission-for-collection? user-id permission nil {:namespace root-namespace}))
              (str "root of " root-namespace)))))))

(deftest collection-permissions-match-permission-set-test
  (mt/with-non-admin-groups-no-root-collection-perms
    (let [personal-id (:id (collection/user->personal-collection (mt/user->id :rasta)))]
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
        (let [ids [read-id write-id none-id child-id archived-id transforms-id personal-id personal-child-id]]
          (testing "a user"
            (mt/with-current-user (mt/user->id :rasta)
              (check-against-permission-set ids)))
          (testing "a data analyst"
            (perms.tu/with-data-analyst-role! (mt/user->id :rasta)
              (mt/with-current-user (mt/user->id :rasta)
                (check-against-permission-set ids))))
          (testing "a superuser"
            (mt/with-current-user (mt/user->id :crowberto)
              (check-against-permission-set ids)))
          (testing "with root Collection permissions"
            (perms/grant-collection-readwrite-permissions! (perms/all-users-group) collection/root-collection)
            (mt/with-all-users-permission "/collection/namespace/data-actions/root/read/"
              (mt/with-current-user (mt/user->id :rasta)
                (check-against-permission-set ids))))
          (testing "the trash, which the permission set grants a superuser only"
            (doseq [user [:rasta :crowberto]]
              (mt/with-current-user (mt/user->id user)
                (check-against-permission-set [(collection/trash-collection-id)])))))))))

(deftest collection-permission-batched-test
  (mt/with-non-admin-groups-no-root-collection-perms
    (mt/with-temp [:model/Collection {read-id :id}  {}
                   :model/Collection {write-id :id} {}
                   :model/Collection {none-id :id}  {}]
      (perms/grant-collection-read-permissions! (perms/all-users-group) read-id)
      (perms/grant-collection-readwrite-permissions! (perms/all-users-group) write-id)
      (mt/with-current-user (mt/user->id :rasta)
        (testing "the loaded Collections are answered by one query"
          (t2/select :model/Collection :id [:in [read-id write-id none-id]])
          (t2/with-call-count [call-count]
            (is (= [:read :read-and-write :none]
                   (mapv #(perms/collection-permission-for-user (mt/user->id :rasta) %) [read-id write-id none-id])))
            (is (= 1 (call-count)))))))))
