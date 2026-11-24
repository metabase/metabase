(ns metabase-enterprise.advanced-permissions.models.permissions.application-permissions-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.advanced-permissions.models.permissions.application-permissions :as g-perms]
   [metabase.permissions.models.application-permissions-revision :as a-perm-revision]
   [metabase.permissions.models.permissions :as perms]
   [metabase.permissions.models.permissions-group :as perms-group]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

;; -------------------------------------------------- Fetch Graph ---------------------------------------------------

(deftest application-permissions-graph-test
  (mt/with-temp [:model/PermissionsGroup {group-id :id} {}]
    ;; clear the graph revisions
    (t2/delete! :model/ApplicationPermissionsRevision)
    (testing "group should be in graph if one of application permission is enabled"
      (let [graph (g-perms/graph)]
        (is (= 0 (:revision graph)))
        (is (partial= {(:id (perms-group/admin))
                       {:monitoring   :yes
                        :setting      :yes
                        :subscription :yes}
                       (:id (perms-group/all-users))
                       {:monitoring   :no
                        :setting      :no
                        :subscription :yes}}
                      (:groups graph)))))
    (testing "group has no permissions will not be included in the graph"
      (is (not (contains? (-> (:groups (g-perms/graph)) keys set)
                          group-id))))))

;;; ------------------------------------------------- Update Graph --------------------------------------------------

(defmacro ^:private with-new-group-and-current-graph
  "Create a new group-id and bind it with the `current-graph`."
  [group-id-binding current-graph-binding & body]
  `(mt/with-temp [:model/PermissionsGroup {group-id# :id} {}]
     (mt/with-current-user (mt/user->id :crowberto)
       ((fn [~group-id-binding ~current-graph-binding] ~@body) group-id# (g-perms/graph)))))

(deftest application-permissions-update-graph!-test
  (testing "Grant successfully and increase revision"
    (let [initial-revision (a-perm-revision/latest-id)]
      (with-new-group-and-current-graph group-id current-graph
        (let [new-graph (assoc-in current-graph [:groups group-id] {:setting      :yes
                                                                    :monitoring   :no
                                                                    :subscription :no})
              _ (g-perms/update-graph! new-graph)
              updated-graph (g-perms/graph)]
          (is (partial= (:groups new-graph) (:groups updated-graph)))
          (is (= (inc (:revision current-graph)) (:revision updated-graph)))
          (is (< initial-revision (a-perm-revision/latest-id)))))))
  (testing "Revoke successfully and increase revision"
    (with-new-group-and-current-graph group-id current-graph
      (let [new-graph     (assoc-in current-graph [:groups group-id :subscription] :no)
            _             (g-perms/update-graph! new-graph)
            updated-graph (g-perms/graph)]
        (is (= (dissoc (:groups new-graph) group-id) (:groups updated-graph)))
        (is (= (inc (:revision current-graph)) (:revision updated-graph))))))
  (testing "We can do a no-op and revision won't changes"
    (with-new-group-and-current-graph _group-id current-graph
      (g-perms/update-graph! current-graph)
      (let [updated-graph (g-perms/graph)]
        (is (= (:groups updated-graph) (:groups updated-graph)))
        (is (= (:revision current-graph) (:revision updated-graph))))))
  (testing "Failed when try to update permission for admin group"
    (with-new-group-and-current-graph _group-id current-graph
      (let [new-graph (assoc-in current-graph [:groups (:id (perms-group/admin)) :subscription] :no)]
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"You cannot create or revoke permissions for the 'Admin' group."
             (g-perms/update-graph! new-graph))))))
  (testing "Failed when revision is mismatched"
    (with-new-group-and-current-graph _group-id current-graph
      (let [new-graph (assoc current-graph :revision (inc (:revision current-graph)))]
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"Looks like someone else edited the permissions and your data is out of date. Please fetch new data and try again."
             (g-perms/update-graph! new-graph))))))
  (testing "Able to grant for a group that was not in the old graph"
    (with-new-group-and-current-graph group-id _current-graph
      ;; subscription is granted for new group by default, so revoke it
      (perms/revoke-application-permissions! group-id :subscription)
      ;; making sure the `group-id` is not in the current-graph
      (is (not (contains? (-> (:groups (g-perms/graph)) keys set)
                          group-id)))
      (let [current-graph         (g-perms/graph)
            new-graph             (assoc-in current-graph [:groups group-id] {:setting      :yes
                                                                              :subscription :yes
                                                                              :monitoring   :no})
            _                     (g-perms/update-graph! new-graph)
            updated-graph         (g-perms/graph)]
        (is (= (:groups new-graph) (:groups updated-graph)))
        (is (= (inc (:revision current-graph)) (:revision updated-graph)))))))

(defn- application-rows
  "The `[group-id object]` pairs of the application permission rows of the groups with `group-ids`."
  [group-ids]
  (into #{}
        (filter #(str/starts-with? (second %) "/application/"))
        (t2/select-fn-set (juxt :group_id :object) :model/Permissions :group_id [:in group-ids])))

(defn- update-one-by-one!
  "Grant or revoke each application permission of the graph `groups` one at a time."
  [groups]
  (doseq [[group-id group-changes] groups
          [perm-type value]        group-changes]
    (case value
      :yes (perms/grant-application-permissions! group-id perm-type)
      :no  (perms/revoke-application-permissions! group-id perm-type))))

(defn- rows-after-one-by-one!
  "The application rows of the groups with `group-ids` after [[update-one-by-one!]] with `groups`, rolled back."
  [groups group-ids]
  (let [rows (atom nil)]
    (try
      (t2/with-transaction [_conn]
        (update-one-by-one! groups)
        (reset! rows (application-rows group-ids))
        (throw (ex-info "rollback" {::rollback true})))
      (catch clojure.lang.ExceptionInfo e
        (when-not (::rollback (ex-data e))
          (throw e))))
    @rows))

(deftest update-graph!-stores-rows-of-per-permission-update-test
  (testing "updating application permissions of several groups stores what granting and revoking one at a time stores"
    (mt/with-temp [:model/PermissionsGroup {granted-1 :id} {}
                   :model/PermissionsGroup {granted-2 :id} {}
                   :model/PermissionsGroup {revoked :id}   {}
                   :model/PermissionsGroup {unchanged :id} {}]
      (perms/grant-application-permissions! revoked :setting)
      (perms/grant-application-permissions! revoked :monitoring)
      (perms/grant-application-permissions! unchanged :setting)
      (let [group-ids [granted-1 granted-2 revoked unchanged]
            changes   {granted-1 {:setting :yes :monitoring :yes}
                       granted-2 {:setting :yes :subscription :no}
                       revoked   {:setting :no}}
            expected  (rows-after-one-by-one! changes group-ids)]
        (mt/with-current-user (mt/user->id :crowberto)
          (g-perms/update-graph! (update (g-perms/graph) :groups #(merge-with merge % changes))))
        (is (= expected (application-rows group-ids)))
        (is (= #{[granted-1 "/application/setting/"] [granted-1 "/application/monitoring/"]
                 [granted-2 "/application/setting/"]
                 [revoked "/application/monitoring/"]
                 [unchanged "/application/setting/"]}
               (application-rows group-ids)))))))

(deftest update-graph!-refuses-before-any-write-test
  (mt/with-temp [:model/PermissionsGroup {granted :id} {}
                 :model/PermissionsGroup {revoked :id} {}
                 :model/PermissionsGroup {tenant :id}  {:is_tenant_group true}]
    (perms/grant-application-permissions! revoked :monitoring)
    (let [group-ids [granted revoked tenant (:id (perms-group/admin))]
          before    (application-rows group-ids)
          update!   (fn [refused]
                      (mt/with-current-user (mt/user->id :crowberto)
                        (g-perms/update-graph! (update (g-perms/graph) :groups
                                                       #(merge-with merge % {granted {:setting :yes}
                                                                             revoked {:monitoring :no}}
                                                                    refused)))))]
      (testing "a tenant group granted a setting permission refuses the whole update"
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Cannot grant application permission to a tenant group\."
                              (update! {tenant {:setting :yes}})))
        (is (= before (application-rows group-ids))))
      (testing "the Admin group losing a permission refuses the whole update"
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"You cannot create or revoke permissions for the 'Admin' group\."
                              (update! {(:id (perms-group/admin)) {:setting :no}})))
        (is (= before (application-rows group-ids))))
      (testing "a tenant group granted a subscription permission is allowed"
        (update! {tenant {:subscription :yes}})
        (is (= (conj (disj before [revoked "/application/monitoring/"])
                     [granted "/application/setting/"] [tenant "/application/subscription/"])
               (application-rows group-ids)))))))
