(ns metabase.users.models.last-admin-verification-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.app-db.query :as app-db.query]
   [metabase.config.core :as config]
   [metabase.permissions.models.permissions-group :as perms-group]
   [metabase.session.models.session :as session]
   [metabase.test :as mt]
   [metabase.users.db :as users.db]
   [metabase.users.models.user :as user]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- old-refusal?
  "Whether the check `update-users!` ran before its write refused `rows`, each the id of a User and its changes, from
  the rows as stored now: some of the Users whose rows deactivate or demote them are Administrators members and no
  other active superuser member remains."
  [rows]
  (let [losing    (into #{} (comp (filter #(or (false? (:is_active %)) (false? (:is_superuser %)))) (map :id)) rows)
        admin-id  (:id (perms-group/admin))
        admin-ids (when (seq losing)
                    (t2/select-fn-set :user_id :model/PermissionsGroupMembership
                                      :group_id admin-id :user_id [:in losing]))]
    (boolean
     (and (seq admin-ids)
          (zero? (t2/count :model/PermissionsGroupMembership
                           {:join  [[:core_user :u] [:= :u.id :user_id]]
                            :where [:and
                                    [:= :group_id admin-id]
                                    [:= :u.is_active true]
                                    [:= :u.is_superuser true]
                                    [:not-in :u.id admin-ids]]}))))))

(defn- state
  "The flags, Administrators memberships, live sessions and user audit rows of the Users with `user-ids`."
  [user-ids]
  {:flags       (t2/select-fn-set (juxt :id :is_active :is_superuser) :model/User :id [:in user-ids])
   :memberships (t2/select-fn-set :user_id :model/PermissionsGroupMembership
                                  :group_id (:id (perms-group/admin)) :user_id [:in user-ids])
   :sessions    (t2/count :model/Session :user_id [:in user-ids] :ended_at nil)
   :audit       (t2/count :model/AuditLog :model "User")})

(defn- insert-session!
  [user-id]
  (t2/insert! (t2/table-name :model/Session) {:id         (session/generate-session-id)
                                              :key_hashed (session/hash-session-key (session/generate-session-key))
                                              :user_id    user-id
                                              :created_at :%now}))

(defn- population!
  "Deactivate every active superuser, then create the Users of one case: admins `a` and `b` (members of Administrators;
  `b` only when `two-admins?`), a plain User, an inactive admin, a superuser outside Administrators and a member of
  Administrators that is no superuser. Returns their ids by name."
  [two-admins?]
  (when-let [admin-ids (not-empty (t2/select-pks-set :model/User :is_active true :is_superuser true
                                                     :id [:not= config/internal-mb-user-id]))]
    (t2/update! :model/User :id [:in admin-ids] {:is_active false}))
  (let [create!  (fn [row] (:id (first (user/create-users! [(assoc row :email (str (random-uuid) "@example.com"))]))))
        a        (create! {:is_superuser true})
        b        (when two-admins? (create! {:is_superuser true}))
        plain    (create! {})
        inactive (create! {:is_superuser true})
        outsider (create! {})
        member   (create! {})]
    (t2/update! :model/User :id inactive {:is_active false})
    (t2/update! :model/User :id outsider {:is_superuser true})
    (t2/insert! :model/PermissionsGroupMembership {:user_id member :group_id (:id (perms-group/admin)) :is_group_manager false})
    (doseq [id (remove nil? [a b plain inactive outsider member])]
      (insert-session! id))
    (cond-> {:a a :plain plain :inactive inactive :outsider outsider :member member}
      b (assoc :b b))))

(defn- check-case!
  "Run the update of `named-rows`, pairs of a User's name and its changes, on a fresh population and compare its
  refusal with the oracle's."
  [two-admins? named-rows]
  (t2/with-transaction [_conn nil {:rollback-only true}]
    (let [ids      (population! two-admins?)
          rows     (mapv (fn [[n changes]] (assoc changes :id (ids n))) named-rows)
          watched  (vec (vals ids))
          expected (old-refusal? rows)
          before   (state watched)
          refusal  (try
                     (user/update-users! rows)
                     nil
                     (catch clojure.lang.ExceptionInfo e
                       (or (:status-code (ex-data e))
                           [:unexpected (ex-message e)])))]
      (testing (pr-str {:two-admins? two-admins? :rows named-rows})
        (is (= (when expected 400) refusal))
        (when expected
          (is (= before (state watched))))))))

(deftest update-users-refuses-exactly-what-the-pre-write-check-refused-test
  (mt/with-model-cleanup [:model/User]
    (doseq [two-admins? [false true]
            names       [[:a] [:b] [:a :b] [:plain] [:a :plain] [:inactive] [:a :inactive] [:outsider] [:a :outsider]
                         [:member] [:a :member] [:a :b :plain]
                         [:inactive :b] [:inactive :plain] [:inactive :outsider] [:inactive :member]
                         [:a :inactive :member]]
            :when       (or two-admins? (not (some #{:b} names)))
            changes     (concat (for [active?    [nil true false]
                                      superuser? [nil true false]
                                      :when      (or (some? active?) (some? superuser?))]
                                  (cond-> {}
                                    (some? active?)    (assoc :is_active active?)
                                    (some? superuser?) (assoc :is_superuser superuser?)))
                                [{:is_active false :first_name "Renamed"}
                                 {:is_superuser false :first_name "Renamed"}
                                 {:first_name "Renamed"}])]
      (check-case! two-admins? (for [n names] [n changes])))))

(def ^:private mixed-cases
  "Calls whose rows give different Users different changes, with whether the population has two admins."
  [[true  [[:a {:is_active false}] [:b {:is_superuser false}]]]
   [true  [[:a {:is_superuser false}] [:b {:is_active false}]]]
   [true  [[:a {:is_active false}] [:b {:first_name "Renamed"}]]]
   [true  [[:a {:first_name "Renamed"}] [:b {:is_superuser false}]]]
   [true  [[:a {:is_active false}] [:b {:is_superuser true}]]]
   [true  [[:a {:is_active false}] [:b {:is_superuser false}] [:plain {:is_superuser true}]]]
   [false [[:a {:is_active false}] [:plain {:is_superuser true}]]]
   [false [[:a {:is_superuser false}] [:inactive {:is_active true}]]]
   [false [[:a {:is_active false}] [:outsider {:first_name "Renamed"}]]]
   [false [[:a {:first_name "Renamed"}] [:member {:is_superuser false}]]]
   [false [[:member {:is_active false}] [:plain {:is_superuser true}]]]])

(deftest update-users-with-different-changes-per-row-refuses-what-oracle-refuses-test
  (mt/with-model-cleanup [:model/User]
    (doseq [[two-admins? named-rows] mixed-cases]
      (check-case! two-admins? named-rows))))

(deftest update-users-refuses-last-admins-across-batches-test
  (testing "deactivating one admin and demoting other, in batches of one row, is refused before first batch"
    (mt/with-model-cleanup [:model/User]
      (let [batch-reads (atom 0)
            read-users  (mt/original-fn #'users.db/users-with-all-columns)]
        (with-redefs [app-db.query/update-partition-size 1]
          (mt/with-dynamic-fn-redefs [users.db/users-with-all-columns (fn [user-ids]
                                                                        (swap! batch-reads inc)
                                                                        (read-users user-ids))]
            (doseq [named-rows [[[:a {:is_active false}] [:b {:is_superuser false}]]
                                [[:b {:is_superuser false}] [:plain {:first_name "Renamed"}] [:a {:is_active false}]]]]
              (check-case! true named-rows))))
        (testing "no batch starts"
          (is (zero? @batch-reads)))))))
