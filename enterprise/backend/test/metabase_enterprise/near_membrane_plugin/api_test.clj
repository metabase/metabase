(ns metabase-enterprise.near-membrane-plugin.api-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.test.http-client :as client]))

(use-fixtures :once (fixtures/initialize :db :web-server :test-users))

;; Pinned independently of the source constant on purpose: the donor is unauthed, so a change to
;; the served body must break a test rather than silently ride along with the source.
(def ^:private inert-donor-doc
  "<!doctype html><html><head><meta charset=\"utf-8\"></head><body></body></html>")

(deftest sandbox-host-endpoint-test
  (testing "GET /sandbox-host returns minimal HTML with a per-document CSP"
    (mt/with-premium-features #{:custom-viz}
      (let [resp (mt/user-http-request-full-response
                  :rasta :get 200 "ee/near-membrane-plugin/sandbox-host")
            headers (:headers resp)]
        (testing "the body is exactly the inert donor document (pinned: this endpoint is unauthed, nothing may be added to it)"
          (is (= inert-donor-doc (:body resp))))
        (testing "response is served as HTML"
          (is (str/starts-with? (get headers "Content-Type") "text/html")))
        (testing "the CSP is exactly the per-document sandbox policy (pinned)"
          (is (= "default-src 'none'; script-src 'unsafe-eval'; form-action 'none'; frame-ancestors *;"
                 (get headers "Content-Security-Policy"))))
        (testing "no X-Frame-Options is served (frame-ancestors is the framing policy, so EAJS customer pages can frame it)"
          (is (nil? (get headers "X-Frame-Options"))))
        (testing "hardening headers are present"
          (is (= "nosniff"     (get headers "X-Content-Type-Options")))
          (is (= "no-referrer" (get headers "Referrer-Policy")))
          (is (= "same-origin" (get headers "Cross-Origin-Resource-Policy")))
          ;; no-store, not public: the gate's 200-vs-404 depends on headers/session a
          ;; URL-keyed shared cache can't see, so a cached 200 must never be replayable.
          (is (= "no-store" (get headers "Cache-Control"))))))))

(deftest sandbox-host-feature-settings-test
  (doseq [features [#{:custom-viz} #{:data-apps} #{:custom-viz :data-apps}]]
    (testing (str "feature tokens: " features)
      (mt/with-premium-features features
        (mt/with-temporary-setting-values [custom-viz-enabled false
                                           enable-embedding-modular false]
          (mt/user-http-request-full-response :rasta :get 200 "ee/near-membrane-plugin/sandbox-host"))))))

(deftest sandbox-host-requires-feature-test
  (mt/with-premium-features #{}
    (let [response (mt/user-http-request-full-response :rasta :get 404 "ee/near-membrane-plugin/sandbox-host")]
      (is (= "Not found" (:body response)))
      (is (= "no-store" (get-in response [:headers "Cache-Control"])))
      (is (not (str/includes? (str (get-in response [:headers "Content-Security-Policy"])) "unsafe-eval"))))))

(defn- get-sandbox-host
  "GET the donor endpoint, as `:rasta` when `authed?`, asserting `expected-status`.
   A nil `sec-fetch-site`/`sec-fetch-dest` means the header is not sent at all."
  [{:keys [authed? sec-fetch-site sec-fetch-dest expected-status]}]
  (let [headers (cond-> {}
                  sec-fetch-site (assoc "sec-fetch-site" sec-fetch-site)
                  sec-fetch-dest (assoc "sec-fetch-dest" sec-fetch-dest))
        args    (cond-> []
                  (seq headers) (conj {:request-options {:headers headers}}))]
    (if authed?
      (apply mt/user-http-request-full-response :rasta :get expected-status "ee/near-membrane-plugin/sandbox-host" args)
      (apply client/client-full-response :get expected-status "ee/near-membrane-plugin/sandbox-host" args))))

(deftest sandbox-host-fetch-metadata-gate-test
  ;; The whole gate in one table. Every 200 also pins the body: the donor is reachable without
  ;; authentication and its response carries an eval-permitting CSP, so it must ALWAYS be this
  ;; exact empty document. Never add content, data, or anything request-dependent to it.
  (mt/with-premium-features #{:custom-viz}
    (doseq [{:keys [description expected-status] :as scenario}
            [{:description     "an unauthed browser-attested same-origin iframe navigation is served (the EAJS path)"
              :sec-fetch-site  "same-origin"
              :sec-fetch-dest  "iframe"
              :expected-status 200}
             {:description     "cross-site framing of the donor URL is a 404"
              :sec-fetch-site  "cross-site"
              :sec-fetch-dest  "iframe"
              :expected-status 404}
             {:description     "a top-level navigation (URL pasted in a tab) is a 404"
              :sec-fetch-site  "none"
              :sec-fetch-dest  "document"
              :expected-status 404}
             {:description     "a same-origin fetch is a 404"
              :sec-fetch-site  "same-origin"
              :sec-fetch-dest  "empty"
              :expected-status 404}
             {:description     "absent fetch metadata is rejected (the unauthed donor requires an attested same-origin iframe load)"
              :expected-status 404}
             {:description     "a partial fetch-metadata set (only one of the two headers) is rejected"
              :sec-fetch-site  "same-origin"
              :expected-status 404}
             {:description     "an unauthed cross-site top-level load is a 404"
              :sec-fetch-site  "cross-site"
              :sec-fetch-dest  "document"
              :expected-status 404}
             {:description     "a session-authed request with no fetch metadata is served (older browsers)"
              :authed?         true
              :expected-status 200}
             {:description     "a session-authed same-origin iframe navigation is served"
              :authed?         true
              :sec-fetch-site  "same-origin"
              :sec-fetch-dest  "iframe"
              :expected-status 200}
             {:description     "a session-authed request with a present cross-site attestation is a 404 (an authed user must not be framable cross-site)"
              :authed?         true
              :sec-fetch-site  "cross-site"
              :sec-fetch-dest  "iframe"
              :expected-status 404}]]
      (testing description
        (let [resp (get-sandbox-host scenario)]
          (if (= 200 expected-status)
            (is (= inert-donor-doc (:body resp)))
            (is (= "Not found" (:body resp)))))))))

(deftest removed-evaluator-routes-test
  (mt/with-premium-features #{:custom-viz :data-apps}
    (doseq [route ["ee/custom-viz-plugin/sandbox-host" "apps/sandbox-host"]]
      (mt/user-http-request-full-response :rasta :get 404 route))))

(deftest data-apps-still-require-authentication-test
  (mt/with-premium-features #{:data-apps}
    (doseq [route ["apps" "apps/demo" "apps/demo/bundle"]]
      (client/client-full-response :get 401 route))))
