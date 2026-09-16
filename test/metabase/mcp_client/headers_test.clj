(ns metabase.mcp-client.headers-test
  (:require
   [clojure.test :refer :all]
   [metabase.mcp-client.headers :as headers]))

(deftest ^:parallel header-safe?-test
  (are [s] (headers/header-safe? s)
    "us-west1"
    "file:///projects/myapp/config.json"
    "a b")
  (are [s] (not (headers/header-safe? s))
    ""
    " padded "
    "Hello, 世界"
    "line1\nline2"
    "=?base64?literal?="))

(deftest ^:parallel encode-header-value-test
  (testing "examples from the spec's value-encoding table"
    (are [s encoded] (= encoded (headers/encode-header-value s))
      "us-west1"           "us-west1"
      "Hello, 世界"         "=?base64?SGVsbG8sIOS4lueVjA==?="
      " padded "           "=?base64?IHBhZGRlZCA=?="
      "line1\nline2"       "=?base64?bGluZTEKbGluZTI=?="
      "=?base64?literal?=" "=?base64?PT9iYXNlNjQ/bGl0ZXJhbD89?=")))

(deftest ^:parallel mcp-name-header-test
  (is (= "get_weather" (headers/mcp-name-header "tools/call" {:name "get_weather"})))
  (is (= "summarize" (headers/mcp-name-header "prompts/get" {:name "summarize"})))
  (is (= "file:///a" (headers/mcp-name-header "resources/read" {:uri "file:///a"})))
  (is (nil? (headers/mcp-name-header "tools/list" nil))))

(defn- tool [properties]
  {:name "t" :inputSchema {:type "object" :properties properties}})

(deftest ^:parallel invalid-tool-reason-test
  (testing "valid annotations, including nested ones reached only through properties"
    (is (nil? (headers/invalid-tool-reason (tool {:region {:type "string" :x-mcp-header "Region"}
                                                  :query  {:type "string"}
                                                  :opts   {:type       "object"
                                                           :properties {:flag {:type "boolean" :x-mcp-header "Flag"}}}}))))
    (is (nil? (headers/invalid-tool-reason {:name "no-params" :inputSchema {:type "object"}}))))
  (testing "invalid annotations"
    (are [properties reason-re] (re-find reason-re (headers/invalid-tool-reason (tool properties)))
      {:n {:type "number" :x-mcp-header "N"}}                                        #"only string, integer and boolean"
      {:a {:type "array" :items {:type "string" :x-mcp-header "A"}}}                #"not reachable"
      {:a {:oneOf [{:type "string" :x-mcp-header "A"}]}}                            #"not reachable"
      {:a {:type "string" :x-mcp-header "X"} :b {:type "string" :x-mcp-header "x"}} #"unique ignoring case"
      {:a {:type "string" :x-mcp-header "bad name"}}                                #"not a valid HTTP header name"
      {:a {:type "string" :x-mcp-header ""}}                                        #"not a valid HTTP header name"
      {:a {:type "string" :x-mcp-header true}}                                      #"not a valid HTTP header name")))

(deftest ^:parallel param-headers-test
  (let [t (tool {:region {:type "string" :x-mcp-header "Region"}
                 :count  {:type "integer" :x-mcp-header "Count"}
                 :query  {:type "string"}
                 :opts   {:type       "object"
                          :properties {:flag {:type "boolean" :x-mcp-header "Flag"}}}})]
    (testing "values are converted, encoded, and looked up by keyword or string key"
      (is (= {"Mcp-Param-Region" "us-west1"
              "Mcp-Param-Count"  "42"
              "Mcp-Param-Flag"   "false"}
             (headers/param-headers t {:region "us-west1" "count" 42 :opts {"flag" false} :query "q"}))))
    (testing "absent and nil arguments produce no header"
      (is (= {} (headers/param-headers t {:query "q" :region nil}))))
    (testing "unsafe values use the sentinel"
      (is (= {"Mcp-Param-Region" "=?base64?SGVsbG8sIOS4lueVjA==?="}
             (headers/param-headers t {:region "Hello, 世界"}))))))
