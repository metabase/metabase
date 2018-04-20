(ns metabase.api.email-test
  (:require [expectations :refer :all]
            [metabase.models.setting :as setting]
            [metabase.test.data.users :refer [user->client]]))

(defn- email-settings
  []
  {:email-smtp-host     (setting/get :email-smtp-host)
   :email-smtp-port     (setting/get :email-smtp-port)
   :email-smtp-security (setting/get :email-smtp-security)
   :email-smtp-username (setting/get :email-smtp-username)
   :email-smtp-password (setting/get :email-smtp-password)
   :email-from-address  (setting/get :email-from-address)})

(def ^:private default-email-settings
  {:email-smtp-host     "foobar"
   :email-smtp-port     "789"
   :email-smtp-security "tls"
   :email-smtp-username "munchkin"
   :email-smtp-password "gobble gobble"
   :email-from-address  "eating@hungry.com"})

;; PUT /api/email - check updating email settings
(expect
  default-email-settings
  (let [orig-settings (email-settings)]
    (try
      ((user->client :crowberto) :put 200 "email" default-email-settings)
      (email-settings)
      (finally
        (setting/set-many! orig-settings)))))

;; DELETE /api/email - check clearing email settings
(expect
  [default-email-settings
   {:email-smtp-host nil,
    :email-smtp-port nil,
    :email-smtp-security "none",
    :email-smtp-username nil,
    :email-smtp-password nil,
    :email-from-address "notifications@metabase.com"}]
  (let [orig-settings (email-settings)]
    (try
      ((user->client :crowberto) :put 200 "email" default-email-settings)
      (let [new-email-settings (email-settings)]
        ((user->client :crowberto) :delete 204 "email")
        [new-email-settings
         (email-settings)])
      (finally
        (setting/set-many! orig-settings)))))
