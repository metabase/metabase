(ns metabase.auth
  "Code relating to authentication process for the HTTP server."
  (:require
   [compojure.core :refer (defroutes GET ANY)]
   [cemerick.friend :as friend]
   (cemerick.friend [workflows :as workflows]
                    [credentials :as creds])
   [ring.util.response :as resp]))

(defn make-user [username password roles]
  {username {:username username
             :password (creds/hash-bcrypt password)
             :roles roles}})

(defn authed-users
  "Return a listing of authorized users. TODO - this is a obviously a temporary solution for testing purposes."
  []
  (->> [["crowberto" "password" #{:default}]
        ["sameer" "password" #{:default :admin}]
        ["allen" "password" #{:default :admin :superadmin}]]
       (map (partial apply make-user))
       (reduce merge)))

(def auth-settings
  "Settings for the `friend` library used in the auth process."
  {:allow-anon? true
   :login-uri "/login"                                 ; page to take users to perform login
   :default-landing-uri "/"                            ; where to take users after logging in
   :credential-fn (partial creds/bcrypt-credential-fn (authed-users))
   :workflows [(workflows/interactive-form)]})

(defn auth-middleware
  "Middleware fn that handles the auth process."
  [app]
  (friend/authenticate app auth-settings))

(defroutes routes
  (GET "/login" [] (resp/redirect "login.html"))              ; serve the static HTML login page
  (friend/logout (ANY "/logout" request (resp/redirect "/logout.html"))))

(defn- require-perms
  "Return a new fn that requires current user to have given set of permissions."
  [& perms]
  (fn [route-fn]
    (friend/authorize (set perms) route-fn)))
(def default-perms (require-perms :default))
(def admin-perms (require-perms :admin))
(def superadmin-perms (require-perms :super-admin))
