(ns metabase.server.middleware.settings-cache-test
  (:require
   [clj-http.cookies :as cookies]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.server.middleware.settings-cache :as mw.settings-cache]
   [metabase.settings.core :as setting]
   [metabase.settings.models.setting.cache :as setting.cache]
   [metabase.test :as mt]
   [ring.middleware.cookies :refer [wrap-cookies]]
   [ring.util.codec :as codec]
   [toucan2.core :as t2])
  (:import
   (org.apache.http.client CookieStore)))

(set! *warn-on-reflection* true)

(def cookie-name (var-get #'mw.settings-cache/settings-last-updated-cookie-name))

(deftest setting-a-setting-sets-the-marker-cookie-test
  (mt/discard-setting-changes [site-name]
    (let [^CookieStore cs (cookies/cookie-store)]
      (testing "it sets the cookie when updating settings"
        (mt/user-real-request  :crowberto :put 204 "setting/site-name"
                               {:request-options {:cookie-store cs}}
                               {:value "foo"})
        (let [setting-cookie (get (cookies/get-cookies cs) cookie-name)]
          (is (some? setting-cookie) "No cookie set")
          (is (= (setting/cached-marker)
                 (-> setting-cookie :value codec/form-decode))
              "Cookie value is not the cached marker")))
      (testing "a cookie that differs from the cached marker triggers a staleness check, not an unconditional reload"
        ;; The cookie value only prompts us to check the DB; it does not by itself say the cache is stale. Here the
        ;; cookie claims a far-future time but the DB has not actually changed, so the check finds nothing to reload.
        (let [check   #'mw.settings-cache/check-settings-cache-if-cookie-differs!
              request {:cookies {cookie-name {:value "2999-01-01 00:00:00.0+00"}}}
              calls   (atom 0)]
          (mt/with-dynamic-fn-redefs [setting.cache/restore-cache! (fn [_state] (swap! calls inc))]
            (check request))
          (is (zero? @calls) "a differing cookie does not reload the cache when the DB is unchanged"))))))

(defn- forced-checks!
  "Sends `request` through `handler`, returning `{:checks n, :response r}`: `n` is how many forced staleness checks
  the request made."
  [handler request]
  (let [calls (atom 0)
        check (mt/original-fn #'setting/restore-cache-if-needed!)]
    (mt/with-dynamic-fn-redefs [setting/restore-cache-if-needed! (fn [& args]
                                                                   (swap! calls inc)
                                                                   (apply check args))]
      (let [response (promise)]
        (handler request response #(throw %))
        {:checks @calls, :response (deref response 10000 ::timed-out)}))))

(deftest cookie-differing-from-the-cached-marker-forces-a-check-test
  (setting/restore-cache!)
  (let [marker  (setting/cached-marker)
        handler (mw.settings-cache/wrap-settings-cache-check (fn [_request respond _raise] (respond {:status 200})))
        checks  (fn [cookie]
                  (:checks (forced-checks! handler {:cookies (when cookie {cookie-name {:value cookie}})})))]
    (is (some? marker) "premise: the cache holds a marker")
    (is (= {:same 0, :older 1, :newer 1, :none 0}
           {:same  (checks marker)
            :older (checks "2000-01-01 00:00:00")
            :newer (checks "2999-01-01 00:00:00")
            :none  (checks nil)}))))

(deftest response-cookie-stops-the-forced-checks-test
  (testing "the cookie a response sets, sent back through cookie parsing, forces no further check"
    (setting/restore-cache!)
    (let [handler   (wrap-cookies
                     (mw.settings-cache/wrap-settings-cache-check
                      (fn [_request respond _raise] (respond {:status 200}))))
          request   (fn [cookie-header]
                      (forced-checks! handler {:headers {"cookie" cookie-header}}))
          differing (request (str cookie-name "=2000-01-01+00%3A00%3A00"))
          returned  (some-> differing :response (get-in [:headers "Set-Cookie"]) first (str/split #";") first)]
      (is (= {:differing-cookie-checks 1, :returned-cookie-checks 0}
             {:differing-cookie-checks (:checks differing)
              :returned-cookie-checks  (when returned
                                         (:checks (request returned)))})))))

(deftest no-marker-expires-the-cookie-test
  (testing "with no marker stored, the response to a request with a cookie expires it"
    (try
      (t2/delete! :setting :key setting.cache/settings-last-updated-key)
      (setting/restore-cache!)
      (is (nil? (setting/cached-marker)) "premise: no marker")
      (let [handler  (mw.settings-cache/wrap-settings-cache-check
                      (fn [_request respond _raise] (respond {:status 200})))
            response (:response (forced-checks! handler {:cookies {cookie-name {:value "2000-01-01 00:00:00"}}}))]
        (is (=? {cookie-name {:max-age 0}}
                (:cookies response))))
      (finally
        (setting.cache/update-settings-last-updated!)))))
