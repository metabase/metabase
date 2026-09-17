(ns metabase-enterprise.mcp.api.permissions-test
  (:require
   [clojure.test :refer [deftest is testing use-fixtures]]
   [metabase-enterprise.mcp.permissions]
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

(deftest ^:parallel get-permissions-stored-row-test
  (mt/with-premium-features #{:ai-controls}
    (mt/with-temp [:model/PermissionsGroup    {group-id :id} {:name "Stored Group"}
                   :model/McpGroupPermission _              {:group_id    group-id
                                                             :mcp_enabled true
                                                             :tool_access {"execute_sql" "no" "dodo" "yes"}}]
      (testing "entries come back as stored, a stale name included"
        (is (= {:group_id group-id :mcp_enabled true :tool_access {:execute_sql "no" :dodo "yes"}}
               (group-permission (mt/user-http-request :crowberto :get 200 endpoint) group-id)))))))

(defn- do-with-renamed-tool!
  "Run `thunk` while `test_echo` also answers to the former name `test_ping`."
  [thunk]
  (v2.tu/do-with-temp-tool! (assoc (get @@#'registry/tools* "test_echo") :renamed-from ["test_ping"]) thunk))

(deftest get-permissions-presents-renamed-entry-under-current-name-test
  (mt/with-premium-features #{:ai-controls}
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
             (is (= {:test_echo "yes"} (:tool_access (group-permission response both-id)))))))))))

(deftest ^:parallel put-permissions-requires-superuser-test
  (mt/with-premium-features #{:ai-controls}
    (is (= "You don't have permissions to do that."
           (mt/user-http-request :rasta :put 403 endpoint
                                 {:permissions [{:group_id 1 :mcp_enabled true :tool_access {}}]})))))

(deftest ^:parallel put-permissions-upserts-test
  (mt/with-premium-features #{:ai-controls}
    (mt/with-temp [:model/PermissionsGroup    {group-a :id} {:name "Group A"}
                   :model/PermissionsGroup    {group-b :id} {:name "Group B"}
                   :model/McpGroupPermission _             {:group_id    group-b
                                                            :mcp_enabled false
                                                            :tool_access {"search" "no"}}]
      (let [response (mt/user-http-request :crowberto :put 200 endpoint
                                           {:permissions [{:group_id    group-a
                                                           :mcp_enabled true
                                                           :tool_access {"execute_sql"     "no"
                                                                         "transform_write" "yes"}}
                                                          {:group_id    group-b
                                                           :mcp_enabled true
                                                           :tool_access {}}]})]
        (testing "a group without a row gets one"
          (is (= {:group_id group-a :mcp_enabled true :tool_access {:execute_sql "no" :transform_write "yes"}}
                 (group-permission response group-a))))
        (testing "a group with a row has it replaced wholesale, not duplicated or merged"
          (is (= {:group_id group-b :mcp_enabled true :tool_access {}}
                 (group-permission response group-b)))
          (is (= 1 (t2/count :model/McpGroupPermission :group_id group-b))))
        (testing "the response is the GET body"
          (is (= (mt/user-http-request :crowberto :get 200 endpoint) response)))))))

(deftest ^:parallel put-permissions-unknown-tool-test
  (mt/with-premium-features #{:ai-controls}
    (mt/with-temp [:model/PermissionsGroup {group-id :id} {:name "Group"}]
      (is (= "Unknown MCP tool: not_a_tool"
             (mt/user-http-request :crowberto :put 400 endpoint
                                   {:permissions [{:group_id    group-id
                                                   :mcp_enabled true
                                                   :tool_access {"not_a_tool" "no"}}]})))
      (testing "nothing was written"
        (is (not (t2/exists? :model/McpGroupPermission :group_id group-id)))))))

(deftest ^:parallel put-permissions-accepts-stored-stale-name-test
  (mt/with-premium-features #{:ai-controls}
    (mt/with-temp [:model/PermissionsGroup    {stale-id :id} {:name "Stale Group"}
                   :model/PermissionsGroup    {other-id :id} {:name "Other Group"}
                   :model/McpGroupPermission _              {:group_id    stale-id
                                                             :mcp_enabled true
                                                             :tool_access {"dodo" "no"}}]
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
                                                     :tool_access {"dodo" "no"}}]})))))))

(deftest put-permissions-accepts-former-name-test
  (mt/with-premium-features #{:ai-controls}
    (do-with-renamed-tool!
     (fn []
       (mt/with-temp [:model/PermissionsGroup {group-id :id} {:name "Group"}]
         (is (= {:group_id group-id :mcp_enabled true :tool_access {:test_echo "no"}}
                (group-permission (mt/user-http-request :crowberto :put 200 endpoint
                                                        {:permissions [{:group_id    group-id
                                                                        :mcp_enabled true
                                                                        :tool_access {"test_ping" "no"}}]})
                                  group-id))))))))

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
      (is (= (str "Unknown group: " group-id)
             (mt/user-http-request :crowberto :put 400 endpoint
                                   {:permissions [{:group_id    group-id
                                                   :mcp_enabled true
                                                   :tool_access {}}]}))))))

(deftest ^:parallel permissions-require-ai-controls-feature-test
  (mt/with-premium-features #{}
    (mt/assert-has-premium-feature-error "AI Controls" (mt/user-http-request :crowberto :get 402 endpoint))
    (mt/assert-has-premium-feature-error "AI Controls" (mt/user-http-request :crowberto :put 402 endpoint
                                                                             {:permissions []}))))

(defn- do-with-mcp-group-permissions-snapshot!
  "Run `thunk`, then restore every `mcp_group_permission` row to its prior state."
  [thunk]
  (let [snapshot (t2/select :model/McpGroupPermission)]
    (try
      (thunk)
      (finally
        (t2/delete! :model/McpGroupPermission)
        (when (seq snapshot)
          (t2/insert! :model/McpGroupPermission
                      (map #(select-keys % [:group_id :mcp_enabled :tool_access]) snapshot)))))))

(defmacro ^:private with-mcp-group-permissions-snapshot
  [& body]
  `(do-with-mcp-group-permissions-snapshot! (fn [] ~@body)))

(deftest enable-advanced-mode-deletes-hidden-mcp-rows-test
  (mt/with-premium-features #{:ai-controls}
    (testing "POST /api/ee/ai-controls/mcp-permissions/advanced drops the rows of the simple-mode groups"
      (with-mcp-group-permissions-snapshot
        (t2/delete! :model/McpGroupPermission)
        (let [all-users-id    (u/the-id (perms/all-users-group))
              all-external-id (u/the-id (perms/all-external-users-group))]
          (mt/with-temporary-setting-values [mcp-advanced-permissions false]
            (mt/with-temp [:model/PermissionsGroup    {group-id :id} {:name "Other Group"}
                           :model/McpGroupPermission _              {:group_id    all-users-id
                                                                     :mcp_enabled true
                                                                     :tool_access {}}
                           :model/McpGroupPermission _              {:group_id    all-external-id
                                                                     :mcp_enabled true
                                                                     :tool_access {}}
                           :model/McpGroupPermission _              {:group_id    group-id
                                                                     :mcp_enabled true
                                                                     :tool_access {"execute_sql" "no"}}]
              (mt/user-http-request :crowberto :post 200 "ee/ai-controls/mcp-permissions/advanced")
              (is (= #{group-id} (t2/select-fn-set :group_id :model/McpGroupPermission))
                  "only the groups group-level mode shows keep their rows")
              (let [response (mt/user-http-request :crowberto :get 200 endpoint)]
                (is (true? (:advanced response)))
                (is (= {:group_id all-users-id :mcp_enabled false :tool_access {}}
                       (group-permission response all-users-id)))))))))))

(deftest disable-advanced-mode-restores-the-seeded-rows-test
  (mt/with-premium-features #{:ai-controls}
    (testing "DELETE /api/ee/ai-controls/mcp-permissions/advanced drops the rows of every non-simple-mode group and
              puts All Users, Data Analysts and All tenant users back in the seeded state"
      (with-mcp-group-permissions-snapshot
        (t2/delete! :model/McpGroupPermission)
        (let [all-users-id    (u/the-id (perms/all-users-group))
              all-external-id (u/the-id (perms/all-external-users-group))
              data-analyst-id (u/the-id (perms/data-analyst-group))]
          (mt/with-temporary-setting-values [mcp-advanced-permissions true]
            (mt/with-temp [:model/PermissionsGroup    {group-id :id} {:name "Specific Group"}
                           :model/McpGroupPermission _              {:group_id    all-users-id
                                                                     :mcp_enabled false
                                                                     :tool_access {"execute_sql" "no"}}
                           :model/McpGroupPermission _              {:group_id    data-analyst-id
                                                                     :mcp_enabled true
                                                                     :tool_access {"search" "no"}}
                           :model/McpGroupPermission _              {:group_id    group-id
                                                                     :mcp_enabled true
                                                                     :tool_access {}}]
              (let [response (mt/user-http-request :crowberto :delete 200 "ee/ai-controls/mcp-permissions/advanced")]
                (is (= #{all-users-id all-external-id data-analyst-id}
                       (t2/select-fn-set :group_id :model/McpGroupPermission))
                    "only the seeded groups have rows")
                (is (= {:group_id all-users-id :mcp_enabled true :tool_access {}}
                       (group-permission response all-users-id))
                    "All Users is back to MCP on with every tool at its default")
                (is (= {:group_id all-external-id :mcp_enabled true :tool_access {}}
                       (group-permission response all-external-id))
                    "All tenant users, which had no row, is seeded too")
                (is (= {:group_id data-analyst-id :mcp_enabled true :tool_access {}}
                       (t2/select-one [:model/McpGroupPermission :group_id :mcp_enabled :tool_access]
                                      :group_id data-analyst-id))
                    "Data Analysts, hidden in simple mode, is reseeded so the next switch shows it as the migration did")))))))))

(deftest mode-switch-rejected-under-env-var-test
  (mt/with-premium-features #{:ai-controls}
    (testing "the /advanced endpoints refuse to switch modes while an env var forces the setting"
      (with-mcp-group-permissions-snapshot
        (mt/with-temp [:model/PermissionsGroup    {group-id :id} {:name "Specific Group"}
                       :model/McpGroupPermission _              {:group_id    group-id
                                                                 :mcp_enabled true
                                                                 :tool_access {}}]
          (mt/with-temp-env-var-value! [mb-mcp-advanced-permissions "true"]
            (let [msg "The permission mode is set by the MB_MCP_ADVANCED_PERMISSIONS environment variable."]
              (is (= msg (mt/user-http-request :crowberto :delete 400 "ee/ai-controls/mcp-permissions/advanced")))
              (is (= msg (mt/user-http-request :crowberto :post 400 "ee/ai-controls/mcp-permissions/advanced"))))
            (is (t2/exists? :model/McpGroupPermission :group_id group-id)
                "no rows are deleted by the refused switch")))))))
