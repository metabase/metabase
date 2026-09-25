(ns metabase.mcp.permissions-test
  "Per-group MCP tool access as the resolver, the v2 registry and the transport's `initialize` enforce it. The
  policy is stubbed here; how it is collected from group rows is `metabase-enterprise.mcp.permissions-test`."
  (:require
   [clojure.set :as set]
   [clojure.test :refer :all]
   [metabase.api.common :as api]
   [metabase.mcp.permissions :as mcp.perms]
   [metabase.mcp.v2.api :as v2.api]
   [metabase.mcp.v2.common :as common]
   [metabase.mcp.v2.message :as message]
   [metabase.mcp.v2.registry :as registry]
   [metabase.mcp.v2.resources :as v2.resources]
   [metabase.mcp.v2.test-util]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

(def ^:private no-access-policy
  [])

(def ^:private allowed-by-default
  {:name "hummingbird" :default-access :allowed})

(def ^:private denied-by-default
  {:name "shrike" :default-access :denied})

(def ^:private renamed-tool
  {:name "kestrel" :default-access :denied :renamed-from ["sparrowhawk"]})

(defn- listed-tool-names
  "The names `tools/list` returns for the current user."
  []
  (into #{} (map :name) (registry/list-tools)))

(deftest ^:parallel default-access-applies-without-an-entry-test
  (testing "default allowed with no entry"
    (is (true? (mcp.perms/tool-allowed? [{}] allowed-by-default))))
  (testing "default denied with no entry"
    (is (false? (mcp.perms/tool-allowed? [{}] denied-by-default)))))

(deftest ^:parallel explicit-entry-beats-default-test
  (testing "explicit no beats default allowed"
    (is (false? (mcp.perms/tool-allowed? [{"hummingbird" "no"}] allowed-by-default))))
  (testing "explicit yes beats default denied"
    (is (true? (mcp.perms/tool-allowed? [{"shrike" "yes"}] denied-by-default)))))

(deftest ^:parallel any-group-allowing-wins-test
  (testing "yes in one group beats no in another"
    (is (true? (mcp.perms/tool-allowed? [{"hummingbird" "no"} {"hummingbird" "yes"}] allowed-by-default))))
  (testing "an untouched group's default allowed beats another group's explicit no"
    (is (true? (mcp.perms/tool-allowed? [{"hummingbird" "no"} {}] allowed-by-default))))
  (testing "every group saying no denies"
    (is (false? (mcp.perms/tool-allowed? [{"hummingbird" "no"} {"hummingbird" "no"}] allowed-by-default)))))

(deftest ^:parallel stale-and-renamed-entries-test
  (testing "a stale name is inert"
    (is (true? (mcp.perms/tool-allowed? [{"dodo" "no"}] allowed-by-default)))
    (is (false? (mcp.perms/tool-allowed? [{"dodo" "yes"}] denied-by-default))))
  (testing "a :renamed-from name carries the entry"
    (is (true? (mcp.perms/tool-allowed? [{"sparrowhawk" "yes"}] renamed-tool))))
  (testing "the current name's own entry wins over a former name's"
    (is (false? (mcp.perms/tool-allowed? [{"kestrel" "no" "sparrowhawk" "yes"}] renamed-tool)))))

(deftest ^:parallel unrestricted-and-no-access-policies-test
  (is (true? (mcp.perms/tool-allowed? mcp.perms/unrestricted-policy denied-by-default)))
  (is (true? (mcp.perms/enabled? mcp.perms/unrestricted-policy)))
  (testing "no enabled group allows nothing, whatever the defaults"
    (is (false? (mcp.perms/tool-allowed? no-access-policy allowed-by-default)))
    (is (false? (mcp.perms/enabled? no-access-policy))))
  (testing "an enabled group with no overrides enables the connection"
    (is (true? (mcp.perms/enabled? [{}])))))

(deftest ^:parallel oss-fallback-allows-everything-test
  (mt/with-premium-features #{}
    (mt/with-current-user (mt/user->id :rasta)
      (is (= mcp.perms/unrestricted-policy (mcp.perms/policy-for-current-user)))
      (is (set/subset? #{"test_echo" "test_off_by_default"} (listed-tool-names))))))

(deftest ^:parallel superuser-and-internal-callers-bypass-test
  (mt/with-dynamic-fn-redefs [mcp.perms/effective-policy (constantly no-access-policy)]
    (testing "a superuser is never narrowed by group policy"
      (mt/with-current-user (mt/user->id :crowberto)
        (is (= mcp.perms/unrestricted-policy (mcp.perms/policy-for-current-user)))))
    (testing "an internal caller with no current user is unrestricted"
      (binding [api/*current-user-id* nil]
        (is (= mcp.perms/unrestricted-policy (mcp.perms/policy-for-current-user)))))
    (testing "an ordinary user gets the resolved policy"
      (mt/with-current-user (mt/user->id :rasta)
        (is (= no-access-policy (mcp.perms/policy-for-current-user)))))))

(deftest ^:parallel denied-tool-is-hidden-and-refused-test
  (mt/with-dynamic-fn-redefs [mcp.perms/effective-policy (constantly [{"test_echo" "no"}])]
    (mt/with-current-user (mt/user->id :rasta)
      (testing "tools/list hides the explicitly denied tool and the tool denied by default, and only those"
        (is (= #{"test_echo" "test_off_by_default"}
               (set/difference (binding [api/*current-user-id* nil] (listed-tool-names))
                               (listed-tool-names)))))
      (testing "the keepalive hash sees the narrower list, so an open stream learns of the change"
        (is (not= (registry/tools-hash)
                  (binding [api/*current-user-id* nil] (registry/tools-hash)))))
      (testing "tools/call refuses the denied tool and names the fix"
        (let [{:keys [error]} (registry/call-tool nil nil "test_echo" {})]
          (is (= common/error-code-invalid-request (:code error)))
          (is (= (str "Tool \"test_echo\" is not enabled for your groups. "
                      "Ask an administrator to enable it under Admin > AI > Usage controls > MCP tools access.")
                 (message/render (:message error))))))
      (testing "tools/call refuses the tool denied by default"
        (is (= common/error-code-invalid-request
               (get-in (registry/call-tool nil nil "test_off_by_default" {}) [:error :code])))))))

(deftest ^:parallel allowed-tool-dispatches-test
  (mt/with-dynamic-fn-redefs [mcp.perms/effective-policy (constantly [{"test_off_by_default" "yes"}])]
    (mt/with-current-user (mt/user->id :rasta)
      (testing "a tool at its default allowed dispatches"
        (is (= {:ok true :message "pong"}
               (get-in (registry/call-tool nil nil "test_echo" {}) [:result :structuredContent]))))
      (testing "an explicit yes lists and dispatches a tool denied by default"
        (is (contains? (listed-tool-names) "test_off_by_default"))
        (is (= {:ok true}
               (get-in (registry/call-tool nil nil "test_off_by_default" {}) [:result :structuredContent])))))))

(deftest ^:parallel disabled-policy-hides-every-tool-test
  (mt/with-dynamic-fn-redefs [mcp.perms/effective-policy (constantly no-access-policy)]
    (mt/with-current-user (mt/user->id :rasta)
      (is (empty? (listed-tool-names)))
      (is (= common/error-code-invalid-request
             (get-in (registry/call-tool nil nil "test_echo" {}) [:error :code]))))))

(deftest ^:parallel initialize-is-refused-when-mcp-is-disabled-test
  (mt/with-dynamic-fn-redefs [mcp.perms/effective-policy (constantly no-access-policy)]
    (let [initialize {:jsonrpc "2.0" :method "initialize" :params {} :id 1}]
      (testing "the handshake names the fix instead of handing out an empty tool list"
        (is (= {:jsonrpc "2.0"
                :id      1
                :error   {:code    common/error-code-invalid-request
                          :message (str "MCP access is not enabled for your account. "
                                        "Ask an administrator to enable it under Admin > AI > Usage controls > MCP tools access.")}}
               (mt/user-http-request :rasta :post 403 "metabase-mcp" initialize))))
      (testing "a superuser still connects"
        (is (=? {:result {:protocolVersion string?}}
                (mt/user-http-request :crowberto :post 200 "metabase-mcp" initialize)))))))

(deftest ^:parallel app-only-tool-follows-the-ui-tools-test
  (mt/with-current-user (mt/user->id :rasta)
    (testing "refresh_ui_credential is not on the admin's grid, so an entry stored for it is ignored while a UI tool
              is allowed"
      (mt/with-dynamic-fn-redefs [mcp.perms/effective-policy (constantly [{"refresh_ui_credential" "no"}])]
        (is (contains? (listed-tool-names) "refresh_ui_credential"))))
    (testing "it is hidden and refused once every UI tool is denied"
      (mt/with-dynamic-fn-redefs [mcp.perms/effective-policy (constantly [{"visualize_query"      "no"
                                                                           "render_drill_through" "no"}])]
        (is (not (contains? (listed-tool-names) "refresh_ui_credential")))
        (is (= common/error-code-invalid-request
               (get-in (registry/call-tool nil nil "refresh_ui_credential" {}) [:error :code])))))))

(deftest ^:parallel resources-read-is-refused-when-mcp-is-disabled-test
  (let [read-fields #(#'v2.api/handle-resources-read 1 {:uri v2.resources/fields-catalog-uri} nil nil)]
    (mt/with-dynamic-fn-redefs [mcp.perms/effective-policy (constantly no-access-policy)]
      (testing "a session opened before an admin turned MCP off reads nothing"
        (mt/with-current-user (mt/user->id :rasta)
          (is (=? {:error {:code common/error-code-invalid-request}}
                  (read-fields)))))
      (testing "a superuser still reads"
        (mt/with-current-user (mt/user->id :crowberto)
          (is (=? {:result {:contents seq}}
                  (read-fields))))))))
