(ns metabase.users.models.last-admin-verification-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.config.core :as config]
   [metabase.permissions.models.permissions-group :as perms-group]
   [metabase.session.models.session :as session]
   [metabase.test :as mt]
   [metabase.users.db :as users.db]
   [metabase.users.models.user :as user]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

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
  "Deactivate every active superuser, then create the Users of one case and return their ids by name: admins `a` and
  `b` (members of Administrators; `b` only when `two-admins?`), a plain User, an inactive admin, a superuser outside
  Administrators and a member of Administrators that is no superuser."
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

(defn- try-update!
  "Run the update of `named-rows`, pairs of a User's name and its changes, on a fresh population and check that it is
  refused with a 400 that changes nothing when `refused?`, and accepted otherwise."
  [two-admins? named-rows refused?]
  (t2/with-transaction [_conn nil {:rollback-only true}]
    (let [ids     (population! two-admins?)
          rows    (mapv (fn [[n changes]] (assoc changes :id (ids n))) named-rows)
          watched (vec (vals ids))
          before  (state watched)
          refusal (try
                    (user/update-users! rows)
                    nil
                    (catch clojure.lang.ExceptionInfo e
                      (or (:status-code (ex-data e))
                          [:unexpected (ex-message e)])))]
      (testing (pr-str {:two-admins? two-admins? :rows named-rows})
        (is (= (when refused? 400) refusal))
        (when refused?
          (is (= before (state watched))))))))

(def ^:private name-sets
  "Sets of Users that one call gives the same changes, with whether a change that deactivates or demotes them is refused
  with one admin and with two admins in the population, nil where the set names an admin the population lacks."
  [[[:a]                   true  false]
   [[:b]                   nil   false]
   [[:a :b]                nil   true]
   [[:plain]               false false]
   [[:a :plain]            true  false]
   [[:inactive]            false false]
   [[:a :inactive]         true  false]
   [[:outsider]            false false]
   [[:a :outsider]         true  false]
   [[:member]              false false]
   [[:a :member]           true  false]
   [[:a :b :plain]         nil   true]
   [[:inactive :b]         nil   false]
   [[:inactive :plain]     false false]
   [[:inactive :outsider]  false false]
   [[:inactive :member]    false false]
   [[:a :inactive :member] true  false]])

(def ^:private uniform-changes
  "Changes one call gives every User of a set, with whether they deactivate or demote them."
  [[{:is_superuser true}                        false]
   [{:is_superuser false}                       true]
   [{:is_active true}                           false]
   [{:is_active true :is_superuser true}        false]
   [{:is_active true :is_superuser false}       true]
   [{:is_active false}                          true]
   [{:is_active false :is_superuser true}       true]
   [{:is_active false :is_superuser false}      true]
   [{:is_active false :first_name "Renamed"}    true]
   [{:is_superuser false :first_name "Renamed"} true]
   [{:first_name "Renamed"}                     false]])

(deftest update-users-refuses-losing-every-admin-test
  (mt/with-model-cleanup [:model/User]
    (doseq [[names one-admin two-admins] name-sets
            [two-admins? refused-set?]    [[false one-admin] [true two-admins]]
            :when                         (some? refused-set?)
            [changes losing?]             uniform-changes]
      (try-update! two-admins? (for [n names] [n changes]) (and refused-set? losing?)))))

(def ^:private mixed-cases
  "Calls whose rows give different Users different changes, with whether the population has two admins and whether the
  call is refused."
  [[true  [[:a {:is_active false}] [:b {:is_superuser false}]]                             true]
   [true  [[:a {:is_superuser false}] [:b {:is_active false}]]                             true]
   [true  [[:a {:is_active false}] [:b {:first_name "Renamed"}]]                           false]
   [true  [[:a {:first_name "Renamed"}] [:b {:is_superuser false}]]                        false]
   [true  [[:a {:is_active false}] [:b {:is_superuser true}]]                              false]
   [true  [[:a {:is_active false}] [:b {:is_superuser false}] [:plain {:is_superuser true}]] true]
   [false [[:a {:is_active false}] [:plain {:is_superuser true}]]                          true]
   [false [[:a {:is_superuser false}] [:inactive {:is_active true}]]                       true]
   [false [[:a {:is_active false}] [:outsider {:first_name "Renamed"}]]                    true]
   [false [[:a {:first_name "Renamed"}] [:member {:is_superuser false}]]                   false]
   [false [[:member {:is_active false}] [:plain {:is_superuser true}]]                     false]])

(deftest update-users-with-different-changes-per-row-test
  (mt/with-model-cleanup [:model/User]
    (doseq [[two-admins? named-rows refused?] mixed-cases]
      (try-update! two-admins? named-rows refused?))))

(deftest update-users-refuses-last-admins-across-batches-test
  (testing "deactivating one admin and demoting other, in batches of one row, is refused before first batch"
    (mt/with-model-cleanup [:model/User]
      (let [batch-reads (atom 0)
            read-users  (mt/original-fn #'users.db/users-with-all-columns)]
        (mt/with-partition-size 1
          (mt/with-dynamic-fn-redefs [users.db/users-with-all-columns (fn [user-ids]
                                                                        (swap! batch-reads inc)
                                                                        (read-users user-ids))]
            (doseq [named-rows [[[:a {:is_active false}] [:b {:is_superuser false}]]
                                [[:b {:is_superuser false}] [:plain {:first_name "Renamed"}] [:a {:is_active false}]]]]
              (try-update! true named-rows true))))
        (testing "no batch starts"
          (is (zero? @batch-reads)))))))
