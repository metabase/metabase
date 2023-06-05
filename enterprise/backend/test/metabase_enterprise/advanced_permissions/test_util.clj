(ns metabase-enterprise.advanced-permissions.test-util
  "Shared test utilities for EE permission tests"
  (:require
   [metabase-enterprise.sandbox.test-util :as mt.tu]
   [metabase.models.permissions :as perms]
   [metabase.models.permissions-group :as perms-group]
   [metabase.public-settings.premium-features-test
    :as premium-features-test]
   [metabase.server.middleware.session :as mw.session]
   [metabase.test.data :as data]
   [metabase.test.data.impl :as data.impl]
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

(defn do-with-impersonations-for-user [args test-user-name-or-user-id f]
  (letfn [(thunk []
            ;; remove perks for All Users group)]))
            (perms/revoke-data-perms! (perms-group/all-users) (data/db))
            ;; create new perms group
            (test.users/with-group-for-user [group test-user-name-or-user-id]
              (let [{:keys [impersonations attributes]} args]
                ;; set user login_attributes
                (mt.tu/with-user-attributes test-user-name-or-user-id attributes
                  (premium-features-test/with-premium-features #{:advanced-permissions}
                    (do-with-conn-impersonation-defs group impersonations
                      (fn []
                        ;; bind user as current user, then run f
                        (if (keyword? test-user-name-or-user-id)
                          (test.users/with-test-user test-user-name-or-user-id
                            (f group))
                          (mw.session/with-current-user (u/the-id test-user-name-or-user-id)
                            (f group))))))))))]
    ;; create a temp copy of the current DB if we haven't already created one. If one is already created, keep using
    ;; that so we can test multiple impersonated users against the same DB
    (if data.impl/*db-is-temp-copy?*
      (thunk)
      (data/with-temp-copy-of-db
        (thunk)))))

(defmacro with-impersonations-for-user
  "Like `with-impersonations`, but for an arbitrary User. `test-user-name-or-user-id` can be a predefined test user e.g.
  `:rasta` or an arbitrary User ID."
  [test-user-name-or-user-id impersonations-and-attributes-map & body]
  `(do-with-impersonations-for-user ~impersonations-and-attributes-map
                                    ~test-user-name-or-user-id
                                    (fn [~'&group] ~@body)))

(defmacro with-impersonations
  "Execute `body` with `impersonations` and optionally user `attributes` in effect for the :rasta test user. All
  underlying objects and permissions are created automatically.

  Introduces `&group` anaphor, bound to the PermissionsGroup associated with this Connection Impersonation policy."
  {:style/indent :defn}
  [impersonations-and-attributes-map & body]
  `(do-with-impersonations-for-user ~impersonations-and-attributes-map :rasta (fn [~'&group] ~@body)))
