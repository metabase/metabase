(ns metabase.mcp-client.jsonrpc-test
  (:require
   [clojure.test :refer :all]
   [metabase.mcp-client.jsonrpc :as jsonrpc]
   [metabase.util.json :as json]))

(def ^:private client-info {:name "Metabase" :version "1.0"})

(deftest ^:parallel modern-envelope-test
  (let [message (jsonrpc/request 1 "tools/call"
                                 (jsonrpc/with-modern-meta {:name "t" :_meta {:progressToken "p"}} "2026-07-28" client-info))]
    (testing "the per-request _meta fields serialize under their reverse-DNS names and keep existing keys"
      (is (= {"jsonrpc" "2.0"
              "id"      1
              "method"  "tools/call"
              "params"  {"name"  "t"
                         "_meta" {"progressToken"                              "p"
                                  "io.modelcontextprotocol/protocolVersion"    "2026-07-28"
                                  "io.modelcontextprotocol/clientCapabilities" {}
                                  "io.modelcontextprotocol/clientInfo"         {"name" "Metabase" "version" "1.0"}}}}
             (json/decode (json/encode message)))))
    (testing "decoding brings the reverse-DNS keys back as namespaced keywords"
      (is (= "2026-07-28"
             (get-in (json/decode+kw (json/encode message))
                     [:params :_meta :io.modelcontextprotocol/protocolVersion]))))))

(deftest ^:parallel legacy-envelope-test
  (is (= {:jsonrpc "2.0" :id 2 :method "tools/list"}
         (jsonrpc/request 2 "tools/list" nil)))
  (is (= {:jsonrpc "2.0" :method "notifications/initialized"}
         (jsonrpc/notification "notifications/initialized" nil)))
  (is (= {:jsonrpc "2.0" :id "abc" :error {:code -32601 :message "nope"}}
         (jsonrpc/error-response "abc" jsonrpc/method-not-found "nope"))))

(deftest next-id-test
  (let [ids (repeatedly 100 jsonrpc/next-id!)]
    (is (= 100 (count (set ids))))
    (is (every? pos-int? ids))))

(deftest ^:parallel response?-test
  (is (jsonrpc/response? {:jsonrpc "2.0" :id 3 :result {}} 3))
  (is (jsonrpc/response? {:jsonrpc "2.0" :id 3 :error {:code 1 :message "x"}} 3))
  (is (not (jsonrpc/response? {:jsonrpc "2.0" :id 4 :result {}} 3)))
  (is (not (jsonrpc/response? {:jsonrpc "2.0" :id 3 :method "sampling/createMessage"} 3))))

(deftest ^:parallel error->ex-test
  (let [e (jsonrpc/error->ex {:url "http://s/mcp" :method "tools/call" :status 200}
                             {:code -32602 :message "Unknown tool" :data {:tool "x"}})]
    (is (= {:type    :mcp-client/jsonrpc-error
            :url     "http://s/mcp"
            :method  "tools/call"
            :status  200
            :code    -32602
            :message "Unknown tool"
            :data    {:tool "x"}}
           (ex-data e)))
    (is (re-find #"Unknown tool" (ex-message e)))))
