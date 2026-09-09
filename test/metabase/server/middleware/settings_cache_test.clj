(ns metabase.server.middleware.settings-cache-test
  (:require
   [clj-http.cookies :as cookies]
   [clojure.test :refer :all]
   [metabase.server.middleware.settings-cache :as mw.settings-cache]
   [metabase.settings.core :as setting]
   [metabase.settings.models.setting.cache :as setting.cache]
   [metabase.test :as mt]
   [ring.util.codec :as codec])
  (:import
   (org.apache.http.client CookieStore)))

(set! *warn-on-reflection* true)

(def cookie-name (var-get #'mw.settings-cache/settings-last-updated-cookie-name))

(deftest setting-settings-include-timestamp
  (mt/discard-setting-changes [site-name]
    (let [^CookieStore cs (cookies/cookie-store)]
      (testing "it sets the cookie when updating settings"
        (mt/user-real-request  :crowberto :put 204 "setting/site-name"
                               {:request-options {:cookie-store cs}}
                               {:value "foo"})
        (let [setting-cookie (get (cookies/get-cookies cs) cookie-name)]
          (is (some? setting-cookie) "No cookie set")
          (is (= (setting/cache-last-updated-at)
                 (-> setting-cookie :value codec/form-decode))
              "Cookie value is not most recent cache updated at timestamp")))
      (testing "a newer cookie timestamp triggers a staleness check, not an unconditional reload"
        ;; The cookie value only prompts us to check the DB; it does not by itself say the cache is stale. Here the
        ;; cookie claims a far-future time but the DB has not actually changed, so the check finds nothing to reload.
        (let [check   #'mw.settings-cache/check-and-update-settings-cache
              request {:cookies {cookie-name {:value "2999-01-01 00:00:00.0+00"}}}
              calls   (atom 0)]
          (mt/with-dynamic-fn-redefs [setting.cache/restore-cache! (fn [] (swap! calls inc))]
            (check request))
          (is (zero? @calls) "an ahead-of-DB cookie does not reload the cache when the DB is unchanged"))))))
