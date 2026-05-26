(ns metabase.oauth-server.task.cleanup-expired-tokens-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.oauth-server.task.cleanup-expired-tokens :as cleanup]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- uuid [] (str (random-uuid)))

(deftest cleanup-expired-tokens-test
  (mt/with-empty-h2-app-db!
    (let [now                    (System/currentTimeMillis)
          past-ms                (- now 60000)
          future-ms              (+ now 3600000)
          client-id              (uuid)
          base                   {:user_id   (mt/user->id :rasta)
                                  :client_id client-id
                                  :scope     ["openid"]}
          redirect-uri           "https://example.com/cb"
          live-code              (uuid)
          live-access            (uuid)
          live-refresh           (uuid)
          live-no-expiry-refresh (uuid)]
      (t2/insert! :model/OAuthAuthorizationCode
                  [(merge base {:code live-code               :expiry future-ms :redirect_uri redirect-uri})
                   (merge base {:code (uuid)                  :expiry past-ms   :redirect_uri redirect-uri})])
      (t2/insert! :model/OAuthAccessToken
                  [(merge base {:token live-access            :expiry future-ms})
                   (merge base {:token (uuid)                 :expiry past-ms})
                   (merge base {:token (uuid)                 :expiry future-ms :revoked_at :%now})])
      (t2/insert! :model/OAuthRefreshToken
                  [(merge base {:token live-refresh           :expiry future-ms})
                   (merge base {:token (uuid)                 :expiry past-ms})
                   (merge base {:token (uuid)                 :expiry future-ms :revoked_at :%now})
                   (merge base {:token live-no-expiry-refresh :expiry nil})])
      (cleanup/cleanup-expired-tokens!)
      (let [surviving (fn [model col] (t2/select-fn-set col [model col] :client_id client-id))]
        (testing "only the live authorization code survives"
          (is (= #{live-code}
                 (surviving :model/OAuthAuthorizationCode :code))))
        (testing "only the live access token survives (expired and revoked are deleted)"
          (is (= #{live-access}
                 (surviving :model/OAuthAccessToken :token))))
        (testing "live and null-expiry refresh tokens survive; expired and revoked are deleted"
          (is (= #{live-refresh live-no-expiry-refresh}
                 (surviving :model/OAuthRefreshToken :token))))))))
