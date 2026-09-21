(ns metabase.mcp.settings-test
  (:require
   [clojure.test :refer :all]
   [metabase.mcp.settings :as mcp.settings]
   [metabase.settings.core :as setting]
   [metabase.test :as mt]))

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
