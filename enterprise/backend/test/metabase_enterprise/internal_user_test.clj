(ns metabase-enterprise.internal-user-test
  (:require
   [clojure.test :refer [deftest is]]
   [metabase.config :as config]
   [metabase.enterprise.internal-user :as ee.internal-user]
   [metabase.models :refer [User]]
   [metabase.setup :as setup]
   [toucan2.core :as t2]))

(defmacro with-internal-user-restoration [& body]
  `(let [original-audit-db# (t2/select-one User :id config/internal-mb-user-id)]
     (try
       (t2/delete! User :id config/internal-mb-user-id)
       ~@body
       (finally
         (t2/delete! User :id config/internal-mb-user-id)
         (when original-audit-db#
           (#'ee.internal-user/install-internal-user!))))))

(deftest installation-of-internal-user-test
  (with-internal-user-restoration
    (is (= nil (t2/select-one User :id config/internal-mb-user-id)))
    (ee.internal-user/ensure-internal-user-exists!)
    (is (map? (t2/select-one User :id config/internal-mb-user-id)))))

(deftest internal-user-installed-one-time-test
  (with-internal-user-restoration
    (is (= nil (t2/select-one User :id config/internal-mb-user-id)))
    (ee.internal-user/ensure-internal-user-exists!)
    (is (map? (t2/select-one User :id config/internal-mb-user-id)))
    (ee.internal-user/ensure-internal-user-exists!)
    (is (map? (t2/select-one User :id config/internal-mb-user-id)))))

(deftest has-user-setup-ignores-internal-user
  (with-internal-user-restoration
    ;; TODO: write a test with metabase.setup/has-user-setup once the IA email has been updated to `internal@metabase.com`.
    (if config/ee-available?
      ;; ee:
      (let [user-ids-minus-internal (t2/select-fn-set :id User {:where [:not= :id config/internal-mb-user-id]})]
        (is (true? (setup/has-user-setup)))
        (is (false? (contains? user-ids-minus-internal config/internal-mb-user-id))
            "Selecting Users with a clause to ignore internal users does not return the internal user."))
      ;; oss:
      (do
        (is (= (t2/select-fn-set :id User {:where [:not= :id config/internal-mb-user-id]})
               (t2/select-fn-set :id User))
            "Ignore internal user where clause does nothing in ee mode.")))))
