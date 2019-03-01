(ns metabase.api.setup-test
  "Tests for /api/setup endpoints."
  (:require [expectations :refer [expect]]
            [metabase
             [http-client :as http]
             [public-settings :as public-settings]
             [setup :as setup]]
            [metabase.models.user :refer [User]]
            [metabase.test.data.users :as test-users]
            [metabase.test.util :as tu]
            [toucan.db :as db]))

;; ## POST /api/setup/user
;; Check that we can create a new superuser via setup-token
(let [email (tu/random-email)]
  (expect
    {:uuid? true, :admin-email email}
    (try
      ;; make sure the default test users are created before running this test, otherwise we're going to run into
      ;; issues if it attempts to delete this user and it is the only admin test user
      (test-users/create-users-if-needed!)
      (tu/with-temporary-setting-values [admin-email nil]
        {:uuid?
         (tu/is-uuid-string? (:id (http/client :post 200 "setup" {:token (setup/create-token!)
                                                                  :prefs {:site_name "Metabase Test"}
                                                                  :user  {:first_name (tu/random-name)
                                                                          :last_name  (tu/random-name)
                                                                          :email      email
                                                                          :password   "anythingUP12!!"}})))

         :admin-email
         (do
           ;; reset our setup token
           (setup/create-token!)
           (public-settings/admin-email))})
      (finally
        (db/delete! User :email email)))))


;; Test input validations
(expect {:errors {:token "Token does not match the setup token."}}
  (http/client :post 400 "setup" {}))

(expect {:errors {:token "Token does not match the setup token."}}
  (http/client :post 400 "setup" {:token "foobar"}))

(expect {:errors {:site_name "value must be a non-blank string."}}
  (http/client :post 400 "setup" {:token (setup/token-value)}))

(expect {:errors {:first_name "value must be a non-blank string."}}
  (http/client :post 400 "setup" {:token (setup/token-value)
                                  :prefs {:site_name "awesomesauce"}}))

(expect {:errors {:last_name "value must be a non-blank string."}}
  (http/client :post 400 "setup" {:token (setup/token-value)
                                  :prefs {:site_name "awesomesauce"}
                                  :user {:first_name "anything"}}))

(expect {:errors {:email "value must be a valid email address."}}
  (http/client :post 400 "setup" {:token (setup/token-value)
                                  :prefs {:site_name "awesomesauce"}
                                  :user {:first_name "anything"
                                         :last_name "anything"}}))

(expect {:errors {:password "Insufficient password strength"}}
  (http/client :post 400 "setup" {:token (setup/token-value)
                                  :prefs {:site_name "awesomesauce"}
                                  :user {:first_name "anything"
                                         :last_name "anything"
                                         :email "anything@metabase.com"}}))

;; valid email + complex password
(expect {:errors {:email "value must be a valid email address."}}
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
(expect {:errors {:token "Token does not match the setup token."}}
  (http/client :post 400 "setup/validate" {}))

(expect {:errors {:token "Token does not match the setup token."}}
  (http/client :post 400 "setup/validate" {:token "foobar"}))

(expect {:errors {:engine "value must be a valid database engine."}}
  (http/client :post 400 "setup/validate" {:token (setup/token-value)}))
