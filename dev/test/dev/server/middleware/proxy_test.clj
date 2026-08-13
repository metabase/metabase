(ns dev.server.middleware.proxy-test
  (:require
   [clj-http.client :as http]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [dev.server.middleware.proxy :as mw.proxy]
   [metabase.config.core :as config]
   [metabase.test :as mt]))

(def ^:private remote-url "https://remote.example.com")

(defn- proxy-request
  [request]
  (@#'mw.proxy/proxy-request request))

(defn- run-remote-api-proxy
  [wrapped-handler request]
  (let [response (atom nil)]
    (wrapped-handler request
                     (fn [resp] (reset! response resp))
                     (fn [e] (throw e)))
    @response))

(deftest proxy-headers-allowlist-test
  (let [captured-opts (atom nil)]
    (with-redefs [config/config-str (fn [_] remote-url)
                  http/get (fn [_url opts]
                             (reset! captured-opts opts)
                             {:status 200
                              :headers {}
                              :body "ok"})]
      (proxy-request {:request-method :get
                      :uri "/api/card/1"
                      :headers {"Accept" "application/json"
                                "Accept-Language" "en-US"
                                "Authorization" "Bearer abc"
                                "Content-Type" "application/json"
                                "Cookie" "metabase.SESSION=abc"
                                "User-Agent" "ring-test"
                                "X-Forwarded-For" "1.2.3.4"
                                "Host" "localhost:3000"
                                "X-Real-IP" "5.6.7.8"
                                "X-Custom" "drop-me"}})
      (is (= {"accept" "application/json"
              "accept-language" "en-US"
              "authorization" "Bearer abc"
              "content-type" "application/json"
              "cookie" "metabase.SESSION=abc"
              "user-agent" "ring-test"
              "origin" remote-url}
             (get @captured-opts :headers))))))

(deftest api-path-matching-test
  (let [proxied? (atom false)
        local-handler (fn [_request respond _raise]
                        (respond {:status 418
                                  :headers {}
                                  :body "local"}))]
    (with-redefs [config/is-dev? true
                  config/config-str (fn [_] remote-url)
                  http/get (fn [_url _opts]
                             (reset! proxied? true)
                             {:status 200
                              :headers {}
                              :body "proxied"})]
      (let [wrapped-handler (mw.proxy/wrap-remote-api-proxy local-handler)]
        (reset! proxied? false)
        (is (= 200
               (:status (run-remote-api-proxy wrapped-handler
                                              {:request-method :get
                                               :uri "/api"
                                               :headers {"host" "localhost:3000"}}))))
        (is @proxied?)

        (reset! proxied? false)
        (is (= 418
               (:status (run-remote-api-proxy wrapped-handler
                                              {:request-method :get
                                               :uri "/apiary"
                                               :headers {"host" "localhost:3000"}}))))
        (is (not @proxied?))))))

(deftest cookie-rewrite-localhost-only-test
  (with-redefs [config/config-str (fn [_] remote-url)
                http/get (fn [_url _opts]
                           {:status 200
                            :headers {"Set-Cookie" "metabase.SESSION=abc; Domain=remote.example.com; Secure; SameSite=None"}
                            :body "ok"})]
    (let [localhost-response (proxy-request {:request-method :get
                                             :uri "/api/session/properties"
                                             :headers {"host" "localhost:3000"}})
          localhost-cookie (get-in localhost-response [:headers "Set-Cookie"])
          non-localhost-response (proxy-request {:request-method :get
                                                 :uri "/api/session/properties"
                                                 :headers {"host" "devbox.example.com:3000"}})
          non-localhost-cookie (get-in non-localhost-response [:headers "Set-Cookie"])]
      (is (string? localhost-cookie))
      (is (str/includes? localhost-cookie "SameSite=Lax"))
      (is (not (str/includes? localhost-cookie "Domain=")))
      (is (not (str/includes? localhost-cookie "Secure")))

      (is (= "metabase.SESSION=abc; Domain=remote.example.com; Secure; SameSite=None"
             non-localhost-cookie)))))

(deftest proxy-error-response-does-not-leak-details-test
  (with-redefs [config/config-str (fn [_] remote-url)
                http/get (fn [_url _opts]
                           (throw (ex-info "Proxy error: upstream timeout 10.2.0.4" {})))]
    (is (= {:status 502
            :body "Proxy error"}
           (select-keys (proxy-request {:request-method :get
                                        :uri "/api/session/properties"
                                        :headers {"host" "localhost:3000"}})
                        [:status :body])))))

(deftest proxy-logging-does-not-expose-cookie-values-test
  (with-redefs [config/config-str (fn [_] remote-url)
                http/get (fn [_url _opts]
                           {:status 200
                            :headers {}
                            :cookies {"metabase.SESSION" {:value "super-secret-session-token"}}
                            :body "ok"})]
    (mt/with-log-messages-for-level [messages :info]
      (proxy-request {:request-method :get
                      :uri "/api/session/properties"
                      :headers {"host" "localhost:3000"}})
      (is (empty?
           (filter #(str/includes? (:message %) "super-secret-session-token")
                   (messages)))))))
