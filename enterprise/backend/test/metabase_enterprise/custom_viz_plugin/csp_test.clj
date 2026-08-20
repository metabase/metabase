(ns ^:synchronous metabase-enterprise.custom-viz-plugin.csp-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.custom-viz-plugin.settings :as custom-viz.settings]
   [metabase.config.core :as config]
   [metabase.server.middleware.security :as mw.security]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

;; `custom-viz-enabled` cannot be turned on while `csp-img-enabled` is off (the two settings interlock, see
;; `metabase.server.settings/csp-img-enabled`), so any instance actually running custom viz has the
;; restricted `img-src` rather than the permissive `*` branch. Match that here.
(use-fixtures :each
  (fn [thunk]
    (mt/with-temporary-setting-values [csp-img-enabled    true
                                       custom-viz-enabled true]
      (thunk))))

(defmacro ^:private with-dev-mode-enabled [& body]
  `(with-redefs [custom-viz.settings/custom-viz-plugin-dev-mode-enabled (constantly true)]
     ~@body))

(defn- directive-for!
  "The CSP `directive` the security middleware emits for a request to `/` made by `request-extras`
   (e.g. `{:is-superuser? true}`)."
  [directive request-extras]
  (with-redefs [config/is-dev? false]
    (let [handler  (mw.security/add-security-headers
                    (fn [_req respond _raise] (respond {:status 200 :headers {} :body "ok"})))
          response (handler (merge {:uri "/" :headers {}} request-extras) identity identity)]
      (->> (str/split (get-in response [:headers "Content-Security-Policy"]) #";\s*")
           (filter #(str/starts-with? % (str directive " ")))
           first))))

(deftest custom-viz-dev-connect-src-hosts-test
  (mt/with-temp [:model/CustomVizPlugin _ {:identifier     "dev-csp"
                                           :display_name   "dev-csp"
                                           :status         :active
                                           :enabled        true
                                           :dev_bundle_url "http://localhost:5174"}]
    (testing "with the :custom-viz feature and dev mode on, the EE impl returns the dev server origin"
      (mt/with-premium-features #{:custom-viz}
        (with-dev-mode-enabled
          (is (= ["http://localhost:5174"] (mw.security/custom-viz-dev-connect-src-hosts))))))
    (testing "dev mode off contributes nothing, even with the feature"
      (mt/with-premium-features #{:custom-viz}
        (is (= [] (mw.security/custom-viz-dev-connect-src-hosts)))))
    (testing "without the feature it falls back to []"
      (mt/with-premium-features #{}
        (with-dev-mode-enabled
          (is (= [] (mw.security/custom-viz-dev-connect-src-hosts))))))
    (testing "a disabled plugin contributes nothing"
      (mt/with-premium-features #{:custom-viz}
        (with-dev-mode-enabled
          (mt/with-temp [:model/CustomVizPlugin {id :id} {:identifier     "dev-csp-off"
                                                          :display_name   "dev-csp-off"
                                                          :status         :active
                                                          :enabled        false
                                                          :dev_bundle_url "http://localhost:5999"}]
            (is (not (contains? (set (mw.security/custom-viz-dev-connect-src-hosts))
                                "http://localhost:5999"))
                (str "plugin " id " is disabled"))))))))

(deftest custom-viz-dev-non-loopback-row-is-filtered-test
  (testing "SECURITY: a row stored before the loopback rule existed cannot reach the header. The write-time
            check in `cache/validate-dev-url!` refuses these now, but rows predating it are still in the DB."
    (mt/with-premium-features #{:custom-viz}
      (with-dev-mode-enabled
        (mt/with-temp [:model/CustomVizPlugin _ {:identifier     "legacy-docker"
                                                 :display_name   "legacy-docker"
                                                 :status         :active
                                                 :enabled        true
                                                 :dev_bundle_url "http://host.docker.internal:5174"}
                       :model/CustomVizPlugin _ {:identifier     "legacy-external"
                                                 :display_name   "legacy-external"
                                                 :status         :active
                                                 :enabled        true
                                                 :dev_bundle_url "https://evil.com"}]
          (is (= [] (mw.security/custom-viz-dev-connect-src-hosts))))))))

(deftest custom-viz-dev-csp-is-superuser-only-test
  (mt/with-premium-features #{:custom-viz}
    (mt/with-temp [:model/CustomVizPlugin _ {:identifier     "dev-csp-mw"
                                             :display_name   "dev-csp-mw"
                                             :status         :active
                                             :enabled        true
                                             :dev_bundle_url "http://localhost:5174"}]
      (with-dev-mode-enabled
        (testing "a superuser's document can reach the dev server for the bundle and the icon"
          (doseq [directive ["connect-src" "img-src"]]
            (is (str/includes? (directive-for! directive {:is-superuser? true}) "http://localhost:5174")
                directive)))
        (testing "SECURITY: nobody else's document does"
          (doseq [request  [{:is-superuser? false} {}]
                  directive ["connect-src" "img-src"]]
            (is (not (str/includes? (directive-for! directive request) "http://localhost:5174"))
                (pr-str [directive request]))))
        (testing "SECURITY: the origin never lands in script-src -- the bundle is evaluated from fetched
                  text inside the near-membrane realm, so executable-source policy stays untouched"
          (is (not (str/includes? (directive-for! "script-src" {:is-superuser? true})
                                  "http://localhost:5174")))))
      (testing "with dev mode off a superuser's document is unchanged too"
        (is (not (str/includes? (directive-for! "connect-src" {:is-superuser? true})
                                "http://localhost:5174")))))))
