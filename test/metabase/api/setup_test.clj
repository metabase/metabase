(ns metabase.api.setup-test
  "Tests for /api/setup endpoints."
  (:require [expectations :refer :all]
            [metabase.db :refer :all]
            [metabase.http-client :as http]
            (metabase.models [session :refer [Session]]
                             [setting :as setting]
                             [user :refer [User]])
            [metabase.setup :as setup]
            (metabase.test [data :refer :all]
                           [util :refer [match-$ random-name expect-eval-actual-first]])))


;; ## POST /api/setup/user
;; Check that we can create a new superuser via setup-token
(let [user-name (random-name)]
  (expect-eval-actual-first
    [(match-$ (->> (sel :one User :email (str user-name "@metabase.com"))
                  (:id)
                  (sel :one Session :user_id))
      {:id $id})
     (str user-name "@metabase.com")]
    (let [resp (http/client :post 200 "setup" {:token (setup/token-create)
                                               :prefs {:site_name "Metabase Test"}
                                               :user  {:first_name user-name
                                                       :last_name  user-name
                                                       :email      (str user-name "@metabase.com")
                                                       :password   "anythingUP12!!"}})]
      ;; reset our setup token
      (setup/token-create)
      ;; return api response
      [resp (setting/get :admin-email)])))


;; Test input validations
(expect {:errors {:token "field is a required param."}}
  (http/client :post 400 "setup" {}))

(expect {:errors {:token "Invalid value 'foobar' for 'token': Token does not match the setup token."}}
  (http/client :post 400 "setup" {:token "foobar"}))

(expect {:errors {:site_name "field is a required param."}}
  (http/client :post 400 "setup" {:token (setup/token-value)}))

(expect {:errors {:first_name "field is a required param."}}
  (http/client :post 400 "setup" {:token (setup/token-value)
                                  :prefs {:site_name "awesomesauce"}}))

(expect {:errors {:last_name "field is a required param."}}
  (http/client :post 400 "setup" {:token (setup/token-value)
                                  :prefs {:site_name "awesomesauce"}
                                  :user {:first_name "anything"}}))

(expect {:errors {:email "field is a required param."}}
  (http/client :post 400 "setup" {:token (setup/token-value)
                                  :prefs {:site_name "awesomesauce"}
                                  :user {:first_name "anything"
                                         :last_name "anything"}}))

(expect {:errors {:password "field is a required param."}}
  (http/client :post 400 "setup" {:token (setup/token-value)
                                  :prefs {:site_name "awesomesauce"}
                                  :user {:first_name "anything"
                                         :last_name "anything"
                                         :email "anything@metabase.com"}}))

;; valid email + complex password
(expect {:errors {:email "Invalid value 'anything' for 'email': Not a valid email address."}}
  (http/client :post 400 "setup" {:token (setup/token-value)
                                  :prefs {:site_name "awesomesauce"}
                                  :user {:token "anything"
                                         :first_name "anything"
                                         :last_name "anything"
                                         :email "anything"
                                         :password "anything"}}))

(expect {:errors {:password "Insufficient password strength"}}
  (http/client :post 400 "setup" {:token (setup/token-value)
                                  :prefs {:site_name "awesomesauce"}
                                  :user {:token "anything"
                                         :first_name "anything"
                                         :last_name "anything"
                                         :email "anything@email.com"
                                         :password "anything"}}))


;; ## POST /api/setup/validate
(expect {:errors {:token "field is a required param."}}
  (http/client :post 400 "setup/validate" {}))

(expect {:errors {:token "Invalid value 'foobar' for 'token': Token does not match the setup token."}}
  (http/client :post 400 "setup/validate" {:token "foobar"}))

(expect {:errors {:engine "field is a required param."}}
  (http/client :post 400 "setup/validate" {:token (setup/token-value)}))
