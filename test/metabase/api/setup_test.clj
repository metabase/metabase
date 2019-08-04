(ns metabase.api.setup-test
  "Tests for /api/setup endpoints."
  (:require [expectations :refer [expect]]
            [medley.core :as m]
            [metabase
             [email :as email]
             [http-client :as http]
             [public-settings :as public-settings]
             [setup :as setup]]
            [metabase.api.setup :as setup-api]
            [metabase.integrations.slack :as slack]
            [metabase.models
             [database :refer [Database]]
             [user :refer [User]]]
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
      (tu/discard-setting-changes [site-name anon-tracking-enabled admin-email]
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


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                  POST /setup                                                   |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- setup-body [token db-name user-email]
  {:token    token
   :prefs    {:site_name "Test", :allow_tracking "true"},
   :database {:engine           "h2"
              :name             db-name
              :details          {:db  "file:/home/hansen/Downloads/Metabase/longnames.db",
                                 :ssl true}
              :auto_run_queries false}
   :user     {:first_name (tu/random-name)
              :last_name  (tu/random-name)
              :email      user-email
              :password   "Testtest1"
              :site_name  "Test"}})

(defn- do-setup [f]
  (let [token      (setup/create-token!)
        db-name    (tu/random-name)
        user-email (tu/random-email)
        body       (setup-body token db-name user-email)]
    (try
      (tu/discard-setting-changes [site-name anon-tracking-enabled admin-email]
        (f body token db-name user-email))
      (finally
        (db/delete! Database :name db-name)
        (db/delete! User :email user-email)))))

(defmacro ^:private setup
  {:style/indent 1}
  [[body-binding token-binding db-name-binding user-email-binding] & body]
  `(do-setup (fn [~(or body-binding '_) ~(or token-binding '_) ~(or db-name-binding '_) ~(or user-email-binding '_)]
               ~@body)))

;; Check that we can Create a Database when we set up MB (#10135)
(expect
  {:db-exists? true, :user-exists? true}
  (setup [body _ db-name user-email]
    (http/client :post 200 "setup" body)
    {:db-exists?   (db/exists? Database :name db-name)
     :user-exists? (db/exists? User :email user-email)}))

;; Test input validations
(expect
  {:errors {:token "Token does not match the setup token."}}
  (setup [body]
    (http/client :post 400 "setup" (dissoc body :token))))

(expect
  {:errors {:token "Token does not match the setup token."}}
  (setup [body]
    (http/client :post 400 "setup" (assoc body :token "foobar"))))

(expect
  {:errors {:site_name "value must be a non-blank string."}}
  (setup [body]
    (http/client :post 400 "setup" (m/dissoc-in body [:prefs :site_name]))))

(expect
  {:errors {:first_name "value must be a non-blank string."}}
  (setup [body]
    (http/client :post 400 "setup" (m/dissoc-in body [:user :first_name]))))

(expect
  {:errors {:last_name "value must be a non-blank string."}}
  (setup [body]
    (http/client :post 400 "setup" (m/dissoc-in body [:user :last_name]))))

(expect
  {:errors {:email "value must be a valid email address."}}
  (setup [body]
    (http/client :post 400 "setup" (m/dissoc-in body [:user :email]))))

(expect
  {:errors {:password "Insufficient password strength"}}
  (setup [body]
    (http/client :post 400 "setup" (m/dissoc-in body [:user :password]))))

;; valid email + complex password
(expect
  {:errors {:email "value must be a valid email address."}}
  (setup [body]
    (http/client :post 400 "setup" (assoc-in body [:user :email] "anything"))))

(expect
  {:errors {:password "Insufficient password strength"}}
  (setup [body]
    (http/client :post 400 "setup" (assoc-in body [:user :password] "anything"))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                            POST /api/setup/validate                                            |
;;; +----------------------------------------------------------------------------------------------------------------+

(expect
  {:errors {:token "Token does not match the setup token."}}
  (http/client :post 400 "setup/validate" {}))

(expect
  {:errors {:token "Token does not match the setup token."}}
  (http/client :post 400 "setup/validate" {:token "foobar"}))

(expect
  {:errors {:engine "value must be a valid database engine."}}
  (http/client :post 400 "setup/validate" {:token (setup/token-value)}))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                         GET /api/setup/admin_checklist                                         |
;;; +----------------------------------------------------------------------------------------------------------------+

;; basic sanity check
(expect
  [{:name  "Get connected"
    :tasks [{:title        "Add a database"
             :completed    true
             :triggered    true
             :is_next_step false}
            {:title        "Set up email"
             :completed    true
             :triggered    true
             :is_next_step false}
            {:title        "Set Slack credentials"
             :completed    false
             :triggered    true
             :is_next_step true}
            {:title        "Invite team members"
             :completed    true
             :triggered    true
             :is_next_step false}]}
   {:name  "Curate your data"
    :tasks [{:title        "Hide irrelevant tables"
             :completed    true
             :triggered    false
             :is_next_step false}
            {:title        "Organize questions"
             :completed    true
             :triggered    false
             :is_next_step false}
            {:title        "Create metrics"
             :completed    true
             :triggered    false
             :is_next_step false}
            {:title        "Create segments"
             :completed    true
             :triggered    false
             :is_next_step false}]}]
  (with-redefs [db/exists?              (constantly true)
                db/count                (constantly 5)
                email/email-configured? (constantly true)
                slack/slack-configured? (constantly false)]
    (for [{group-name :name, tasks :tasks} (#'setup-api/admin-checklist)]
      {:name  (str group-name)
       :tasks (for [task tasks]
                (-> (select-keys task [:title :completed :triggered :is_next_step])
                    (update :title str)))})))
