(ns metabase-enterprise.internal-user-test
  (:require
   [clojure.test :refer [deftest is]]
   [metabase-enterprise.internal-user :as ee.internal-user]
   [metabase.config :as config]
   [metabase.models :refer [User]]
   [toucan2.core :as t2]))

(defmacro with-internal-user-restoration [& body]
  `(let [original-audit-db# (t2/select-one User :id @#'ee.internal-user/internal-user-id)]
     (try
       (t2/delete! User :id @#'ee.internal-user/internal-user-id)
       ~@body
       (finally
         (t2/delete! User :id @#'ee.internal-user/internal-user-id)
         (when original-audit-db#
           (#'ee.internal-user/install-internal-user!))))))

(deftest installation-of-internal-user-test
  (with-internal-user-restoration
    (is (= nil (t2/select-one User :id @#'ee.internal-user/internal-user-id)))
    (ee.internal-user/ensure-internal-user-exists!)
    (is (map? (t2/select-one User :id @#'ee.internal-user/internal-user-id)))))

(deftest internal-user-installed-one-time-test
  (with-internal-user-restoration
    (is (= nil (t2/select-one User :id @#'ee.internal-user/internal-user-id)))
    (ee.internal-user/ensure-internal-user-exists!)
    (is (map? (t2/select-one User :id @#'ee.internal-user/internal-user-id)))
    (ee.internal-user/ensure-internal-user-exists!)
    (is (map? (t2/select-one User :id @#'ee.internal-user/internal-user-id)))))

(deftest has-user-setup-ignores-internal-user
  (with-internal-user-restoration
    ;; TODO: write a test with metabase.setup/has-user-setup once the IA email has been updated to `internal@metabase.com`.
    (if config/ee-available?
      ;; ee:
      (let [user-ids-minus-internal (t2/select-fn-set :id User {:where (ee.internal-user/ignore-internal-user-clause)})]
        (is (false? (contains? user-ids-minus-internal @#'ee.internal-user/internal-user-id))
            "Selecting Users with a clause to ignore internal users does not return the internal user."))
      ;; oss:
      (do
        (is (= [] (ee.internal-user/ignore-internal-user-clause)))
        (is (= (t2/select-fn-set :id User {:where (ee.internal-user/ignore-internal-user-clause)})
               (t2/select-fn-set :id User))
            "Ignore internal user where clause does nothing in ee mode.")))))
