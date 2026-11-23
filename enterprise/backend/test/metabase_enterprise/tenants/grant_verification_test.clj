(ns metabase-enterprise.tenants.grant-verification-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.permissions.models.permissions :as perms]
   [metabase.permissions.path :as permissions.path]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private collection-write-refusal
  "Tenant groups cannot have write access to any collections.")

(def ^:private application-refusal
  "Cannot grant application permission to a tenant group.")

(defn- try-grant!
  "Call `create-permissions!` with `rows` in a rolled-back transaction and check that it refuses them with the
  `expected` message and a 400, writing nothing, or stores every row when `expected` is nil."
  [rows expected]
  (t2/with-transaction [_conn nil {:rollback-only true}]
    (let [stored  #(t2/select-fn-set (juxt :group_id :object) :model/Permissions
                                     :group_id [:in (into #{} (map :group_id) rows)])
          before  (stored)
          refusal (try
                    (perms/create-permissions! rows)
                    nil
                    (catch clojure.lang.ExceptionInfo e
                      [(ex-message e) (:status-code (ex-data e))]))]
      (testing (pr-str rows)
        (is (= (when expected [expected 400]) refusal))
        (if expected
          (is (= before (stored)))
          (is (every? (stored) (map (juxt :group_id :object) rows))))))))

(deftest create-permissions-refuses-tenant-group-grants-test
  (mt/with-temp [:model/Collection       {coll-id :id}        {}
                 :model/PermissionsGroup {tenant-group :id}   {:is_tenant_group true}
                 :model/PermissionsGroup {ordinary-group :id} {:is_tenant_group false}]
    (let [read-only    (permissions.path/collection-read-path coll-id)
          write        (permissions.path/collection-readwrite-path coll-id)
          subscription (permissions.path/application-perms-path :subscription)
          monitoring   (permissions.path/application-perms-path :monitoring)
          setting      (permissions.path/application-perms-path :setting)]
      (testing "one row per call, for every kind of group and object"
        (doseq [[group-id object expected] [[tenant-group   read-only    nil]
                                            [tenant-group   write        collection-write-refusal]
                                            [tenant-group   subscription nil]
                                            [tenant-group   monitoring   application-refusal]
                                            [tenant-group   setting      application-refusal]
                                            [ordinary-group read-only    nil]
                                            [ordinary-group write        nil]
                                            [ordinary-group subscription nil]
                                            [ordinary-group monitoring   nil]
                                            [ordinary-group setting      nil]]]
          (try-grant! [{:group_id group-id :object object}] expected)))
      (testing "several rows in one call: one refused row refuses the call, with the first refused row's message"
        (doseq [[rows expected] [[[{:group_id ordinary-group :object write}
                                   {:group_id tenant-group :object monitoring}]
                                  application-refusal]
                                 [[{:group_id tenant-group :object read-only}
                                   {:group_id tenant-group :object write}
                                   {:group_id tenant-group :object setting}]
                                  collection-write-refusal]
                                 [[{:group_id tenant-group :object read-only}
                                   {:group_id tenant-group :object subscription}]
                                  nil]]]
          (try-grant! rows expected))))))
