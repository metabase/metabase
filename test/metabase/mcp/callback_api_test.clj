(ns metabase.mcp.callback-api-test
  (:require
   [clojure.test :refer :all]
   [metabase.mcp.session :as mcp.session]
   [metabase.test :as mt]
   [metabase.test.data.users :as test.users]
   [metabase.test.fixtures :as fixtures]
   [metabase.test.http-client :as client]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db :test-users))

(defn- post-drill
  "POST /api/embed-mcp/drills as `user` (default :crowberto), with optional headers
   and an `expected-status` for non-200 cases."
  ([body extra-headers]
   (post-drill :crowberto 200 body extra-headers))
  ([user expected-status body extra-headers]
   (client/client-full-response (test.users/username->token user)
                                :post expected-status "embed-mcp/drills"
                                {:request-options {:headers extra-headers}}
                                body)))

(deftest drills-post-stores-handle-test
  (testing "POST returns a UUID handle that round-trips through read-handle"
    (let [user-id    (mt/user->id :crowberto)
          session-id (mcp.session/create! user-id)
          response   (post-drill {:encodedQuery "ZW5jb2RlZA=="}
                                 {"mcp-session-id" session-id})
          handle     (get-in response [:body :handle])]
      (is (=? {:status 200
               :body   {:handle parse-uuid}}
              response))
      (is (= "ZW5jb2RlZA==" (mcp.session/read-handle session-id handle))))))

(deftest drills-post-validates-session-header-test
  (testing "missing Mcp-Session-Id header returns 400"
    (is (=? {:status 400}
            (post-drill :crowberto 400 {:encodedQuery "ZW5jb2RlZA=="} {}))))

  (testing "non-UUID Mcp-Session-Id returns 404"
    (is (=? {:status 404}
            (post-drill :crowberto 404 {:encodedQuery "ZW5jb2RlZA=="}
                        {"mcp-session-id" "not-a-uuid"}))))

  (testing "session owned by a different user returns 404"
    (let [owner   (mt/user->id :crowberto)
          session (mcp.session/create! owner)
          _       (mcp.session/get-or-create-session-key! session owner)]
      (is (=? {:status 404}
              (post-drill :rasta 404 {:encodedQuery "ZW5jb2RlZA=="}
                          {"mcp-session-id" session}))))))

(deftest drills-post-rejects-blank-body-test
  (testing "blank encodedQuery returns 400"
    (let [user-id    (mt/user->id :crowberto)
          session-id (mcp.session/create! user-id)]
      (is (=? {:status 400}
              (post-drill :crowberto 400 {:encodedQuery ""}
                          {"mcp-session-id" session-id}))))))

(deftest drills-post-requires-auth-test
  (testing "unauthenticated request returns 401"
    (is (=? {:status 401}
            (client/client-full-response :post 401 "embed-mcp/drills"
                                         {:encodedQuery "ZW5jb2RlZA=="})))))
