(ns metabase.api.email-test
  (:require [expectations :refer :all]
            [metabase.email-test :refer [with-fake-inbox inbox]]
            [metabase.models.setting :as setting]
            [metabase.test.data.users :refer :all]))


(defn- email-settings
  []
  {:email-smtp-host     (setting/get :email-smtp-host)
   :email-smtp-port     (setting/get :email-smtp-port)
   :email-smtp-security (setting/get :email-smtp-security)
   :email-smtp-username (setting/get :email-smtp-username)
   :email-smtp-password (setting/get :email-smtp-password)
   :email-from-address  (setting/get :email-from-address)})

;; /api/email/test - sends a test email to the given user
(expect
  {:email-smtp-host     "foobar"
   :email-smtp-port     "789"
   :email-smtp-security "tls"
   :email-smtp-username "munchkin"
   :email-smtp-password "gobble gobble"
   :email-from-address  "eating@hungry.com"}
  (let [orig-settings (email-settings)
        _             ((user->client :crowberto) :put 200 "email" {:email-smtp-host     "foobar"
                                                                   :email-smtp-port     "789"
                                                                   :email-smtp-security "tls"
                                                                   :email-smtp-username "munchkin"
                                                                   :email-smtp-password "gobble gobble"
                                                                   :email-from-address  "eating@hungry.com"})
        new-settings  (email-settings)
        _             (setting/set-many! orig-settings)]
    new-settings))


;; with-fake-inbox doesn't work in this case because of the api call
;; /api/email/test - sends a test email to the given user
;(expect
;  [{:from "notifications@metabase.com",
;    :to [(-> (fetch-user :crowberto) :email)],
;    :subject "Metabase Test Email",
;    :body [{:type    "text/plain; charset=utf-8"
;            :content "Your Metabase emails are working — hooray!"}]}]
;  (with-fake-inbox
;    ((user->client :crowberto) :post 200 "email/test")
;    (@inbox (-> (fetch-user :crowberto) :email))))
