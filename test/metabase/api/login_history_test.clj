(ns ^:mb/once metabase.api.login-history-test
  (:require
   [clojure.test :refer :all]
   [metabase.models :refer [LoginHistory Session User]]
   [metabase.test :as mt]
   [metabase.util :as u]
   [schema.core :as s]))

(set! *warn-on-reflection* true)

(def ^:private windows-user-agent
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML like Gecko) Chrome/89.0.4389.86 Safari/537.36")

(def ^:private ios-user-agent
  "Mozilla/5.0 (iPhone; CPU iPhone OS 10_3_1 like Mac OS X) AppleWebKit/603.1.30 (KHTML  like Gecko) Version/10.0 Mobile/14E304 Safari/602.1")

(defn- if-non-nil
  "Returns a schema that matches the provided value `v` if a value is non-nil, otherwise expects nil. Handling issues in
  geojson.io."
  [v]
  (let [non-nil-check (cond-> v
                        ;; regexes are matchers otherwise check for s/eq
                        (not (instance? java.util.regex.Pattern v))
                        (s/eq))]
    (s/conditional some? non-nil-check nil? (s/eq nil))))

(deftest login-history-test
  (testing "GET /api/login-history/current"
    (let [session-id (str (java.util.UUID/randomUUID))
          device-id  "e9b49ec7-bc64-4a83-9b1a-ecd3ae26ba9d"]
      (mt/with-temp* [User         [user]
                      Session      [_ {:id session-id, :user_id (u/the-id user)}]
                      LoginHistory [_ {:timestamp          #t "2021-03-18T19:52:41.808482Z"
                                       :user_id            (u/the-id user)
                                       :device_id          device-id
                                       :device_description windows-user-agent
                                       :ip_address         "185.233.100.23"
                                       :session_id         session-id}]
                      LoginHistory [_ {:timestamp          #t "2021-03-18T20:04:24.727300Z"
                                       :user_id            (u/the-id user)
                                       :device_id          device-id
                                       :device_description "Apache-HttpClient/4.5.10 (Java/14.0.1)"
                                       :ip_address         "127.0.0.1"}]
                      LoginHistory [_ {:timestamp          #t "2021-03-18T20:55:50.955232Z"
                                       :user_id            (u/the-id user)
                                       :device_id          device-id
                                       :device_description ios-user-agent
                                       :ip_address         "0:0:0:0:0:0:0:1"}]
                      LoginHistory [_ {:timestamp          #t "2021-03-18T19:52:20.172351Z"
                                       :user_id            (u/the-id user)
                                       :device_id          device-id
                                       :device_description windows-user-agent
                                       :ip_address         "52.206.149.9"}]
                      ;; this one shouldn't show up because it's from a different User
                      LoginHistory [_ {:timestamp          #t "2021-03-17T19:00Z"
                                       :user_id            (mt/user->id :rasta)
                                       :device_id          device-id
                                       :device_description windows-user-agent
                                       :ip_address         "52.206.149.9"}]]
        ;; GeoJS is having issues. We have safe error handling so we expect either nil or the expected values.
        ;; https://github.com/jloh/geojs/issues/48
        ;; The timestamps will also need to be updated (to be in the TZ, not in Zulu time)
        ;;
        ;; A Slack reminder has been set to follow up on this
        (is (schema= [(s/one
                       {:timestamp          (s/eq "2021-03-18T20:55:50.955232Z")
                        :device_description (s/eq "Mobile Browser (Mobile Safari/iOS)")
                        :ip_address         (s/eq "0:0:0:0:0:0:0:1")
                        :active             (s/eq false)
                        :location           (if-non-nil "Unknown location")
                        :timezone           (s/eq nil)}
                       "localhost ipv6")
                      (s/one
                       {:timestamp          (s/eq "2021-03-18T20:04:24.7273Z")
                        :device_description (s/eq "Library (Apache-HttpClient/JVM (Java))")
                        :ip_address         (s/eq "127.0.0.1")
                        :active             (s/eq false)
                        :location           (if-non-nil "Unknown location")
                        :timezone           (s/eq nil)}
                       "localhost ipv4")
                      (s/one
                       {:timestamp          (s/eq "2021-03-18T20:52:41.808482+01:00")
                        :device_description (s/eq "Browser (Chrome/Windows)")
                        :ip_address         (s/eq "185.233.100.23")
                        :active             (s/eq true)
                        :location           (if-non-nil #"France")
                        :timezone           (if-non-nil "CET")}
                       "France")
                      (s/one
                       {:timestamp          (s/eq "2021-03-18T15:52:20.172351-04:00")
                        :device_description (s/eq "Browser (Chrome/Windows)")
                        :ip_address         (s/eq "52.206.149.9")
                        :active             (s/eq false)
                        :location           (if-non-nil "Ashburn, Virginia, United States")
                        :timezone           (if-non-nil "ET")}
                       "Virginia")]
                     (mt/client session-id :get 200 "login-history/current")))))))
