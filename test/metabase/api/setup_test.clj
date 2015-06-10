(ns metabase.api.setup-test
  "Tests for /api/setup endpoints."
  (:require [expectations :refer :all]
            [metabase.db :refer :all]
            [metabase.http-client :as http]
            (metabase.models [session :refer [Session]]
                             [user :refer [User]])
            [metabase.setup :as setup]
            (metabase.test [data :refer :all]
                           [util :refer [match-$ random-name expect-eval-actual-first]])))


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
(expect {:errors {:first_name "field is a required param."}}
  (http/client :post 400 "setup/user" {}))

(expect {:errors {:last_name "field is a required param."}}
  (http/client :post 400 "setup/user" {:first_name "anything"}))

(expect {:errors {:email "field is a required param."}}
  (http/client :post 400 "setup/user" {:first_name "anything"
                                       :last_name "anything"}))

(expect {:errors {:password "field is a required param."}}
  (http/client :post 400 "setup/user" {:first_name "anything"
                                       :last_name "anything"
                                       :email "anything@metabase.com"}))

(expect {:errors {:token "field is a required param."}}
  (http/client :post 400 "setup/user" {:first_name "anything"
                                       :last_name "anything"
                                       :email "anything@metabase.com"
                                       :password "anythingUP12!!"}))

;; valid email + complex password
(expect {:errors {:email "Invalid value 'anything' for 'email': Not a valid email address."}}
  (http/client :post 400 "setup/user" {:token "anything"
                                       :first_name "anything"
                                       :last_name "anything"
                                       :email "anything"
                                       :password "anything"}))

(expect {:errors {:password "Insufficient password strength"}}
  (http/client :post 400 "setup/user" {:token "anything"
                                       :first_name "anything"
                                       :last_name "anything"
                                       :email "anything@email.com"
                                       :password "anything"}))

;; token match
(expect {:errors {:token "Invalid value 'anything' for 'token': Token does not match the setup token."}}
  (http/client :post 400 "setup/user" {:token "anything"
                                       :first_name "anything"
                                       :last_name "anything"
                                       :email "anything@email.com"
                                       :password "anythingUP12!!"}))
