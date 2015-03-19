(ns metabase.api.setup-test
  "Tests for /api/setup endpoints."
  (:require [expectations :refer :all]
            [metabase.db :refer :all]
            [metabase.http-client :as http]
            (metabase.models [session :refer [Session]]
                             [user :refer [User]])
            [metabase.setup :as setup]
            [metabase.test.util :refer [match-$ random-name expect-eval-actual-first]]
            [metabase.test-data :refer :all]))


;; ## POST /api/setup/user
;; Check that we can create a new superuser via setup-token
(let [setup-token (setup/token-create)
      user-name (random-name)]
  (expect-eval-actual-first
    (match-$ (->> (sel :one User :email (str user-name "@metabase.com"))
               (:id)
               (sel :one Session :user_id))
      {:id $id})
    (http/client :post 200 "setup/user" {:token setup-token
                                         :first_name user-name
                                         :last_name user-name
                                         :email (str user-name "@metabase.com")
                                         :password "anythingUP12!!"})))


;; Test input validations
(expect "'token' is a required param."
  (http/client :post 400 "setup/user" {}))

(expect "'first_name' is a required param."
  (http/client :post 400 "setup/user" {:token "anything"}))

(expect "'last_name' is a required param."
  (http/client :post 400 "setup/user" {:token "anything"
                                       :first_name "anything"}))

(expect "'email' is a required param."
  (http/client :post 400 "setup/user" {:token "anything"
                                       :first_name "anything"
                                       :last_name "anything"}))

(expect "'password' is a required param."
  (http/client :post 400 "setup/user" {:token "anything"
                                       :first_name "anything"
                                       :last_name "anything"
                                       :email "anything"}))

;; valid email + complex password
(expect "Invalid Request."
  (http/client :post 400 "setup/user" {:token "anything"
                                       :first_name "anything"
                                       :last_name "anything"
                                       :email "anything"
                                       :password "anything"}))

(expect "Invalid Request."
  (http/client :post 400 "setup/user" {:token "anything"
                                       :first_name "anything"
                                       :last_name "anything"
                                       :email "anything@email.com"
                                       :password "anything"}))

;; token match
(expect "You don't have permissions to do that."
  (http/client :post 403 "setup/user" {:token "anything"
                                       :first_name "anything"
                                       :last_name "anything"
                                       :email "anything@email.com"
                                       :password "anythingUP12!!"}))
