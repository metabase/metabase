(ns metabase.oauth-server.last-use-test
  "The `last_used_at` write-back as every instance does it, licensed or not, observed through a real bearer request.

  The two cases here read the column directly, which the premium list and detail endpoints exist to avoid: one runs
  with no premium features, so no endpoint can reach it, and the other needs the OAuth module's own throttle window
  rather than anything an endpoint exposes. What the write-back looks like to an admin is asserted through the HTTP
  API in [[metabase-enterprise.oauth-client-management.api-test]]."
  (:require
   [clojure.test :refer [deftest is testing use-fixtures]]
   [java-time.api :as t]
   [metabase.initialization-status.core :as init-status]
   [metabase.oauth-server.core :as oauth-server]
   [metabase.oauth-server.last-use :as last-use]
   [metabase.oauth-server.test-util :as oauth-server.tu]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db :web-server :test-users))

;; The bearer path is gated on initialization being complete; the isolated test runner never boots the web server, so
;; mark it complete as the bearer-bridge and revoke tests do.
(init-status/set-complete!)

(def ^:private full-access
  "The scope a bearer token needs to reach the general REST API, which is where these tests present one."
  ["mb:full"])

(def ^:private long-ago #t "2026-01-01T00:00:00Z")

(defn- last-used-at
  "When the client with `client-id` was last used, straight off the row."
  [client-id]
  (t2/select-one-fn :last_used_at :model/OAuthClient :client_id client-id))

(defn- set-last-used!
  "Backdate `client-id`'s last use, so a later write shows up as a change rather than needing a clock with
  sub-millisecond resolution."
  [client-id instant]
  (t2/update! :model/OAuthClient {:client_id client-id} {:last_used_at instant}))

(defn- with-granted-client!
  "Register a client through the public `/oauth/register`, drive the authorization-code flow as `user`, and call `f`
  with its `client_id` and a live access token. Rows are cleaned up afterwards rather than rolled back: a
  rollback-only transaction cannot be held open across the HTTP round-trips the flow makes."
  [user f]
  (mt/with-temporary-setting-values [site-url                                  "http://localhost:3000"
                                     oauth-server-dynamic-registration-enabled true]
    (mt/with-model-cleanup [:model/OAuthClient :model/OAuthClientEvent :model/OAuthAccessToken
                            :model/OAuthRefreshToken :model/OAuthAuthorizationCode]
      (let [client (oauth-server.tu/register-client! full-access)
            token  (:access_token (oauth-server.tu/grant! user client full-access))]
        ;; the throttle outlives any one test, so a client id another test happened to use must not decide whether
        ;; this one writes
        (oauth-server/clear-client-use-cache!)
        (f (:client_id client) token)))))

(deftest last-used-is-written-without-a-token-feature-test
  (testing "the write-back is enforced on every instance: an unlicensed one records the client's last use too, even
            though only the premium endpoints can read it back"
    (mt/with-premium-features #{}
      (with-granted-client!
        :rasta
        (fn [client-id token]
          (testing "a client that has registered but never acted carries no last use"
            (is (nil? (last-used-at client-id))))
          (oauth-server.tu/current-user-with-bearer token)
          (testing "and the bearer request records one"
            (is (some? (last-used-at client-id)))))))))

(deftest last-used-is-written-again-once-the-window-has-passed-test
  (testing "a request after the throttle window writes again, so a client in use keeps a current last-used time
            rather than only ever recording the first request"
    (with-granted-client!
      :rasta
      (fn [client-id token]
        (oauth-server.tu/current-user-with-bearer token)
        (is (some? (last-used-at client-id)))
        ;; the window rather than the clock: `mt/with-dynamic-fn-redefs` only reaches threads that inherit the
        ;; caller's bindings, and the request is served on a server thread, which would never see a stubbed
        ;; `u/since-ms`. With the window at zero the client's timer is still in the cache, so this is the elapsed
        ;; comparison being exercised and not the "never seen before" branch a cleared cache would hit.
        (with-redefs-fn {#'last-use/last-used-write-throttle-ms 0}
          (fn []
            (set-last-used! client-id long-ago)
            (oauth-server.tu/current-user-with-bearer token)))
        (let [written (last-used-at client-id)]
          (is (some? written))
          (is (not= (t/instant long-ago) (t/instant written))
              "the request wrote again rather than leaving the backdated value"))))))
