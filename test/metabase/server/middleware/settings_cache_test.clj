(ns metabase.server.middleware.settings-cache-test
  (:require
   [clj-http.cookies :as cookies]
   [clojure.test :refer :all]
   [metabase.server.middleware.settings-cache :as mw.settings-cache]
   [metabase.settings.core :as setting]
   [metabase.test :as mt]
   [ring.util.codec :as codec])
  (:import
   (org.apache.http.client CookieStore)
   (org.apache.http.cookie Cookie)
   (org.apache.http.impl.cookie BasicClientCookie)))

(set! *warn-on-reflection* true)

(def cookie-name (var-get #'mw.settings-cache/settings-last-updated-cookie-name))

(defn- update-cookie
  "Update the cookie in a cookie store with name `k` giving it value `v`. Keeps other properties like expiration and
  domain. Throws an error if the cookie is not found"
  [^CookieStore cs k v]
  (let [cookies (.getCookies cs)
        ^BasicClientCookie cookie (or (some (fn [^Cookie c] (when (= k (.getName c))
                                                              c))
                                            cookies)
                                      (throw (ex-info "Did not find cookie"
                                                      {:looking-for k
                                                       :found (into []
                                                                    (map Cookie/.getName)
                                                                    cookies)})))]
    (.setValue cookie v)
    (.addCookie cs cookie)))

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

      (testing "And when that timestamp is outdated it restores the setting cache"
        (let [calls (atom 0)]
          ;; value in 2042 to simulate client has more recent settings
          (update-cookie cs cookie-name "2042-12-02+19%3A57%3A49.775909%2B00")
          (with-redefs [setting/restore-cache! (fn [] (swap! calls inc))]
            (mt/user-real-request :crowberto :get 200 "user/current"
                                  {:request-options {:cookie-store cs}})
            (is (= 1 @calls) "Cache was not restored based on cookie value")
            (testing "And that header resets the settings last updated at so we don't keep updating the cache"
              (let [setting-cookie (get (cookies/get-cookies cs) cookie-name)]
                (is (some? setting-cookie) "No cookie set")
                (is (= (setting/cache-last-updated-at)
                       (-> setting-cookie :value codec/form-decode))
                    "The most recent updated at was not set in the header")))))))))
