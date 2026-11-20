(ns metabase.mcp.settings-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [clojure.test.check.clojure-test :refer [defspec]]
   [clojure.test.check.generators :as gen]
   [clojure.test.check.properties :as prop]
   [metabase.mcp.settings :as mcp.settings]
   [metabase.mcp.usage :as mcp.usage]
   [metabase.settings.core :as setting]
   [metabase.startup.core :as startup]
   [metabase.test :as mt]
   [metabase.util :as u]))

(deftest mcp-apps-cors-custom-origins-path-validation-test
  (testing "Should reject an origin with a real path (#75839)"
    (mt/with-temporary-setting-values [mcp.settings/mcp-apps-cors-custom-origins ""]
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"CORS origins must not include a path"
           (mcp.settings/mcp-apps-cors-custom-origins! "http://localhost:6274/sse")))
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"CORS origins must not include a path"
           (mcp.settings/mcp-apps-cors-custom-origins! "http://localhost:6274 https://example.com/path")))
      (testing "the setting is left unchanged after a rejected save"
        (is (= "" (mcp.settings/mcp-apps-cors-custom-origins))))))
  (testing "Should accept a bare trailing slash"
    (mt/with-temporary-setting-values [mcp.settings/mcp-apps-cors-custom-origins ""]
      (mcp.settings/mcp-apps-cors-custom-origins! "http://localhost:6274/")
      (is (= "http://localhost:6274/" (mcp.settings/mcp-apps-cors-custom-origins)))))
  (testing "Should accept an origin with no path at all"
    (mt/with-temporary-setting-values [mcp.settings/mcp-apps-cors-custom-origins ""]
      (mcp.settings/mcp-apps-cors-custom-origins! "http://localhost:6274 electron://example.com")
      (is (= "http://localhost:6274 electron://example.com" (mcp.settings/mcp-apps-cors-custom-origins))))))

(deftest mcp-query-handle-ttl-hours-must-be-positive-test
  (testing "a non-positive TTL is rejected on write. The GC deletes handles created before
            `now - ttl`, so 0 makes the cutoff *now* and wipes every stored handle on the next run,
            and a negative pushes the cutoff into the future and takes handles minted seconds ago."
    (mt/with-temporary-setting-values [mcp.settings/mcp-query-handle-ttl-hours 24]
      (doseq [bad [0 -1 "0"]]
        (testing (str "rejects " (pr-str bad))
          (is (thrown? Throwable (mcp.settings/mcp-query-handle-ttl-hours! bad)))))
      (testing "the setting is left unchanged after a rejected save"
        (is (= 24 (mcp.settings/mcp-query-handle-ttl-hours))))))
  (testing "positive values are accepted, including a string one"
    (mt/with-temporary-setting-values [mcp.settings/mcp-query-handle-ttl-hours 24]
      (mcp.settings/mcp-query-handle-ttl-hours! 1)
      (is (= 1 (mcp.settings/mcp-query-handle-ttl-hours)))
      (mcp.settings/mcp-query-handle-ttl-hours! "48")
      (is (= 48 (mcp.settings/mcp-query-handle-ttl-hours))))))

(deftest mcp-query-handle-ttl-hours-ignores-a-non-positive-stored-value-test
  (testing "a non-positive value that reached storage without passing through the setter — an env
            var is read straight through `get-raw-value` and never sees one — is not returned. The
            `:positive-integer` type's read predicate rejects it, yielding nil, and the getter falls
            back to the default — so the GC is never handed a cutoff of *now*, nor a nil it would
            `(long nil)` on."
    (mt/with-temporary-setting-values [mcp.settings/mcp-query-handle-ttl-hours 24]
      (doseq [bad ["0" "-5"]]
        (testing (str "stored " (pr-str bad))
          (setting/set-value-of-type! :string :mcp-query-handle-ttl-hours bad)
          (is (= 24 (mcp.settings/mcp-query-handle-ttl-hours)))))
      (testing "an unparseable stored value (e.g. MB_MCP_QUERY_HANDLE_TTL_HOURS=forever) takes the
                throw path in the getter, not the nil path — it must fall back rather than kill the
                GC task on every run"
        (setting/set-value-of-type! :string :mcp-query-handle-ttl-hours "forever")
        (is (= 24 (mcp.settings/mcp-query-handle-ttl-hours)))))))

(deftest inline-ui-enabled-for-client-test
  (mt/with-temporary-setting-values [mcp.settings/mcp-apps-cors-enabled-clients ["claude"]]
    (testing "a client with its toggle on may render UI"
      (is (true? (mcp.settings/inline-ui-enabled-for-client? "claude"))))
    (testing "a client with its toggle off may not"
      (is (false? (mcp.settings/inline-ui-enabled-for-client? "chatgpt")))
      (is (false? (mcp.settings/inline-ui-enabled-for-client? "cursor-vscode"))))
    (testing "VS Code follows the Cursor toggle"
      (is (false? (mcp.settings/inline-ui-enabled-for-client? "vscode")))
      (mt/with-temporary-setting-values [mcp.settings/mcp-apps-cors-enabled-clients ["cursor-vscode"]]
        (is (true? (mcp.settings/inline-ui-enabled-for-client? "vscode")))))
    (testing "a client with no toggle is not gated"
      (is (true? (mcp.settings/inline-ui-enabled-for-client? "other"))))))

(deftest mcp-apps-cors-enabled-clients-env-var-test
  (testing "an env var skips the setter, so the getter accepts aliases, case and spaces, and drops unknown entries"
    (mt/with-temp-env-var-value! [mb-mcp-apps-cors-enabled-clients "Claude, vscode,cursor,zed,"]
      (is (= ["claude" "cursor-vscode"] (mcp.settings/mcp-apps-cors-enabled-clients)))
      (is (= "https://*.claudemcpcontent.com" (mcp.settings/mcp-apps-cors-origins)))
      (is (true? (mcp.settings/inline-ui-enabled-for-client? "vscode")))
      (is (false? (mcp.settings/inline-ui-enabled-for-client? "chatgpt"))))))

(deftest mcp-apps-cors-enabled-clients-unparsable-value-test
  (testing "the setting is read on every HTTP response, so an unparsable stored value means no clients, not a throw"
    (mt/with-temporary-setting-values [mcp.settings/mcp-apps-cors-enabled-clients nil]
      (setting/set-value-of-type! :string :mcp-apps-cors-enabled-clients "claude,\"chatgpt")
      (is (= [] (mcp.settings/mcp-apps-cors-enabled-clients))))))

(deftest mcp-apps-cors-enabled-clients-setter-test
  (mt/with-temporary-setting-values [mcp.settings/mcp-apps-cors-enabled-clients nil]
    (testing "stores the canonical keys, from a list or a CSV string"
      (mcp.settings/mcp-apps-cors-enabled-clients! ["claude" "VSCode" "cursor"])
      (is (= "claude,cursor-vscode" (setting/get-value-of-type :string :mcp-apps-cors-enabled-clients)))
      (mcp.settings/mcp-apps-cors-enabled-clients! "chatgpt, cursor-vscode")
      (is (= ["chatgpt" "cursor-vscode"] (mcp.settings/mcp-apps-cors-enabled-clients))))
    (testing "rejects an unknown client, naming it and the accepted values"
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"Unknown MCP clients: zed\. Accepted values: claude, chatgpt, cursor-vscode, cursor, vscode\."
           (mcp.settings/mcp-apps-cors-enabled-clients! ["claude" "zed"]))))
    (testing "rejects a malformed CSV string"
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"Invalid comma-separated value\."
           (mcp.settings/mcp-apps-cors-enabled-clients! "claude,\"chatgpt"))))
    (testing "rejects a string of several lines, of which only the first would be read"
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"Put comma-separated values on one line\."
           (mcp.settings/mcp-apps-cors-enabled-clients! "claude\nchatgpt"))))
    (testing "rejects a value that is neither a list nor a string with a 400"
      (doseq [bad [5 true :claude {"claude" 1}]]
        (testing (pr-str bad)
          (is (= {:status-code 400}
                 (try
                   (mcp.settings/mcp-apps-cors-enabled-clients! bad)
                   nil
                   (catch clojure.lang.ExceptionInfo e
                     (ex-data e))))))))
    (testing "the setting is left unchanged after a rejected save"
      (is (= ["chatgpt" "cursor-vscode"] (mcp.settings/mcp-apps-cors-enabled-clients))))
    (testing "an empty list resets the setting"
      (mcp.settings/mcp-apps-cors-enabled-clients! [])
      (is (nil? (setting/get-value-of-type :string :mcp-apps-cors-enabled-clients)))
      (is (= [] (mcp.settings/mcp-apps-cors-enabled-clients))))))

(deftest warn-about-unknown-mcp-apps-cors-enabled-clients-test
  (letfn [(warnings []
            ;; The warning about later lines comes from the settings module.
            (mt/with-log-messages-for-level [mcp-messages [metabase.mcp.settings :warn]]
              (mt/with-log-messages-for-level [setting-messages [metabase.settings.models.setting :warn]]
                (startup/def-startup-logic! ::mcp.settings/warn-about-unknown-mcp-apps-cors-enabled-clients)
                (mapv :message (concat (mcp-messages) (setting-messages))))))]
    (testing "names the env var, the ignored entries and the accepted values"
      (mt/with-temp-env-var-value! [mb-mcp-apps-cors-enabled-clients "claude,zed,copilot"]
        (is (= [(str "Ignoring unknown MCP clients in MB_MCP_APPS_CORS_ENABLED_CLIENTS: zed, copilot. "
                     "Accepted values: claude, chatgpt, cursor-vscode, cursor, vscode.")]
               (warnings)))))
    (testing "says when the value cannot be parsed, which disables every client"
      (mt/with-temp-env-var-value! [mb-mcp-apps-cors-enabled-clients "claude,\"chatgpt"]
        (is (= [(str "Could not parse MB_MCP_APPS_CORS_ENABLED_CLIENTS as comma-separated MCP clients, "
                     "so all MCP clients are disabled.")]
               (warnings)))))
    (testing "says that only the first line is used, which the setter would reject"
      (mt/with-temp-env-var-value! [mb-mcp-apps-cors-enabled-clients "claude\nchatgpt"]
        (is (= [(str "Only the first line of MB_MCP_APPS_CORS_ENABLED_CLIENTS is used. "
                     "Put comma-separated values on one line.")]
               (warnings)))))
    (testing "does not call a malformed later line a reason to disable every client"
      (mt/with-temp-env-var-value! [mb-mcp-apps-cors-enabled-clients "claude\n\"chatgpt"]
        (is (= ["claude"] (mcp.settings/mcp-apps-cors-enabled-clients)))
        (is (= [(str "Only the first line of MB_MCP_APPS_CORS_ENABLED_CLIENTS is used. "
                     "Put comma-separated values on one line.")]
               (warnings)))))
    (testing "says nothing when every entry names a client"
      (mt/with-temp-env-var-value! [mb-mcp-apps-cors-enabled-clients "claude,vscode"]
        (is (= [] (warnings)))))))

;;; ------------------------------- Properties of mcp-apps-cors-enabled-clients -------------------------------

(defn- toggle-keys []
  (keys @#'mcp.settings/mcp-client-apps-sandbox-domains))

(defn- accept!
  "Whether the setter takes `value`. Leaves the setting changed when it does."
  [value]
  (try
    (mcp.settings/mcp-apps-cors-enabled-clients! value)
    true
    (catch clojure.lang.ExceptionInfo _
      false)))

(defn- read-from-env [csv]
  (mt/with-temp-env-var-value! [mb-mcp-apps-cors-enabled-clients csv]
    (mcp.settings/mcp-apps-cors-enabled-clients)))

(def ^:private gen-client-name
  "A name the setting accepts, in any case and with surrounding spaces."
  (gen/let [k     (gen/elements (concat (toggle-keys) (keys @#'mcp.settings/client-key-aliases)))
            upper gen/boolean
            pad   (gen/elements ["" " " "  "])]
    (str pad (cond-> k upper u/upper-case-en) pad)))

(def ^:private gen-junk
  "An entry that names no client, or a blank one."
  (gen/such-that #(not (#'mcp.settings/canonical-client-key %)) gen/string-alphanumeric 100))

(defspec mcp-apps-cors-enabled-clients-setter-and-env-agree-property-test 40
  ;; An env var never reaches the setter, and the admin page writes back whatever it read. Both paths must give the
  ;; same answer, or a value means one thing when typed into an env var and another when saved from the UI.
  (prop/for-all [names (gen/vector gen-client-name 0 4)
                 junk  (gen/vector gen-junk 0 2)]
    (let [good-csv (str/join "," names)
          all-csv  (str/join "," (concat junk names))]
      ;; Inside the block, so an empty env var, which counts as unset, does not read a value stored in the app DB.
      (mt/with-temporary-setting-values [mcp.settings/mcp-apps-cors-enabled-clients nil]
        (let [from-env (read-from-env all-csv)]
          (and
           ;; every key read is one the readers understand, once
           (every? (set (toggle-keys)) from-env)
           (= from-env (distinct from-env))
           ;; unknown entries never change which clients are enabled
           (= from-env (read-from-env good-csv))
           ;; the setter rejects exactly the values with an unknown entry
           (= (every? str/blank? junk) (accept! all-csv))
           ;; saved names read back as they do from the env var
           (accept! good-csv)
           (= from-env (mcp.settings/mcp-apps-cors-enabled-clients))
           ;; writing back what was read is accepted and changes nothing
           (accept! (mcp.settings/mcp-apps-cors-enabled-clients))
           (= from-env (mcp.settings/mcp-apps-cors-enabled-clients))))))))

(defspec mcp-apps-cors-enabled-clients-never-throws-property-test 100
  ;; The setting is read while building every HTTP response.
  (prop/for-all [raw gen/string]
    (vector? (read-from-env raw))))

(deftest every-gated-client-has-a-toggle-test
  (testing "a client that MCP UI is withheld from with every toggle off gets it with every toggle on"
    (doseq [client mcp.usage/supported-client-keys]
      (testing client
        (mt/with-temporary-setting-values [mcp.settings/mcp-apps-cors-enabled-clients nil]
          (when-not (mcp.settings/inline-ui-enabled-for-client? client)
            (mt/with-temporary-setting-values [mcp.settings/mcp-apps-cors-enabled-clients (vec (toggle-keys))]
              (is (true? (mcp.settings/inline-ui-enabled-for-client? client))))))))))

(deftest mcp-apps-cors-enabled-clients-description-test
  (let [description (str ((:description (setting/resolve-setting :mcp-apps-cors-enabled-clients))))
        words       (set (re-seq #"[a-z][a-z-]*[a-z]" description))]
    (mt/with-temporary-setting-values [mcp.settings/mcp-apps-cors-enabled-clients nil]
      (testing "every client the description names turns on a toggle"
        (doseq [client (filter words mcp.usage/supported-client-keys)]
          (testing client
            (is (accept! [client]))
            (let [enabled (mcp.settings/mcp-apps-cors-enabled-clients)]
              (is (and (seq enabled) (every? (set (toggle-keys)) enabled)))))))
      (testing "the description names every toggle"
        (is (every? words (toggle-keys)))))))
