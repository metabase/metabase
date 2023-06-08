(ns metabase-enterprise.internal-user-test
  (:require
   [clojure.test :refer [deftest is]]
   [metabase-enterprise.internal-user :as ee.internal-user]
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
