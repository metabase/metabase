(ns metabase.mcp-client.test-util
  "An in-process fake of an MCP server that requires OAuth, together with its authorization server."
  (:require
   [clojure.string :as str]
   [metabase.util.json :as json]
   [ring.adapter.jetty :as jetty]
   [ring.util.codec :as codec])
  (:import
   (java.nio.charset StandardCharsets)
   (java.security MessageDigest)
   (java.util Base64)
   (org.eclipse.jetty.server Server)))

(set! *warn-on-reflection* true)

(defn s256
  "The PKCE S256 challenge for `verifier`."
  [^String verifier]
  (.encodeToString (.withoutPadding (Base64/getUrlEncoder))
                   (.digest (MessageDigest/getInstance "SHA-256") (.getBytes verifier StandardCharsets/US_ASCII))))

(defn json-response [status body]
  {:status status :headers {"Content-Type" "application/json"} :body (json/encode body)})

(defn form-params [req]
  (into {} (map (fn [[k v]] [(keyword k) v])) (codec/form-decode (slurp (:body req)))))

(defn query-params
  "The query parameters of `url`, keyed by keyword."
  [url]
  (into {} (map (fn [[k v]] [(keyword k) v])) (codec/form-decode (second (str/split url #"\?" 2)))))

(def ^:private valid-tokens #{"Bearer token-1" "Bearer token-2"})

(def echo-tool
  {:name "echo" :description "Echoes text" :inputSchema {:type "object" :properties {:text {:type "string"}}}})

(defn fake-server
  "Serves protected resource metadata (at the path-inserted well-known URL only), authorization server metadata,
  registration, tokens, and an MCP endpoint at /mcp that wants a bearer token. `state` records what it saw under
  `:requests`, the registration body under `:registration`, and the last token request under `:token-request`;
  set `:code-challenge` in it to the challenge of the authorization request being tested."
  [state]
  (fn [req]
    (let [base    (:base @state)
          path    (:uri req)
          headers (:headers req)]
      (swap! state update :requests conj {:method (:request-method req) :path path :headers headers})
      (case path
        "/.well-known/oauth-protected-resource/mcp"
        (json-response 200 {:resource (str base "/mcp") :authorization_servers [base] :scopes_supported ["default"]})

        "/.well-known/oauth-authorization-server"
        (json-response 200 {:issuer                                         base
                            :authorization_endpoint                         (str base "/authorize")
                            :token_endpoint                                 (str base "/token")
                            :registration_endpoint                          (str base "/register")
                            :code_challenge_methods_supported               ["S256"]
                            :authorization_response_iss_parameter_supported true})

        "/register"
        (let [body (json/decode+kw (slurp (:body req)))]
          (swap! state assoc :registration body)
          (json-response 201 {:client_id "client-123" :redirect_uris (:redirect_uris body)}))

        "/token"
        (let [{:keys [grant_type code code_verifier client_id resource refresh_token] :as params} (form-params req)]
          (swap! state assoc :token-request params)
          (cond
            (not= "client-123" client_id)
            (json-response 401 {:error "invalid_client"})

            (and (= "authorization_code" grant_type)
                 (= "good-code" code)
                 (= (:code-challenge @state) (s256 code_verifier))
                 (= (str base "/mcp") resource))
            (json-response 200 {:access_token   "token-1"
                                :token_type     "Bearer"
                                :expires_in     3600
                                :refresh_token  "refresh-1"
                                :workspace_name "Fake Workspace"})

            (and (= "refresh_token" grant_type) (= "refresh-1" refresh_token))
            (json-response 200 {:access_token "token-2" :token_type "Bearer" :expires_in 3600})

            :else
            (json-response 400 {:error "invalid_grant" :error_description "nope"})))

        "/mcp"
        (if (contains? valid-tokens (get headers "authorization"))
          (let [{:keys [id method params]} (json/decode+kw (slurp (:body req)))]
            (swap! state update :mcp-methods (fnil conj []) method)
            (case method
              "server/discover" (json-response 200 {:jsonrpc "2.0" :id id
                                                    :result {:resultType "complete" :supportedVersions ["2026-07-28"] :capabilities {:tools {}}}})
              "tools/list"      (json-response 200 {:jsonrpc "2.0" :id id :result {:resultType "complete" :tools [echo-tool]}})
              "tools/call"      (json-response 200 {:jsonrpc "2.0" :id id
                                                    :result (if (= "echo" (:name params))
                                                              {:resultType "complete"
                                                               :content    [{:type "text" :text (str "echo: " (get-in params [:arguments :text]))}]}
                                                              {:resultType "complete"
                                                               :isError    true
                                                               :content    [{:type "text" :text (str "Unknown tool " (:name params))}]})})
              (json-response 404 {:jsonrpc "2.0" :id id :error {:code -32601 :message "Method not found"}})))
          {:status  401
           :headers {"Content-Type"     "application/json"
                     "WWW-Authenticate" (str "Bearer resource_metadata=\"" base "/.well-known/oauth-protected-resource/mcp\", scope=\"default\"")}
           :body    (json/encode {:error "unauthorized"})})

        {:status 404 :body "not found"}))))

(defn do-with-fake-server
  "Run `(f base-url state)` against a fresh fake server on a random port."
  [f]
  (let [state          (atom {:requests []})
        ^Server server (jetty/run-jetty (fake-server state) {:port 0 :join? false})
        base           (str "http://localhost:" (.. server getURI getPort))]
    (swap! state assoc :base base)
    (try
      (f base state)
      (finally
        (.stop server)))))
