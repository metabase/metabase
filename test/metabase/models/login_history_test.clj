(ns metabase.models.login-history-test
  (:require [clojure.test :refer :all]
            [java-time :as t]
            [metabase.models.login-history :as login-history]
            [metabase.test :as mt]))

(deftest describe-user-agent-test
  (mt/are+ [user-agent expected] (= expected (#'login-history/describe-user-agent user-agent))
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML  like Gecko) Chrome/89.0.4389.86 Safari/537.36"
    "Browser (Chrome/Windows)"


    "Mozilla/5.0 (iPhone; CPU iPhone OS 10_3_1 like Mac OS X) AppleWebKit/603.1.30 (KHTML  like Gecko) Version/10.0 Mobile/14E304 Safari/602.1"
    "Mobile Browser (Mobile Safari/iOS)"

    "Apache-HttpClient/4.5.10 (Java/14.0.1)"
    "Library (Apache-HttpClient/JVM (Java))"

    "wow"
    "Unknown device type (unknown/unknown)"

    "   "
    nil

    nil
    nil))

(deftest geocode-ip-address-test
  (mt/are+ [ip-address expected] (= expected (#'login-history/geocode-ip-address ip-address))
    "8.8.8.8"
    {:description "United States", :timezone (t/zone-id "America/Chicago")}

    ;; this is from the MaxMind sample high-risk IP address list https://www.maxmind.com/en/high-risk-ip-sample-list
    "185.233.100.23"
    {:description "Begles, Nouvelle-Aquitaine, France", :timezone (t/zone-id "Europe/Paris")}

    "127.0.0.1"
    {:description "Unknown location", :timezone nil}

    "0:0:0:0:0:0:0:1"
    {:description "Unknown location", :timezone nil}

    ;; store.metabase.com
    "52.206.149.9"
    {:description "Ashburn, Virginia, United States", :timezone (t/zone-id "America/New_York")}

    ;; Google DNS
    "2001:4860:4860::8844"
    {:description "United States", :timezone (t/zone-id "America/Chicago")}

    "wow"
    nil

    "   "
    nil

    nil
    nil))

(deftest nicely-format-login-history-test
  (is (= [{:timestamp          #t "2021-03-18T20:52:41.808482+01:00[Europe/Paris]"
           :device_description "Browser (Chrome/Windows)"
           :ip_address         "185.233.100.23"
           :active             true
           :location           "Begles, Nouvelle-Aquitaine, France"
           :timezone           "CET"}
          {:timestamp          #t "2021-03-18T20:04:24.727300Z[UTC]"
           :device_description "Library (Apache-HttpClient/JVM (Java))"
           :ip_address         "127.0.0.1"
           :active             false
           :location           "Unknown location"
           :timezone           nil}
          {:timestamp          #t "2021-03-18T20:55:50.955232Z[UTC]"
           :device_description "Mobile Browser (Mobile Safari/iOS)"
           :ip_address         "0:0:0:0:0:0:0:1"
           :active             false
           :location           "Unknown location"
           :timezone           nil}
          {:timestamp          #t "2021-03-18T15:52:20.172351-04:00[America/New_York]"
           :device_description "Browser (Chrome/Windows)"
           :ip_address         "52.206.149.9"
           :active             false
           :location           "Ashburn, Virginia, United States"
           :timezone           "ET"}
          {:timestamp          #t "2021-03-17T15:00-04:00[America/New_York]"
           :device_description "Browser (Chrome/Windows)"
           :ip_address         "52.206.149.9"
           :active             false
           :location           "Ashburn, Virginia, United States"
           :timezone           "ET"}]
         (map
          #'login-history/nicely-format-login-history
          [{:timestamp          #t "2021-03-18T19:52:41.808482Z"
            :device_description "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML  like Gecko) Chrome/89.0.4389.86 Safari/537.36"
            :ip_address         "185.233.100.23"
            :active             true}
           {:timestamp          #t "2021-03-18T20:04:24.727300Z"
            :device_description "Apache-HttpClient/4.5.10 (Java/14.0.1)"
            :ip_address         "127.0.0.1"
            :active             false}
           {:timestamp          #t "2021-03-18T20:55:50.955232Z"
            :device_description "Mozilla/5.0 (iPhone; CPU iPhone OS 10_3_1 like Mac OS X) AppleWebKit/603.1.30 (KHTML  like Gecko) Version/10.0 Mobile/14E304 Safari/602.1"
            :ip_address         "0:0:0:0:0:0:0:1"
            :active             false}
           {:timestamp          #t "2021-03-18T19:52:20.172351Z"
            :device_description "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML  like Gecko) Chrome/89.0.4389.86 Safari/537.36"
            :ip_address         "52.206.149.9"
            :active             false}
           {:timestamp          #t "2021-03-17T19:00Z"
            :device_description "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML  like Gecko) Chrome/89.0.4389.86 Safari/537.36"
            :ip_address         "52.206.149.9"
            :active             false}]))))
