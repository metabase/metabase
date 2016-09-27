(ns metabase.api.setup-test
  "Tests for /api/setup endpoints."
  (:require [expectations :refer :all]
            [metabase.db :as db]
            [metabase.http-client :as http]
            (metabase.models [session :refer [Session]]
                             [setting :as setting]
                             [user :refer [User]])
            (metabase [public-settings :as public-settings]
                      [setup :as setup])
            (metabase.test [data :refer :all]
                           [util :refer [match-$ random-name], :as tu])
            [metabase.util :as u]))


;; ## POST /api/setup/user
;; Check that we can create a new superuser via setup-token
(let [user-name (random-name)
      email     (str user-name "@metbase.com")]
  (expect
    [true
     email]
    [(tu/is-uuid-string? (:id (http/client :post 200 "setup" {:token (setup/create-token!)
                                                              :prefs {:site_name "Metabase Test"}
                                                              :user  {:first_name user-name
                                                                      :last_name  user-name
                                                                      :email      email
                                                                      :password   "anythingUP12!!"}})))
     (do
       ;; reset our setup token
       (setup/create-token!)
       (public-settings/admin-email))]))


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
