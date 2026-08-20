(ns ^:synchronous metabase-enterprise.custom-viz-plugin.csp-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.custom-viz-plugin.settings :as custom-viz.settings]
   [metabase.config.core :as config]
   [metabase.server.middleware.security :as mw.security]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

(defmacro ^:private with-dev-mode-enabled [& body]
  `(with-redefs [custom-viz.settings/custom-viz-plugin-dev-mode-enabled (constantly true)]
     ~@body))

(defn- csp-for!
  "The whole `Content-Security-Policy` the security middleware emits for a request made by `request-extras`
   (e.g. `{:is-superuser? true}`)."
  [request-extras]
  (with-redefs [config/is-dev? false]
    (let [handler  (mw.security/add-security-headers
                    (fn [_req respond _raise] (respond {:status 200 :headers {} :body "ok"})))
          response (handler (merge {:uri "/" :headers {}} request-extras) identity identity)]
      (str (get-in response [:headers "Content-Security-Policy"])))))

(deftest custom-viz-dev-connect-src-test
  ;; `custom-viz-enabled` cannot be on while `csp-img-enabled` is off (the settings interlock), so any
  ;; instance actually running custom viz gets the restricted `img-src`, not the permissive `*` branch.
  (mt/with-temporary-setting-values [csp-img-enabled true custom-viz-enabled true]
    (mt/with-temp [:model/CustomVizPlugin _ {:identifier     "dev-csp"
                                             :display_name   "dev-csp"
                                             :status         :active
                                             :enabled        true
                                             :dev_bundle_url "http://localhost:5174"}]
      (testing "the dev origin is looked up only with the :custom-viz feature and dev mode on"
        (mt/with-premium-features #{:custom-viz}
          (with-dev-mode-enabled
            (is (= ["http://localhost:5174"] (mw.security/custom-viz-dev-connect-src-hosts))))
          (is (= [] (mw.security/custom-viz-dev-connect-src-hosts)) "dev mode off"))
        (mt/with-premium-features #{}
          (with-dev-mode-enabled
            (is (= [] (mw.security/custom-viz-dev-connect-src-hosts)) "no feature"))))
      (mt/with-premium-features #{:custom-viz}
        (testing "SECURITY: only a superuser's document can reach the dev server, and only for the bundle
                  (connect-src) and the icon (img-src) -- never as a script source, since the bundle is
                  evaluated from fetched text inside the near-membrane realm"
          (with-dev-mode-enabled
            (let [su (csp-for! {:is-superuser? true})]
              (doseq [directive ["connect-src" "img-src"]]
                (is (re-find (re-pattern (str directive " [^;]*http://localhost:5174")) su) directive))
              (is (not (re-find #"script-src [^;]*http://localhost:5174" su))))
            (doseq [request [{:is-superuser? false} {}]]
              (is (not (str/includes? (csp-for! request) "http://localhost:5174"))
                  (pr-str request))))
          (testing "and nobody's does with dev mode off"
            (is (not (str/includes? (csp-for! {:is-superuser? true}) "http://localhost:5174")))))
        (testing "SECURITY: a non-loopback row cannot reach the header. `validate-dev-url!` refuses these on
                  write, but rows stored before that check are still in the DB."
          (with-dev-mode-enabled
            (mt/with-temp [:model/CustomVizPlugin _ {:identifier     "legacy-external"
                                                     :display_name   "legacy-external"
                                                     :status         :active
                                                     :enabled        true
                                                     :dev_bundle_url "https://evil.com"}]
              (is (= ["http://localhost:5174"] (mw.security/custom-viz-dev-connect-src-hosts))))))))))
