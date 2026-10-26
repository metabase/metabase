(ns metabase-enterprise.sandbox.actions-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.test :as met]
   [metabase.actions.test-util :as actions.tu]
   [metabase.test :as mt]))

(def ^:private sandboxed-message
  "You can't run actions on this database because row and column security applies to your data access.")

(defn- execute! [user expected-status action-id]
  (mt/user-http-request user :post expected-status (format "action/%s/execute" action-id)
                        {:parameters {:id 1 :name "European"}}))

(defn- do-with-query-and-implicit-actions! [f]
  (mt/with-actions-enabled
    (mt/with-actions [{query-action-id :action-id}    {}
                      {implicit-action-id :action-id} {:type :implicit :kind "row/update"}]
      (f query-action-id implicit-action-id))))

(deftest unsandboxed-users-run-actions-test
  (testing "Without a sandbox a non-admin runs query and implicit actions"
    (mt/with-actions-test-data
      (do-with-query-and-implicit-actions!
       (fn [query-action-id implicit-action-id]
         (is (=? {:rows-affected 1} (execute! :rasta 200 query-action-id)))
         (is (=? {:rows-updated 1} (execute! :rasta 200 implicit-action-id))))))))

(deftest sandboxed-users-cannot-run-actions-test
  (testing "A user with a sandbox on another table of a database can't run any action on it"
    (actions.tu/with-actions-test-data-tables #{"categories" "venues"}
      (mt/with-actions-test-data
        (met/with-gtaps-for-all-users! {:gtaps {:venues {}}}
          (do-with-query-and-implicit-actions!
           (fn [query-action-id implicit-action-id]
             (testing "a query action, whose endpoint reports a permission error with a generic message"
               (is (=? {:message "You don't have permissions to do that."}
                       (execute! :rasta 403 query-action-id))))
             (testing "an implicit action"
               (is (= sandboxed-message (execute! :rasta 403 implicit-action-id))))
             (testing "an admin in a sandboxed group"
               (is (=? {:rows-affected 1} (execute! :crowberto 200 query-action-id)))))))))))
