(ns metabase-enterprise.advanced-permissions.api.util-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.advanced-permissions.api.util
    :as advanced-perms.api.u]
   [metabase-enterprise.sandbox.test-util :as met]
   [metabase.api.common :as api]
   [metabase.models.data-permissions :as data-perms]
   [metabase.server.middleware.session :as mw.session]
   [metabase.test :as mt]
   [metabase.test.data :as data]
   [metabase.test.data.users :as test.users]
   [metabase.util :as u]
   [toucan2.tools.with-temp :as t2.with-temp]))

(defn- do-with-conn-impersonation-defs
  {:style/indent 2}
  [group [{:keys [db-id attribute] :as impersonation-def} & more] f]
  (if-not impersonation-def
    (f)
    (t2.with-temp/with-temp [:model/ConnectionImpersonation _ {:db_id db-id
                                                               :group_id (u/the-id group)
                                                               :attribute attribute}]
      (do-with-conn-impersonation-defs group more f))))

(defn do-with-impersonations-for-user!
  [args test-user-name-or-user-id f]
  (letfn [(thunk []
            ;; remove perms for All Users group
            (mt/with-no-data-perms-for-all-users!
              ;; create new perms group
              (test.users/with-group-for-user [group test-user-name-or-user-id]
                ;; grant full data access to the group
                (data-perms/set-database-permission! group (data/id) :perms/view-data :unrestricted)
                (data-perms/set-database-permission! group (data/id) :perms/create-queries :query-builder-and-native)
                (let [{:keys [impersonations attributes]} args]
                  ;; set user login_attributes
                  (met/with-user-attributes test-user-name-or-user-id attributes
                    (do-with-conn-impersonation-defs group impersonations
                      (fn []
                        ;; bind user as current user, then run f
                        (if (keyword? test-user-name-or-user-id)
                          (test.users/with-test-user test-user-name-or-user-id
                            (f group))
                          (mw.session/with-current-user (u/the-id test-user-name-or-user-id)
                            (f group))))))))))]
    (thunk)))

(defmacro with-impersonations-for-user!
  "Like `with-impersonations`, but for an arbitrary User. `test-user-name-or-user-id` can be a predefined test user e.g.
  `:rasta` or an arbitrary User ID."
  [test-user-name-or-user-id impersonations-and-attributes-map & body]
  `(do-with-impersonations-for-user! ~impersonations-and-attributes-map
                                    ~test-user-name-or-user-id
                                    (fn [~'&group] ~@body)))

(defmacro with-impersonations!
  "Execute `body` with `impersonations` and optionally user `attributes` in effect for the :rasta test user, for the
  current test database. All underlying objects and permissions are created automatically.

  Introduces `&group` anaphor, bound to the PermissionsGroup associated with this Connection Impersonation policy."
  {:style/indent :defn}
  [impersonations-and-attributes-map & body]
  `(do-with-impersonations-for-user! ~impersonations-and-attributes-map :rasta (fn [~'&group] ~@body)))

(deftest impersonated-user-test
  (mt/with-premium-features #{:advanced-permissions}
    (testing "Returns true when a user has an active connection impersonation policy"
      (with-impersonations! {:impersonations [{:db-id (mt/id) :attribute "KEY"}]
                             :attributes     {"KEY" "VAL"}}
        (is (advanced-perms.api.u/impersonated-user?))))

    (testing "Returns true if current user is a superuser, even if they are in a group with an impersonation policy in place"
      (with-impersonations-for-user! :crowberto {:impersonations [{:db-id (mt/id) :attribute "KEY"}]
                                                 :attributes     {"KEY" "VAL"}}
        (is (not (advanced-perms.api.u/impersonated-user?)))))

    (testing "An exception is thrown if no user is bound"
      (binding [api/*current-user-id* nil]
        (is (thrown-with-msg? clojure.lang.ExceptionInfo
                              #"No current user found"
                              (advanced-perms.api.u/impersonated-user?)))))))
