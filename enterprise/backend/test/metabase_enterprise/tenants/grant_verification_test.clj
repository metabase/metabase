(ns metabase-enterprise.tenants.grant-verification-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer [deftest is testing]]
   [metabase.permissions.models.permissions :as perms]
   [metabase.permissions.path :as permissions.path]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- old-grant-error
  "The message the check `create-permissions!` ran before its insert refused `object` with for a tenant group, or nil."
  [object]
  (cond
    (and (str/starts-with? object "/collection/") (not (str/ends-with? object "/read/")))
    "Tenant groups cannot have write access to any collections."

    (and (str/starts-with? object "/application/")
         (not= object (permissions.path/application-perms-path :subscription)))
    "Cannot grant application permission to a tenant group."))

(defn- old-refusal
  "The `[message status]` the pre-write check refused `rows` with, from the groups as stored now, or nil."
  [rows]
  (let [tenant? (t2/select-pk->fn :is_tenant_group [:model/PermissionsGroup :id :is_tenant_group]
                                  :id [:in (into #{} (map :group_id) rows)])]
    (some (fn [{:keys [group_id object]}]
            (when-let [message (old-grant-error object)]
              (when (get tenant? group_id)
                [message 400])))
          rows)))

(defn- check-case!
  [rows]
  (t2/with-transaction [_conn nil {:rollback-only true}]
    (let [expected (old-refusal rows)
          stored   #(t2/select-fn-set (juxt :group_id :object) :model/Permissions
                                      :group_id [:in (into #{} (map :group_id) rows)])
          before   (stored)
          refusal  (try
                     (perms/create-permissions! rows)
                     nil
                     (catch clojure.lang.ExceptionInfo e
                       [(ex-message e) (:status-code (ex-data e))]))]
      (testing (pr-str rows)
        (is (= expected refusal))
        (if expected
          (is (= before (stored)))
          (is (every? (stored) (map (juxt :group_id :object) rows))))))))

(deftest create-permissions-refuses-exactly-what-the-pre-write-check-refused-test
  (mt/with-temp [:model/Collection       {coll-id :id}        {}
                 :model/PermissionsGroup {tenant-group :id}   {:is_tenant_group true}
                 :model/PermissionsGroup {ordinary-group :id} {:is_tenant_group false}]
    (let [objects [(permissions.path/collection-read-path coll-id)
                   (permissions.path/collection-readwrite-path coll-id)
                   (permissions.path/application-perms-path :subscription)
                   (permissions.path/application-perms-path :monitoring)
                   (permissions.path/application-perms-path :setting)]]
      (testing "one row per call, for every kind of group and object"
        (doseq [group-id [tenant-group ordinary-group]
                object   objects]
          (check-case! [{:group_id group-id :object object}])))
      (testing "several rows in one call: one refused row refuses the call, with the first refused row's message"
        (doseq [rows [[{:group_id ordinary-group :object (permissions.path/collection-readwrite-path coll-id)}
                       {:group_id tenant-group :object (permissions.path/application-perms-path :monitoring)}]
                      [{:group_id tenant-group :object (permissions.path/collection-read-path coll-id)}
                       {:group_id tenant-group :object (permissions.path/collection-readwrite-path coll-id)}
                       {:group_id tenant-group :object (permissions.path/application-perms-path :setting)}]
                      [{:group_id tenant-group :object (permissions.path/collection-read-path coll-id)}
                       {:group_id tenant-group :object (permissions.path/application-perms-path :subscription)}]]]
          (check-case! rows))))))
