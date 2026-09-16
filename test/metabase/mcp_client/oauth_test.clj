(ns metabase.mcp-client.oauth-test
  "The OAuth flow against the fake authorization server in [[metabase.mcp-client.test-util]]."
  (:require
   [clj-http.client :as http]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [java-time.api :as t]
   [mb.hawk.assert-exprs]
   [metabase.mcp-client.core :as mcp]
   [metabase.mcp-client.oauth :as oauth]
   [metabase.mcp-client.test-util :as mcp.tu]
   [ring.util.codec :as codec]))

(set! *warn-on-reflection* true)

(comment mb.hawk.assert-exprs/keep-me)

(defn- test-client [base]
  (mcp/client {:url (str base "/mcp") :network-policy :allow-all}))

(deftest ^:parallel parse-www-authenticate-test
  (is (= {:realm "mcp" :resource_metadata "https://s/.well-known/oauth-protected-resource" :scope "a b"}
         (oauth/parse-www-authenticate "Bearer realm=\"mcp\", resource_metadata=\"https://s/.well-known/oauth-protected-resource\", scope=\"a b\"")))
  (is (= {:error "insufficient_scope" :scope "files:write"}
         (oauth/parse-www-authenticate "Bearer error=\"insufficient_scope\", scope=\"files:write\"")))
  (is (= {} (oauth/parse-www-authenticate "Bearer")))
  (is (nil? (oauth/parse-www-authenticate "Basic realm=\"x\"")))
  (is (nil? (oauth/parse-www-authenticate nil))))

(deftest ^:parallel authorization-request-test
  (let [as        {:issuer "https://as" :authorization_endpoint "https://as/authorize?tenant=1" :code_challenge_methods_supported ["S256"]}
        {:keys [url pending]} (oauth/authorization-request as {:client-id "c" :redirect-uri "http://localhost:1/cb" :scopes ["a" "b"] :resource "https://s/mcp"})
        [endpoint query] (str/split url #"\?" 2)
        params    (into {} (map (fn [[k v]] [(keyword k) v])) (codec/form-decode query))]
    (is (= "https://as/authorize" endpoint))
    (is (=? {:tenant                "1"
             :response_type         "code"
             :client_id             "c"
             :redirect_uri          "http://localhost:1/cb"
             :code_challenge        (mcp.tu/s256 (:code-verifier pending))
             :code_challenge_method "S256"
             :state                 (:state pending)
             :resource              "https://s/mcp"
             :scope                 "a b"}
            params))
    (is (= "https://as" (:issuer pending)))
    (is (<= 43 (count (:code-verifier pending)) 128)))
  (testing "a server without S256 is refused"
    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"PKCE"
                          (oauth/authorization-request {:issuer "https://as" :code_challenge_methods_supported ["plain"]}
                                                       {:client-id "c" :redirect-uri "r" :resource "s"})))))

(deftest discover-test
  (mcp.tu/do-with-fake-server
   (fn [base state]
     (let [c (test-client base)
           {:keys [challenge resource-metadata authorization-server resource scopes]} (oauth/discover c)]
       (is (= {:resource_metadata (str base "/.well-known/oauth-protected-resource/mcp") :scope "default"} challenge))
       (is (= (str base "/mcp") (:resource resource-metadata)))
       (is (= (str base "/token") (:token_endpoint authorization-server)))
       (is (= (str base "/mcp") resource))
       (is (= ["default"] scopes))
       (testing "the 401 is taken at face value: one probe, no legacy initialize attempt"
         (is (= 1 (count (filter #(and (= :post (:method %)) (= "/mcp" (:path %))) (:requests @state))))))))))

(deftest exchange-code-validation-test
  (let [as           {:issuer "https://as" :authorization_response_iss_parameter_supported true}
        pending      {:issuer "https://as" :state "s1" :code-verifier "v" :redirect-uri "r" :resource "x"}
        exchange     #(oauth/exchange-code! nil as {:client_id "c"} pending %)
        error-data   #(try (exchange %) (catch clojure.lang.ExceptionInfo e (dissoc (ex-data e) :type)))]
    (is (=? {:step :authorization :iss "https://evil"} (error-data {:code "c" :state "s1" :iss "https://evil"})))
    (is (=? {:step :authorization :issuer "https://as"} (error-data {:code "c" :state "s1"})) "iss promised but absent")
    (is (=? {:step :authorization :error "access_denied"} (error-data {:error "access_denied" :iss "https://as"})))
    (is (=? {:step :authorization} (error-data {:code "c" :state "other" :iss "https://as"})))))

(deftest authorize-test
  (mcp.tu/do-with-fake-server
   (fn [base state]
     (let [c       (test-client base)
           url     (promise)
           outcome (future (oauth/authorize! c {:on-url #(deliver url %) :timeout-ms 20000}))
           auth-url (deref url 20000 nil)]
       (is (string? auth-url) "the authorization URL was handed out")
       (let [params       (into {} (map (fn [[k v]] [(keyword k) v])) (codec/form-decode (second (str/split auth-url #"\?" 2))))
             redirect-uri (:redirect_uri params)]
         (swap! state assoc :code-challenge (:code_challenge params))
         (is (=? {:client_name "Metabase" :token_endpoint_auth_method "none" :application_type "native" :redirect_uris [redirect-uri]}
                 (:registration @state)))
         (is (str/starts-with? redirect-uri "http://localhost:"))
         (testing "the browser lands on the loopback redirect"
           (let [resp (http/get redirect-uri {:query-params {:code "good-code" :state (:state params) :iss base}})]
             (is (= 200 (:status resp)))
             (is (str/includes? (:body resp) "Authorization complete"))))
         (let [{:keys [tokens registration] :as result} (deref outcome 20000 ::timeout)]
           (is (=? {:access_token "token-1" :refresh_token "refresh-1" :expires-at some?} tokens))
           (is (= "client-123" (:client_id registration)))
           (is (=? {:grant_type "authorization_code" :resource (str base "/mcp") :redirect_uri redirect-uri} (:token-request @state)))
           (testing "the authorized client reaches the server"
             (let [authorized (oauth/authorized-client c result)]
               (is (=? {:era :modern :protocol-version "2026-07-28"} (mcp/discover authorized)))
               (is (= "Bearer token-1" (get-in (last (:requests @state)) [:headers "authorization"])))))
           (testing "an expiring token is refreshed before use"
             (let [authorized (oauth/authorized-client c (assoc-in result [:tokens :expires-at] (t/instant)))]
               (mcp/discover authorized)
               (is (=? {:grant_type "refresh_token" :refresh_token "refresh-1"} (:token-request @state)))
               (is (= "Bearer token-2" (get-in (last (:requests @state)) [:headers "authorization"])))))))))))
