(ns metabase.test.data.users
  "Code related to creating / managing fake `Users` for testing purposes."
  (:require [medley.core :as m]
            (metabase [db :refer :all]
                      [http-client :as http])
            (metabase.models [user :refer [User]])
            [metabase.util :as u]
            [metabase.test.util :refer [random-name]]))

(declare fetch-or-create-user)

;; ## User definitions

;; ## Test Users
;;
;; These users have permissions for the Test. They are lazily created as needed.
;; Three test users are defined:
;; *  rasta
;; *  crowberto - superuser
;; *  lucky
;; *  trashbird - inactive

(def ^:private ^:const user->info
  {:rasta     {:email    "rasta@metabase.com"
               :first    "Rasta"
               :last     "Toucan"
               :password "blueberries"}
   :crowberto {:email     "crowberto@metabase.com"
               :first     "Crowberto"
               :last      "Corv"
               :password  "blackjet"
               :superuser true}
   :lucky     {:email    "lucky@metabase.com"
               :first    "Lucky"
               :last     "Pigeon"
               :password "almonds"}
   :trashbird {:email    "trashbird@metabase.com"
               :first    "Trash"
               :last     "Bird"
               :password "birdseed"
               :active   false}})

(def ^:private usernames
  (set (keys user->info)))

;; ## Public functions for working with Users

(defn create-user
  "Create a new `User` with random names + password."
  [& {:as kwargs}]
  (let [first-name (random-name)
        defaults   {:first_name first-name
                    :last_name  (random-name)
                    :email      (.toLowerCase ^String (str first-name "@metabase.com"))
                    :password   first-name}]
    (m/mapply ins User (merge defaults kwargs))))

(defn fetch-user
  "Fetch the User object associated with USERNAME.

    (fetch-user :rasta) -> {:id 100 :first_name \"Rasta\" ...}"
  [username]
  {:pre [(contains? usernames username)]}
  (m/mapply fetch-or-create-user (user->info username)))

(def user->id
  "Memoized fn that returns the ID of User associated with USERNAME.

    (user->id :rasta) -> 4"
  (memoize
   (fn [username]
     {:pre [(contains? usernames username)]}
     (:id (fetch-user username)))))

(defn user->credentials
  "Return a map with `:email` and `:password` for User with USERNAME.

    (user->credentials :rasta) -> {:email \"rasta@metabase.com\", :password \"blueberries\"}"
  [username]
  {:pre [(contains? usernames username)]}
  (select-keys (user->info username) [:email :password]))

(def id->user
  "Reverse of `user->id`.

    (id->user 4) -> :rasta"
  (let [m (delay (zipmap (map user->id usernames) usernames))]
    (fn [id]
      (@m id))))

(def ^:private tokens (atom {}))

(defn- username->token [username]
  (or (@tokens username)
      (u/prog1 (http/authenticate (user->credentials username))
        (swap! tokens assoc username <>))
      (throw (Exception. (format "Authentication failed for %s with credentials %s" username (user->credentials username))))))

(defn user->client
  "Returns a `metabase.http-client/client` partially bound with the credentials for User with USERNAME.
   In addition, it forces lazy creation of the User if needed.

     ((user->client) :get 200 \"meta/table\")"
  [username]
  ;; Force lazy creation of User if need be
  (user->id username)
  (fn client-fn [& args]
    (try
      (apply http/client (username->token username) args)
      (catch Throwable e
        (let [{:keys [status-code]} (ex-data e)]
          (when-not (= status-code 401)
            (throw e))
          ;; If we got a 401 unauthenticated clear the tokens cache + recur
          (reset! tokens {})
          (apply client-fn args))))))


;; ## Implementation

(defn- fetch-or-create-user
  "Create User if they don't already exist and return User."
  [& {:keys [email first last password superuser active]
      :or {superuser false
           active    true}}]
  {:pre [(string? email) (string? first) (string? last) (string? password) (m/boolean? superuser)]}
  (or (sel :one User :email email)
      (ins User
        :email        email
        :first_name   first
        :last_name    last
        :password     password
        :is_superuser superuser
        :is_qbnewb    true
        :is_active    active)))
