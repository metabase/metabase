(ns metabase-enterprise.permission-debug.reasons-test
  {:clj-kondo/config '{:linters {:deprecated-var {:exclude {metabase.test.data/mbql-query {:namespaces [metabase-enterprise.permission-debug.reasons-test]}}}}}}
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.permission-debug.impl :as permission-debug.impl]
   [metabase-enterprise.permission-debug.reasons :as permission-debug.reasons]
   [metabase.collections.models.collection :as collection]
   [metabase.permissions.core :as perms]
   [metabase.request.core :as request]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db))

(use-fixtures :each (fn [thunk]
                      (mt/with-premium-features #{:advanced-permissions :sandboxes :database-routing}
                        (thunk))))

(defn- debug
  "The answer for `user-id`, asked as the admin who asks the endpoint."
  [action-type user-id model-id]
  (request/with-current-user (mt/user->id :crowberto)
    (permission-debug.impl/debug-permissions {:user-id user-id :model-id model-id :action-type action-type})))

(defn- group-values
  "The `{group-name value}` of a reason's `:groups`."
  [reason]
  (into {} (map (juxt :group-name :value)) (:groups reason)))

(defn- table-entry
  [result table-name]
  (some #(when (= table-name (:name %)) %) (-> result :reasons :tables)))

(defn- category-sandbox []
  {:attribute_remappings {"category" [:dimension [:field (mt/id :venues :category_id) nil]]}})

(defn- grant-venues! [group]
  (perms/set-database-permission! group (mt/id) :perms/view-data :unrestricted)
  (perms/set-table-permission! group (mt/id :venues) :perms/create-queries :query-builder))

(deftest collection-read-reasons-test
  (mt/with-temp [:model/PermissionsGroup {sales-id :id :as sales} {:name "Sales"}
                 :model/PermissionsGroup {support-id :id :as support} {:name "Support"}
                 :model/User {user-id :id} {}
                 :model/PermissionsGroupMembership _ {:user_id user-id :group_id (:id (perms/all-users-group))}
                 :model/PermissionsGroupMembership _ {:user_id user-id :group_id sales-id}
                 :model/PermissionsGroupMembership _ {:user_id user-id :group_id support-id}
                 :model/Collection {collection-id :id :as collection} {}]
    (perms/revoke-collection-permissions! (perms/all-users-group) collection)
    (perms/grant-collection-readwrite-permissions! sales collection)
    (perms/grant-collection-read-permissions! support collection)
    (let [result (debug :collection/read user-id collection-id)]
      (testing "the verdict is master's read check as the person"
        (is (= "allow" (:decision result)))
        (is (= "collection" (:model-type result)))
        (is (= "allowed" (:outcome result))))
      (testing "each group the person is in gives its own value, and the most permissive decides"
        (is (= {"All Users" "none" "Sales" "curate" "Support" "view"}
               (group-values (-> result :reasons :collection))))
        (is (= "curate" (-> result :reasons :collection :value)))
        (is (= ["Sales"] (->> (-> result :reasons :collection :groups) (filter :applies?) (map :group-name)))))
      (testing "a person in no group that grants it can't read it"
        (mt/with-temp [:model/User {other-id :id} {}]
          (let [denied (debug :collection/read other-id collection-id)]
            (is (= "denied" (:decision denied)))
            (is (= "denied" (:outcome denied)))
            (is (= "none" (-> denied :reasons :collection :value)))
            (is (empty? (filter :applies? (-> denied :reasons :collection :groups))))))))))

(deftest personal-collection-is-curated-by-rule-test
  (mt/with-temp [:model/User {user-id :id} {}]
    (let [personal-id (:id (collection/user->personal-collection user-id))
          reasons     (-> (debug :collection/read user-id personal-id) :reasons :collection)]
      (is (= "curate" (:value reasons)))
      (is (true? (:by-rule reasons)))
      (is (empty? (filter :applies? (:groups reasons)))))))

(deftest dashboard-read-reasons-test
  (mt/with-temp [:model/PermissionsGroup {sales-id :id :as sales} {:name "Sales"}
                 :model/User {user-id :id} {}
                 :model/PermissionsGroupMembership _ {:user_id user-id :group_id (:id (perms/all-users-group))}
                 :model/PermissionsGroupMembership _ {:user_id user-id :group_id sales-id}
                 :model/Collection {collection-id :id :as collection} {:name "Sales reports"}
                 :model/Dashboard {dashboard-id :id} {:collection_id collection-id}]
    (perms/revoke-collection-permissions! (perms/all-users-group) collection)
    (testing "without a grant the person can't open the dashboard, and the reason is its collection"
      (let [result (debug :dashboard/read user-id dashboard-id)]
        (is (= "denied" (:decision result)))
        (is (= "dashboard" (:model-type result)))
        (is (= "Sales reports" (-> result :reasons :collection :name)))
        (is (= "none" (-> result :reasons :collection :value)))))
    (perms/grant-collection-read-permissions! sales collection)
    (testing "with a grant the person can open it, and the granting group is named"
      (let [result (debug :dashboard/read user-id dashboard-id)]
        (is (= "allow" (:decision result)))
        (is (= ["Sales"] (->> (-> result :reasons :collection :groups) (filter :applies?) (map :group-name))))))))

(deftest dashboard-query-counts-cards-that-cant-load-test
  (mt/with-no-data-perms-for-all-users!
    (mt/with-temp [:model/PermissionsGroup {group-id :id :as group} {}
                   :model/User {user-id :id} {}
                   :model/PermissionsGroupMembership _ {:user_id user-id :group_id (:id (perms/all-users-group))}
                   :model/PermissionsGroupMembership _ {:user_id user-id :group_id group-id}
                   :model/Dashboard {dashboard-id :id} {}
                   :model/Card {venues-card :id} {:dataset_query (mt/mbql-query venues)}
                   :model/Card {checkins-card :id} {:dataset_query (mt/mbql-query checkins)}
                   :model/DashboardCard _ {:dashboard_id dashboard-id :card_id venues-card}
                   :model/DashboardCard _ {:dashboard_id dashboard-id :card_id checkins-card}]
      (perms/set-database-permission! group (mt/id) :perms/view-data :unrestricted)
      (perms/set-table-permission! (perms/all-users-group) (mt/id :checkins) :perms/view-data :blocked)
      (perms/set-table-permission! group (mt/id :checkins) :perms/view-data :blocked)
      (let [result (debug :dashboard/query user-id dashboard-id)]
        (testing "one card of two can't load, so the dashboard is limited"
          (is (= "limited" (:decision result)))
          (is (= "limited" (:outcome result)))
          (is (= {:cards-total 2 :cards-blocked 1} (select-keys (:data result) [:cards-total :cards-blocked]))))
        (testing "the blocked table shows with its groups"
          (is (= {"test-data (h2).PUBLIC.CHECKINS" #{"All Users" (:name (t2/select-one :model/PermissionsGroup :id group-id))}}
                 (-> result :data :blocked-tables))))
        (testing "every table of the dashboard has its per-group values"
          (is (= {"All Users" "blocked"} (-> (table-entry result "CHECKINS") :view-data group-values (select-keys ["All Users"])))))
        (testing "a dashboard whose cards are all blocked is denied"
          (perms/set-table-permission! group (mt/id :venues) :perms/view-data :blocked)
          (perms/set-table-permission! (perms/all-users-group) (mt/id :venues) :perms/view-data :blocked)
          (is (= "denied" (:decision (debug :dashboard/query user-id dashboard-id)))))))))

(deftest row-and-column-security-reasons-test
  (mt/with-no-data-perms-for-all-users!
    (mt/with-temp [:model/PermissionsGroup {group-id :id :as group} {:name "Sales"}
                   :model/User {user-id :id} {:login_attributes {"category" "2"}}
                   :model/PermissionsGroupMembership _ {:user_id user-id :group_id (:id (perms/all-users-group))}
                   :model/PermissionsGroupMembership _ {:user_id user-id :group_id group-id}
                   :model/Sandbox _ (merge {:group_id group-id :table_id (mt/id :venues) :card_id nil} (category-sandbox))
                   :model/Card {card-id :id} {:dataset_query (mt/mbql-query venues)}]
      (grant-venues! group)
      (let [result  (debug :card/query user-id card-id)
            venues  (table-entry result "VENUES")
            sandbox (first (:sandboxes venues))]
        (testing "the table is reshaped, and the segment says so"
          (is (= #{"sandboxed"} (:segment result)))
          (is (= "reshaped" (:outcome result))))
        (testing "the filter reads as attribute, the person's value and the column"
          (is (= "Sales" (:group-name sandbox)))
          (is (true? (:enforced? sandbox)))
          (is (= [{:attribute "category" :value "2" :column "VENUES.CATEGORY_ID" :missing? false}]
                 (:filters sandbox))))
        (testing "each group's View data value is listed, the group with the rule applying"
          (is (= {"All Users" "blocked" "Sales" "unrestricted"} (group-values (:view-data venues))))
          (is (= ["Sales"] (->> (:view-data venues) :groups (filter :applies?) (map :group-name)))))
        (testing "the other permissions of the table are per group as well"
          (is (= "query-builder" (-> venues :create-queries :value)))
          (is (= "no" (-> venues :download-results :value))))))))

(deftest missing-attribute-is-broken-test
  (mt/with-no-data-perms-for-all-users!
    (mt/with-temp [:model/PermissionsGroup {group-id :id :as group} {}
                   :model/User {user-id :id} {}
                   :model/PermissionsGroupMembership _ {:user_id user-id :group_id (:id (perms/all-users-group))}
                   :model/PermissionsGroupMembership _ {:user_id user-id :group_id group-id}
                   :model/Sandbox _ (merge {:group_id group-id :table_id (mt/id :venues) :card_id nil} (category-sandbox))
                   :model/Card {card-id :id} {:dataset_query (mt/mbql-query venues)}]
      (grant-venues! group)
      (let [result (debug :card/query user-id card-id)]
        (is (= "broken" (:outcome result)))
        (is (= [{:type "missing-attribute" :attribute "category" :table-id (mt/id :venues)}]
               (-> result :reasons :problems)))
        (is (= [{:attribute "category" :value nil :column "VENUES.CATEGORY_ID" :missing? true}]
               (-> (table-entry result "VENUES") :sandboxes first :filters)))))))

(deftest conflicting-sandboxes-are-broken-test
  (mt/with-no-data-perms-for-all-users!
    (mt/with-temp [:model/PermissionsGroup {first-id :id :as first-group} {}
                   :model/PermissionsGroup {second-id :id :as second-group} {}
                   :model/User {user-id :id} {:login_attributes {"category" "2"}}
                   :model/PermissionsGroupMembership _ {:user_id user-id :group_id (:id (perms/all-users-group))}
                   :model/PermissionsGroupMembership _ {:user_id user-id :group_id first-id}
                   :model/PermissionsGroupMembership _ {:user_id user-id :group_id second-id}
                   :model/Sandbox _ (merge {:group_id first-id :table_id (mt/id :venues) :card_id nil} (category-sandbox))
                   :model/Sandbox _ (merge {:group_id second-id :table_id (mt/id :venues) :card_id nil} (category-sandbox))
                   :model/Card {card-id :id} {:dataset_query (mt/mbql-query venues)}]
      (grant-venues! first-group)
      (grant-venues! second-group)
      (let [result (debug :card/query user-id card-id)]
        (is (= "broken" (:outcome result)))
        (is (= [{:type "conflicting-sandboxes" :table-id (mt/id :venues) :group-ids [first-id second-id]}]
               (-> result :reasons :problems)))))))

(deftest sandbox-card-joins-in-tables-the-person-is-blocked-on-test
  (mt/with-no-data-perms-for-all-users!
    (mt/with-temp [:model/PermissionsGroup {group-id :id :as group} {}
                   :model/User {user-id :id} {:login_attributes {"category" "2"}}
                   :model/PermissionsGroupMembership _ {:user_id user-id :group_id (:id (perms/all-users-group))}
                   :model/PermissionsGroupMembership _ {:user_id user-id :group_id group-id}
                   :model/Card {sandbox-card-id :id} {:dataset_query (mt/mbql-query venues
                                                                       {:joins [{:source-table $$categories
                                                                                 :alias        "Categories"
                                                                                 :condition    [:= $category_id &Categories.categories.id]
                                                                                 :fields       :all}]})}
                   :model/Sandbox _ (merge {:group_id group-id :table_id (mt/id :venues) :card_id sandbox-card-id}
                                           (category-sandbox))
                   :model/Card {card-id :id} {:dataset_query (mt/mbql-query venues)}]
      (grant-venues! group)
      (perms/set-table-permission! group (mt/id :categories) :perms/view-data :blocked)
      (let [result (debug :card/query user-id card-id)]
        (testing "the query is expanded as the person, so the table their policy joins in is checked"
          (is (= "denied" (:decision result)))
          (is (= {"test-data (h2).PUBLIC.CATEGORIES" #{"All Users" (:name (t2/select-one :model/PermissionsGroup :id group-id))}}
                 (-> result :data :blocked-tables)))
          (is (some? (table-entry result "CATEGORIES"))))))))

(deftest impersonation-reasons-test
  (mt/with-no-data-perms-for-all-users!
    (mt/with-temp [:model/PermissionsGroup {group-id :id :as group} {:name "Analysts"}
                   :model/User {user-id :id} {:login_attributes {"role" "analyst_role"}}
                   :model/PermissionsGroupMembership _ {:user_id user-id :group_id (:id (perms/all-users-group))}
                   :model/PermissionsGroupMembership _ {:user_id user-id :group_id group-id}
                   :model/ConnectionImpersonation _ {:group_id group-id :db_id (mt/id) :attribute "role"}
                   :model/Card {card-id :id} {:dataset_query (mt/mbql-query venues)}]
      (grant-venues! group)
      (let [result (debug :card/query user-id card-id)]
        (is (= #{"impersonated"} (:segment result)))
        (is (= "reshaped" (:outcome result)))
        (is (= [{:db-id (mt/id) :db-name "test-data (h2)" :group-id group-id :group-name "Analysts"
                 :attribute "role" :value "analyst_role" :missing? false :enforced? true}]
               (-> result :reasons :impersonations)))
        (testing "a person without the attribute value is broken"
          (t2/update! :model/User :id user-id {:login_attributes {}})
          (let [broken (debug :card/query user-id card-id)]
            (is (= "broken" (:outcome broken)))
            (is (= [{:type "missing-attribute" :attribute "role" :db-id (mt/id)}]
                   (-> broken :reasons :problems)))))))))

(deftest impersonation-and-sandbox-conflict-is-broken-test
  (mt/with-no-data-perms-for-all-users!
    (mt/with-temp [:model/PermissionsGroup {group-id :id :as group} {}
                   :model/User {user-id :id} {:login_attributes {"role" "analyst_role" "category" "2"}}
                   :model/PermissionsGroupMembership _ {:user_id user-id :group_id (:id (perms/all-users-group))}
                   :model/PermissionsGroupMembership _ {:user_id user-id :group_id group-id}
                   :model/ConnectionImpersonation _ {:group_id group-id :db_id (mt/id) :attribute "role"}
                   :model/Sandbox _ (merge {:group_id group-id :table_id (mt/id :venues) :card_id nil} (category-sandbox))
                   :model/Card {card-id :id} {:dataset_query (mt/mbql-query venues)}]
      (grant-venues! group)
      (let [result (debug :card/query user-id card-id)]
        (is (= "broken" (:outcome result)))
        (is (= [{:type "sandbox-and-impersonation" :db-id (mt/id)}]
               (-> result :reasons :problems)))))))

(deftest routing-reasons-test
  (mt/with-no-data-perms-for-all-users!
    (mt/with-temp [:model/PermissionsGroup {group-id :id :as group} {}
                   :model/User {user-id :id} {:login_attributes {"destination" "tenant-a"}}
                   :model/PermissionsGroupMembership _ {:user_id user-id :group_id (:id (perms/all-users-group))}
                   :model/PermissionsGroupMembership _ {:user_id user-id :group_id group-id}
                   :model/DatabaseRouter _ {:database_id (mt/id) :user_attribute "destination"}
                   :model/Card {card-id :id} {:dataset_query (mt/mbql-query venues)}]
      (mt/with-temp [:model/Database {destination-id :id} {:router_database_id (mt/id)
                                                           :name               "tenant-a"
                                                           :engine             :h2
                                                           :details            (:details (mt/db))}]
        (do
          (grant-venues! group)
          (testing "a person whose attribute names a destination is routed to it"
            (let [result (debug :card/query user-id card-id)]
              (is (= #{"routed"} (:segment result)))
              (is (= "reshaped" (:outcome result)))
              (is (= [{:db-id (mt/id) :db-name "test-data (h2)" :attribute "destination" :value "tenant-a"
                       :status "routed" :destination-id destination-id :destination-name "tenant-a"}]
                     (-> result :reasons :routes)))))
          (testing "a person with no value says every query fails"
            (t2/update! :model/User :id user-id {:login_attributes {}})
            (let [result (debug :card/query user-id card-id)]
              (is (= "broken" (:outcome result)))
              (is (= [{:type "routing-missing-value" :attribute "destination" :db-id (mt/id)}]
                     (-> result :reasons :problems)))))
          (testing "a value that names no destination is broken too"
            (t2/update! :model/User :id user-id {:login_attributes {"destination" "nowhere"}})
            (is (= [{:type "routing-no-destination" :attribute "destination" :db-id (mt/id)}]
                   (-> (debug :card/query user-id card-id) :reasons :problems)))))))))

(deftest download-verdict-lists-each-tables-level-test
  (mt/with-no-data-perms-for-all-users!
    (mt/with-temp [:model/PermissionsGroup {group-id :id :as group} {}
                   :model/User {user-id :id} {}
                   :model/PermissionsGroupMembership _ {:user_id user-id :group_id (:id (perms/all-users-group))}
                   :model/PermissionsGroupMembership _ {:user_id user-id :group_id group-id}
                   :model/Card {card-id :id} {:dataset_query (mt/mbql-query venues)}]
      (grant-venues! group)
      (perms/set-table-permission! group (mt/id :venues) :perms/download-results :ten-thousand-rows)
      (let [result (debug :card/download-data user-id card-id)]
        (is (= "limited" (:decision result)))
        (is (= "limited" (:outcome result)))
        (is (= "ten-thousand-rows" (-> (table-entry result "VENUES") :download-results :value)))
        (is (= #{"no" "ten-thousand-rows"}
               (set (vals (group-values (:download-results (table-entry result "VENUES")))))))))))

(deftest the-endpoint-takes-the-new-actions-test
  (mt/with-temp [:model/Collection {collection-id :id :as collection} {}
                 :model/Dashboard {dashboard-id :id} {:collection_id collection-id}]
    (perms/grant-collection-read-permissions! (perms/all-users-group) collection)
    (doseq [[action-type model-id model-type] [["collection/read" collection-id "collection"]
                                               ["dashboard/read" dashboard-id "dashboard"]
                                               ["dashboard/query" dashboard-id "dashboard"]]]
      (testing action-type
        (let [response (mt/user-http-request :crowberto :get 200 "ee/permission_debug"
                                             :user_id (str (mt/user->id :rasta))
                                             :model_id (str model-id)
                                             :action_type action-type)]
          (is (= model-type (:model-type response)))
          (is (= "allow" (:decision response)))
          (is (= "allowed" (:outcome response)))
          (is (= collection-id (-> response :reasons :collection :collection-id))))))))

(defn- access
  [user-id]
  (request/with-current-user (mt/user->id :crowberto)
    (permission-debug.reasons/access-reasons user-id)))

(defn- collection-entry
  [result collection-name]
  (some #(when (= collection-name (:name %)) %) (:collections result)))

(deftest access-lists-every-collection-the-person-could-be-given-test
  (mt/with-temp [:model/PermissionsGroup {sales-id :id :as sales} {:name "Sales"}
                 :model/User {user-id :id} {}
                 :model/User {other-id :id} {}
                 :model/PermissionsGroupMembership _ {:user_id user-id :group_id (:id (perms/all-users-group))}
                 :model/PermissionsGroupMembership _ {:user_id user-id :group_id sales-id}
                 :model/Collection open {:name "Access test open"}
                 :model/Collection hidden {:name "Access test hidden"}
                 :model/Collection archived {:name "Access test archived" :archived true}
                 :model/Collection _ {:name "Access test child" :location (collection/children-location open)}]
    (perms/revoke-collection-permissions! (perms/all-users-group) open)
    (perms/revoke-collection-permissions! (perms/all-users-group) hidden)
    (perms/grant-collection-readwrite-permissions! sales open)
    (let [own-personal   (collection/user->personal-collection user-id)
          other-personal (collection/user->personal-collection other-id)
          result         (access user-id)]
      (testing "a collection the person can open names the group that gives the access"
        (let [entry (collection-entry result "Access test open")]
          (is (= "curate" (:value entry)))
          (is (= "/" (:location entry)))
          (is (= ["Sales"] (->> (:groups entry) (filter :applies?) (map :group-name))))))
      (testing "a collection nobody gives the person access to is listed with no access"
        (is (= "none" (:value (collection-entry result "Access test hidden")))))
      (testing "a subcollection carries its location, so the root's children can be told apart"
        (is (= (collection/children-location open) (:location (collection-entry result "Access test child")))))
      (testing "the person's own personal collection is listed, curated by rule and marked personal"
        (let [entry (some #(when (= (:id own-personal) (:collection-id %)) %) (:collections result))]
          (is (true? (:personal? entry)))
          (is (= "curate" (:value entry)))
          (is (true? (:by-rule entry)))))
      (testing "another person's personal collection and an archived collection are left out"
        (is (not-any? #(= (:id other-personal) (:collection-id %)) (:collections result)))
        (is (nil? (collection-entry result (:name archived))))))))

(deftest access-lists-every-table-the-same-way-as-a-query-check-test
  (mt/with-no-data-perms-for-all-users!
    (mt/with-temp [:model/User {user-id :id} {}
                   :model/PermissionsGroupMembership _ {:user_id user-id :group_id (:id (perms/all-users-group))}]
      (perms/set-table-permission! (perms/all-users-group) (mt/id :venues) :perms/view-data :unrestricted)
      (perms/set-table-permission! (perms/all-users-group) (mt/id :checkins) :perms/view-data :blocked)
      (let [result (access user-id)]
        (testing "a table the person can view is listed with the groups that give it"
          (is (= "unrestricted" (-> (table-entry result "VENUES") :view-data :value))))
        (testing "a table blocked for the person is listed as blocked"
          (is (= "blocked" (-> (table-entry result "CHECKINS") :view-data :value))))
        (testing "tables of the same database are all there, not only the ones a query reads"
          (is (<= 4 (count (-> result :reasons :tables)))))))))
