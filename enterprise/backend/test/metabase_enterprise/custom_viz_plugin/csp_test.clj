(ns ^:synchronous metabase-enterprise.custom-viz-plugin.csp-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.custom-viz-plugin.test-util :as cvp.tu]
   [metabase.config.core :as config]
   [metabase.server.middleware.security :as mw.security]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

(def ^:private dev-origin "http://localhost:5174")

(defn- dev-plugin
  "An active, enabled plugin row served from `url` as its dev server."
  [identifier url]
  {:identifier     identifier
   :display_name   identifier
   :status         :active
   :enabled        true
   :dev_bundle_url url})

(defn- csp-sources!
  [request-extras]
  (with-redefs [config/is-dev? false]
    (let [handler  (mw.security/add-security-headers
                    (fn [_req respond _raise] (respond {:status 200 :headers {} :body "ok"})))
          response (handler (merge {:uri "/" :headers {}} request-extras) identity identity)
          header   (str (get-in response [:headers "Content-Security-Policy"]))]
      (into {}
            (for [directive (str/split header #";\s*")
                  :when     (seq directive)
                  :let      [[k & sources] (str/split (str/trim directive) #"\s+")]]
              [k (set sources)])))))

(defn- every-source
  "Every source in the policy, whatever directive it sits under."
  [csp]
  (reduce into #{} (vals csp)))

(deftest dev-connect-src-hosts-test
  (mt/with-temp [:model/CustomVizPlugin _ (dev-plugin "dev-csp" dev-origin)]
    (testing "the dev origin is looked up only with the :custom-viz feature and dev mode on"
      (doseq [[features dev-mode? expected] [[#{:custom-viz} true  [dev-origin]]
                                             [#{:custom-viz} false []]
                                             [#{}            true  []]]]
        (mt/with-premium-features features
          (cvp.tu/with-dev-mode dev-mode?
            (is (= expected (mw.security/custom-viz-dev-connect-src-hosts))
                (pr-str {:features features :dev-mode? dev-mode?}))))))
    (testing "a non-loopback row cannot reach the header"
      (mt/with-premium-features #{:custom-viz}
        (cvp.tu/with-dev-mode true
          (mt/with-temp [:model/CustomVizPlugin _ (dev-plugin "legacy-external" "https://evil.com")]
            (is (= [dev-origin] (mw.security/custom-viz-dev-connect-src-hosts)))))))))

(deftest dev-origin-in-csp-header-test
  ;; `custom-viz-enabled` cannot be on while `csp-img-enabled` is off (the settings interlock), so any
  ;; instance actually running custom viz gets the restricted `img-src`, not the permissive `*` branch.
  (mt/with-temporary-setting-values [csp-img-enabled true custom-viz-enabled true]
    (mt/with-temp [:model/CustomVizPlugin _ (dev-plugin "dev-csp" dev-origin)]
      (mt/with-premium-features #{:custom-viz}
        (testing "SECURITY: only a superuser's document can reach the dev server, and only for the bundle
                  (connect-src) and the icon (img-src) -- never as a script source, since the bundle is
                  evaluated from fetched text inside the near-membrane realm"
          (cvp.tu/with-dev-mode true
            (let [csp (csp-sources! {:is-superuser? true})]
              (doseq [directive ["connect-src" "img-src"]]
                (is (contains? (get csp directive) dev-origin) directive))
              (is (not (contains? (get csp "script-src") dev-origin))))
            (doseq [request [{:is-superuser? false} {}]]
              (is (not (contains? (every-source (csp-sources! request)) dev-origin))
                  (pr-str request)))))
        (testing "and nobody's document does with dev mode off"
          (cvp.tu/with-dev-mode false
            (is (not (contains? (every-source (csp-sources! {:is-superuser? true})) dev-origin)))))))))
