(ns metabase.users.models.last-admin-verification-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.config.core :as config]
   [metabase.permissions.models.permissions-group :as perms-group]
   [metabase.session.models.session :as session]
   [metabase.test :as mt]
   [metabase.users.models.user :as user]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- old-refusal?
  "Whether the check `update-users!` ran before its write refused `changes` to the Users with `user-ids`, from the rows
  as stored now: some of the Users are Administrators members and no other active superuser member remains."
  [user-ids changes]
  (let [existing  (t2/select-pks-set :model/User :id [:in user-ids])
        admin-id  (:id (perms-group/admin))
        admin-ids (when (seq existing)
                    (t2/select-fn-set :user_id :model/PermissionsGroupMembership
                                      :group_id admin-id :user_id [:in existing]))]
    (boolean
     (and (seq existing)
          (or (false? (:is_active changes)) (false? (:is_superuser changes)))
          (seq admin-ids)
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

(defn- check-case
  [two-admins? names changes]
  (t2/with-transaction [_conn nil {:rollback-only true}]
    (let [ids      (population! two-admins?)
          user-ids (mapv ids names)
          watched  (vec (vals ids))
          expected (old-refusal? user-ids changes)
          before   (state watched)
          refusal  (try
                     (user/update-users! user-ids changes)
                     nil
                     (catch clojure.lang.ExceptionInfo e
                       (:status-code (ex-data e))))]
      (testing (pr-str {:two-admins? two-admins? :users names :changes changes})
        (is (= (when expected 400) refusal))
        (when expected
          (is (= before (state watched))))))))

(deftest update-users-refuses-exactly-what-the-pre-write-check-refused-test
  (mt/with-model-cleanup [:model/User]
    (doseq [two-admins? [false true]
            names       [[:a] [:b] [:a :b] [:plain] [:a :plain] [:inactive] [:outsider] [:member] [:a :member]]
            :when       (or two-admins? (not (some #{:b} names)))
            changes     [{:is_active false}
                         {:is_superuser false}
                         {:is_active false :first_name "Renamed"}
                         {:is_active false :is_superuser true}
                         {:is_superuser true}
                         {:first_name "Renamed"}]]
      (check-case two-admins? names changes))))

(deftest refused-demotion-does-not-survive-a-caller-transaction-test
  (mt/with-model-cleanup [:model/User]
    (t2/with-transaction [_conn nil {:rollback-only true}]
      (let [{:keys [a plain]} (population! false)]
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"You cannot remove the last member"
                              (user/update-users! [a] {:is_superuser false})))
        (user/update-users! [plain] {:first_name "Renamed"})
        (testing "the caller caught the refusal and wrote on: the refused demotion is absent, the other write present"
          (is (true? (t2/select-one-fn :is_superuser :model/User :id a)))
          (is (t2/exists? :model/PermissionsGroupMembership :user_id a :group_id (:id (perms-group/admin))))
          (is (= "Renamed" (t2/select-one-fn :first_name :model/User :id plain))))))))
