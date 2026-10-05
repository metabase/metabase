(ns metabase-enterprise.mcp.api.permissions-test
  (:require
   [clojure.test :refer [deftest is testing use-fixtures]]
   [metabase-enterprise.mcp.permissions]
   [metabase-enterprise.mcp.test-util :as mcp.tu]
   [metabase.mcp.v2.api]
   [metabase.mcp.v2.registry :as registry]
   [metabase.mcp.v2.test-util :as v2.tu]
   [metabase.permissions.core :as perms]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db :test-users))

(def ^:private endpoint "ee/ai-controls/mcp-permissions")

(defn- group-permission
  "The `:permissions` entry a response reports for `group-id`."
  [response group-id]
  (u/seek #(= (:group_id %) group-id) (:permissions response)))

(deftest ^:parallel get-permissions-requires-superuser-test
  (mt/with-premium-features #{:ai-controls}
    (is (= "You don't have permissions to do that."
           (mt/user-http-request :rasta :get 403 endpoint)))))

(deftest ^:parallel get-permissions-defaults-and-seeds-test
  (mt/with-premium-features #{:ai-controls}
    (mt/with-temp [:model/PermissionsGroup {group-id :id} {:name "Rowless Group"}]
      (let [response (mt/user-http-request :crowberto :get 200 endpoint)]
        (testing "a group with no row has no MCP access"
          (is (= {:group_id group-id :mcp_enabled false :tool_access {}}
                 (group-permission response group-id))))
        (testing "the migration enabled MCP for the magic groups with every tool at its default"
          (is (= {:group_id (u/the-id (perms/all-users-group)) :mcp_enabled true :tool_access {}}
                 (group-permission response (u/the-id (perms/all-users-group))))))
        (testing "the mode rides along"
          (is (boolean? (:advanced response))))))))

(deftest ^:parallel get-permissions-tool-catalog-test
  (mt/with-premium-features #{:ai-controls}
    (let [{:keys [tools]} (mt/user-http-request :crowberto :get 200 endpoint)]
      (is (=? {:name "execute_sql" :scope "agent:sql:run" :description string? :default_access "allowed"}
              (u/seek #(= (:name %) "execute_sql") tools)))
      (testing "a tool's author decides its default"
        (is (= "denied" (:default_access (u/seek #(= (:name %) "test_off_by_default") tools)))))
      (testing "sorted by scope then name, so the admin page can group tools by bucket without re-sorting"
        (is (= (sort-by (juxt :scope :name) tools) tools))))))

(deftest get-permissions-stored-row-test
  (mt/with-premium-features #{:ai-controls}
    (mcp.tu/with-group-level-mode
      (mt/with-temp [:model/PermissionsGroup    {group-id :id} {:name "Stored Group"}
                     :model/McpGroupPermission _              {:group_id    group-id
                                                               :mcp_enabled true
                                                               :tool_access {}}]
        (mcp.tu/store-stale-tool-access! group-id {"execute_sql" "no" "dodo" "yes"})
        (testing "entries come back as stored, a stale name included"
          (is (= {:group_id group-id :mcp_enabled true :tool_access {:execute_sql "no" :dodo "yes"}}
                 (group-permission (mt/user-http-request :crowberto :get 200 endpoint) group-id))))))))

(defn- do-with-renamed-tool!
  "Run `thunk` while `test_echo` also answers to the former name `test_ping`."
  [thunk]
  (v2.tu/do-with-temp-tool! (assoc (get @@#'registry/tools* "test_echo") :renamed-from ["test_ping"]) thunk))

(deftest get-permissions-presents-renamed-entry-under-current-name-test
  (mt/with-premium-features #{:ai-controls}
    (mcp.tu/with-group-level-mode
      (do-with-renamed-tool!
       (fn []
         (mt/with-temp [:model/PermissionsGroup    {former-id :id} {:name "Former Name Group"}
                        :model/PermissionsGroup    {both-id :id}   {:name "Both Names Group"}
                        :model/McpGroupPermission _               {:group_id    former-id
                                                                   :mcp_enabled true
                                                                   :tool_access {"test_ping" "no"}}
                        :model/McpGroupPermission _               {:group_id    both-id
                                                                   :mcp_enabled true
                                                                   :tool_access {"test_ping" "no" "test_echo" "yes"}}]
           (let [response (mt/user-http-request :crowberto :get 200 endpoint)]
             (testing "an entry stored under a former name is presented under the current one"
               (is (= {:test_echo "no"} (:tool_access (group-permission response former-id)))))
             (testing "the current name's own entry wins"
               (is (= {:test_echo "yes"} (:tool_access (group-permission response both-id))))))))))))

(deftest ^:parallel put-permissions-requires-superuser-test
  (mt/with-premium-features #{:ai-controls}
    (is (= "You don't have permissions to do that."
           (mt/user-http-request :rasta :put 403 endpoint
                                 {:permissions [{:group_id 1 :mcp_enabled true :tool_access {}}]})))))

(deftest put-permissions-upserts-test
  (mt/with-premium-features #{:ai-controls}
    (mcp.tu/with-group-level-mode
      (mt/with-temp [:model/PermissionsGroup    {group-a :id} {:name "Group A"}
                     :model/PermissionsGroup    {group-b :id} {:name "Group B"}
                     :model/McpGroupPermission _             {:group_id    group-b
                                                              :mcp_enabled false
                                                              :tool_access {"search" "no"}}]
        (let [response (mt/user-http-request :crowberto :put 200 endpoint
                                             {:permissions [{:group_id    group-a
                                                             :mcp_enabled true
                                                             :tool_access {"execute_sql"     "no"
                                                                           "question_write"  "yes"}}
                                                            {:group_id    group-b
                                                             :mcp_enabled true
                                                             :tool_access {}}]})]
          (testing "a group without a row gets one"
            (is (= {:group_id group-a :mcp_enabled true :tool_access {:execute_sql "no" :question_write "yes"}}
                   (group-permission response group-a))))
          (testing "a group with a row has it replaced wholesale, not duplicated or merged"
            (is (= {:group_id group-b :mcp_enabled true :tool_access {}}
                   (group-permission response group-b)))
            (is (= 1 (t2/count :model/McpGroupPermission :group_id group-b))))
          (testing "the response is the GET body"
            (is (= (mt/user-http-request :crowberto :get 200 endpoint) response))))))))

(deftest put-permissions-unknown-tool-test
  (mt/with-premium-features #{:ai-controls}
    (mcp.tu/with-group-level-mode
      (mt/with-temp [:model/PermissionsGroup {group-id :id} {:name "Group"}]
        (is (= "Unknown MCP tool: not_a_tool"
               (mt/user-http-request :crowberto :put 400 endpoint
                                     {:permissions [{:group_id    group-id
                                                     :mcp_enabled true
                                                     :tool_access {"not_a_tool" "no"}}]})))
        (testing "nothing was written"
          (is (not (t2/exists? :model/McpGroupPermission :group_id group-id))))))))

(deftest put-permissions-accepts-stored-stale-name-test
  (mt/with-premium-features #{:ai-controls}
    (mcp.tu/with-group-level-mode
      (mt/with-temp [:model/PermissionsGroup    {stale-id :id} {:name "Stale Group"}
                     :model/PermissionsGroup    {other-id :id} {:name "Other Group"}
                     :model/McpGroupPermission _              {:group_id    stale-id
                                                               :mcp_enabled true
                                                               :tool_access {}}]
        (mcp.tu/store-stale-tool-access! stale-id {"dodo" "no"})
        (testing "a name the group already stores is accepted, so an untouched stale entry never blocks a save"
          (is (= {:group_id stale-id :mcp_enabled false :tool_access {:dodo "no"}}
                 (group-permission (mt/user-http-request :crowberto :put 200 endpoint
                                                         {:permissions [{:group_id    stale-id
                                                                         :mcp_enabled false
                                                                         :tool_access {"dodo" "no"}}]})
                                   stale-id))))
        (testing "the same name is refused for a group that does not store it"
          (is (= "Unknown MCP tool: dodo"
                 (mt/user-http-request :crowberto :put 400 endpoint
                                       {:permissions [{:group_id    other-id
                                                       :mcp_enabled true
                                                       :tool_access {"dodo" "no"}}]}))))))))

(deftest put-permissions-accepts-former-name-test
  (mt/with-premium-features #{:ai-controls}
    (mcp.tu/with-group-level-mode
      (do-with-renamed-tool!
       (fn []
         (mt/with-temp [:model/PermissionsGroup {group-id :id} {:name "Group"}]
           (is (= {:group_id group-id :mcp_enabled true :tool_access {:test_echo "no"}}
                  (group-permission (mt/user-http-request :crowberto :put 200 endpoint
                                                          {:permissions [{:group_id    group-id
                                                                          :mcp_enabled true
                                                                          :tool_access {"test_ping" "no"}}]})
                                    group-id)))))))))

(deftest ^:parallel put-permissions-rejects-other-access-values-test
  (mt/with-premium-features #{:ai-controls}
    (mt/with-temp [:model/PermissionsGroup {group-id :id} {:name "Group"}]
      (is (=? {:errors {:permissions some?}}
              (mt/user-http-request :crowberto :put 400 endpoint
                                    {:permissions [{:group_id    group-id
                                                    :mcp_enabled true
                                                    :tool_access {"execute_sql" "maybe"}}]}))))))

(deftest ^:parallel put-permissions-unknown-group-test
  (mt/with-premium-features #{:ai-controls}
    (let [group-id Integer/MAX_VALUE]
      (is (= (str "Unknown group, or one the current permission mode hides: " group-id)
             (mt/user-http-request :crowberto :put 400 endpoint
                                   {:permissions [{:group_id    group-id
                                                   :mcp_enabled true
                                                   :tool_access {}}]}))))))

(deftest put-permissions-rejects-hidden-group-test
  (mt/with-premium-features #{:ai-controls}
    (mcp.tu/with-mcp-group-permissions-snapshot
      (mt/with-temp [:model/PermissionsGroup {group-id :id} {:name "Hidden Group"}]
        (let [all-users-id (u/the-id (perms/all-users-group))
              refusal      #(str "Unknown group, or one the current permission mode hides: " %)
              put!         (fn [group-id]
                             (mt/user-http-request :crowberto :put 400 endpoint
                                                   {:permissions [{:group_id    group-id
                                                                   :mcp_enabled true
                                                                   :tool_access {}}]}))]
          (testing "simple mode refuses a group it hides, so the row cannot go live unseen on the next switch"
            (is (= (refusal group-id) (put! group-id)))
            (is (not (t2/exists? :model/McpGroupPermission :group_id group-id))))
          (testing "group-level mode refuses All Users, whose row would switch the mode back"
            (mt/user-http-request :crowberto :post 200 "ee/ai-controls/mcp-permissions/advanced")
            (is (= (refusal all-users-id) (put! all-users-id)))
            (is (not (t2/exists? :model/McpGroupPermission :group_id all-users-id)))))))))

(deftest ^:parallel writes-require-ai-controls-feature-test
  (mt/with-premium-features #{}
    (testing "setting a group's policy"
      (mt/assert-has-premium-feature-error "AI Controls" (mt/user-http-request :crowberto :put 402 endpoint
                                                                               {:permissions []})))
    (testing "entering group-level mode"
      (mt/assert-has-premium-feature-error
       "AI Controls"
       (mt/user-http-request :crowberto :post 402 "ee/ai-controls/mcp-permissions/advanced")))))

(deftest ^:parallel get-permissions-without-ai-controls-feature-test
  (mt/with-premium-features #{}
    (testing "an admin can still read the policy the rows enforce"
      (is (=? {:advanced boolean? :tools seq :permissions seq}
              (mt/user-http-request :crowberto :get 200 endpoint))))))

(deftest disable-advanced-mode-without-ai-controls-feature-test
  (mcp.tu/with-group-level-mode
    (mt/with-premium-features #{}
      (testing "an admin who lost the feature in group-level mode can switch back to All Users"
        (let [all-users-id (u/the-id (perms/all-users-group))
              response     (mt/user-http-request :crowberto :delete 200 "ee/ai-controls/mcp-permissions/advanced")]
          (is (false? (:advanced response)))
          (is (= {:group_id all-users-id :mcp_enabled true :tool_access {}}
                 (group-permission response all-users-id))))))))

(deftest ^:parallel permissions-require-superuser-without-ai-controls-feature-test
  (mt/with-premium-features #{}
    (doseq [[method path body] [[:get    endpoint]
                                [:put    endpoint {:permissions []}]
                                [:post   "ee/ai-controls/mcp-permissions/advanced"]
                                [:delete "ee/ai-controls/mcp-permissions/advanced"]]]
      (testing (str method " " path)
        (is (= "You don't have permissions to do that."
               (apply mt/user-http-request :rasta method 403 path (when body [body]))))))))

(deftest enable-advanced-mode-test
  (mt/with-premium-features #{:ai-controls}
    (testing "POST /api/ee/ai-controls/mcp-permissions/advanced drops the rows of the simple-mode groups and enables
              Data Analysts"
      (mcp.tu/with-mcp-group-permissions-snapshot
        (t2/delete! :model/McpGroupPermission)
        (let [all-users-id    (u/the-id (perms/all-users-group))
              all-external-id (u/the-id (perms/all-external-users-group))
              data-analyst-id (u/the-id (perms/data-analyst-group))]
          (mt/with-temp [:model/McpGroupPermission _ {:group_id    all-users-id
                                                      :mcp_enabled true
                                                      :tool_access {}}
                         :model/McpGroupPermission _ {:group_id    all-external-id
                                                      :mcp_enabled true
                                                      :tool_access {}}]
            (let [response (mt/user-http-request :crowberto :post 200 "ee/ai-controls/mcp-permissions/advanced")]
              (is (true? (:advanced response)))
              (is (= #{data-analyst-id} (t2/select-fn-set :group_id :model/McpGroupPermission))
                  "only the groups group-level mode shows have rows")
              (is (= {:group_id all-users-id :mcp_enabled false :tool_access {}}
                     (group-permission response all-users-id)))
              (is (= {:group_id data-analyst-id :mcp_enabled true :tool_access {}}
                     (group-permission response data-analyst-id))
                  "Data Analysts is enabled with every tool at its default"))
            (testing "switching again keeps the admin's Data Analysts edits"
              (mt/user-http-request :crowberto :put 200 endpoint
                                    {:permissions [{:group_id    data-analyst-id
                                                    :mcp_enabled true
                                                    :tool_access {"search" "no"}}]})
              (is (= {:group_id data-analyst-id :mcp_enabled true :tool_access {:search "no"}}
                     (group-permission (mt/user-http-request :crowberto :post 200
                                                             "ee/ai-controls/mcp-permissions/advanced")
                                       data-analyst-id))))))))))

(deftest disable-advanced-mode-test
  (mt/with-premium-features #{:ai-controls}
    (testing "DELETE /api/ee/ai-controls/mcp-permissions/advanced drops the rows of every non-simple-mode group and
              enables All Users and All tenant users"
      (mcp.tu/with-mcp-group-permissions-snapshot
        (t2/delete! :model/McpGroupPermission)
        (let [all-users-id    (u/the-id (perms/all-users-group))
              all-external-id (u/the-id (perms/all-external-users-group))
              data-analyst-id (u/the-id (perms/data-analyst-group))]
          (mt/with-temp [:model/PermissionsGroup    {group-id :id} {:name "Specific Group"}
                         :model/McpGroupPermission _              {:group_id    data-analyst-id
                                                                   :mcp_enabled true
                                                                   :tool_access {"search" "no"}}
                         :model/McpGroupPermission _              {:group_id    group-id
                                                                   :mcp_enabled true
                                                                   :tool_access {}}]
            (let [response (mt/user-http-request :crowberto :delete 200 "ee/ai-controls/mcp-permissions/advanced")]
              (is (false? (:advanced response)))
              (is (= #{all-users-id all-external-id} (t2/select-fn-set :group_id :model/McpGroupPermission))
                  "only the groups simple mode enables have rows")
              (is (= {:group_id all-users-id :mcp_enabled true :tool_access {}}
                     (group-permission response all-users-id))
                  "All Users is back to MCP on with every tool at its default")
              (is (= {:group_id all-external-id :mcp_enabled true :tool_access {}}
                     (group-permission response all-external-id))
                  "All tenant users is seeded too"))))))))

(deftest rows-of-both-modes-never-coexist-test
  (mcp.tu/with-mcp-group-permissions-snapshot
    (t2/delete! :model/McpGroupPermission)
    (mt/with-temp [:model/PermissionsGroup {group-id :id} {:name "Group"}]
      (let [all-users-id (u/the-id (perms/all-users-group))
            admin-id     (u/the-id (perms/admin-group))
            insert!      #(t2/insert! :model/McpGroupPermission {:group_id % :mcp_enabled true :tool_access {}})]
        (testing "while All Users has a row, no other group but Administrators gets one"
          (insert! all-users-id)
          (is (thrown-with-msg? clojure.lang.ExceptionInfo #"while All Users has one" (insert! group-id)))
          (insert! admin-id))
        (testing "while another group has a row, All Users gets none"
          (t2/delete! :model/McpGroupPermission :group_id all-users-id)
          (insert! group-id)
          (is (thrown-with-msg? clojure.lang.ExceptionInfo #"while groups have their own" (insert! all-users-id))))))))
