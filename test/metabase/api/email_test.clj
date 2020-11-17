(ns metabase.api.email-test
  (:require [clojure.test :refer :all]
            [metabase.models.setting :as setting]
            [metabase.test.data.users :refer [user->client]]
            [metabase.test.util :as tu]))

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
(deftest update-email-settings-test
  (testing "PUT /api/email"
    (tu/discard-setting-changes [email-smtp-host email-smtp-port email-smtp-security email-smtp-username
                                 email-smtp-password email-from-address]
      ((user->client :crowberto) :put 200 "email" default-email-settings)
      (is (= default-email-settings
             (email-settings))))))

;;
(deftest clear-email-settings-test
  (testing "DELETE /api/email"
    (tu/discard-setting-changes [email-smtp-host email-smtp-port email-smtp-security email-smtp-username
                                 email-smtp-password email-from-address]
      ((user->client :crowberto) :put 200 "email" default-email-settings)
      (let [new-email-settings (email-settings)]
        ((user->client :crowberto) :delete 204 "email")
        (is (= default-email-settings
               new-email-settings))
        (is (= {:email-smtp-host     nil
                :email-smtp-port     nil
                :email-smtp-security "none"
                :email-smtp-username nil
                :email-smtp-password nil
                :email-from-address  "notifications@metabase.com"}
               (email-settings)))))))
