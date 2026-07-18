(ns metabase-enterprise.data-apps.csp-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.config.core :as config]
   [metabase.server.middleware.security :as mw.security]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

(defn- connect-src-for!
  "The `connect-src` directive of the CSP that the security middleware emits for
   a request to `uri`."
  [uri]
  (with-redefs [config/is-dev? false]
    (let [handler  (mw.security/add-security-headers
                    (fn [_req respond _raise] (respond {:status 200 :headers {} :body "ok"})))
          response (handler {:uri uri :headers {}} identity identity)
          csp      (get-in response [:headers "Content-Security-Policy"])]
      (->> (str/split csp #";\s*")
           (filter #(str/starts-with? % "connect-src "))
           first))))

(deftest data-app-connect-src-allowed-hosts-test
  (mt/with-premium-features #{:data-apps}
    (mt/with-temp [:model/DataApp _ {:name          "boba"
                                     :display_name  "Boba"
                                     :bundle_path   "data_apps/boba/dist/index.js"
                                     :enabled       true
                                     :allowed_hosts ["https://api.example.com" "https://*.acme.com"]}]
      (testing "the data-app iframe document's connect-src includes the app's allowed_hosts (and keeps 'self')"
        (let [cs (connect-src-for! "/embed/apps/boba")]
          (is (str/includes? cs "https://api.example.com"))
          (is (str/includes? cs "https://*.acme.com"))
          (is (str/includes? cs "'self'"))))
      (testing "a deeper sub-route of the same app gets them too"
        (is (str/includes? (connect-src-for! "/embed/apps/boba/sub/route")
                           "https://api.example.com")))
      (testing "the main app's connect-src does NOT include them"
        (is (not (str/includes? (connect-src-for! "/") "https://api.example.com"))))
      (testing "an unknown app contributes no hosts"
        (is (not (str/includes? (connect-src-for! "/embed/apps/nope")
                                "api.example.com")))))))

(deftest data-app-connect-src-hosts-fn-test
  (mt/with-temp [:model/DataApp _ {:name          "boba"
                                   :display_name  "Boba"
                                   :bundle_path   "x"
                                   :enabled       true
                                   :allowed_hosts ["https://api.example.com"]}]
    (testing "with the :data-apps feature the EE impl returns the app's allowed_hosts"
      (mt/with-premium-features #{:data-apps}
        (is (= ["https://api.example.com"] (mw.security/data-app-connect-src-hosts "boba")))))
    (testing "without the feature it falls back to []"
      (mt/with-premium-features #{}
        (is (= [] (mw.security/data-app-connect-src-hosts "boba")))))
    (testing "a disabled app contributes nothing"
      (mt/with-premium-features #{:data-apps}
        (mt/with-temp [:model/DataApp _ {:name          "off"
                                         :display_name  "Off"
                                         :bundle_path   "x"
                                         :enabled       false
                                         :allowed_hosts ["https://nope.example.com"]}]
          (is (= [] (mw.security/data-app-connect-src-hosts "off"))))))))
