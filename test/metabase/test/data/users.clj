(ns metabase.test.data.users
  "Code related to creating / managing fake `Users` for testing purposes."
  ;; TODO - maybe this namespace should just be `metabase.test.users`.
  (:require [medley.core :as m]
            [toucan.db :as db]
            [metabase.core :as core]
            [metabase.http-client :as http]
            (metabase.models [permissions-group :as perms-group]
                             [user :refer [User]])
            [metabase.util :as u]
            [metabase.test.util :refer [random-name]]))

;;; ------------------------------------------------------------ User Definitions ------------------------------------------------------------

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

(def ^:private ^:const usernames
  (set (keys user->info)))

;;; ------------------------------------------------------------ Test User Fns ------------------------------------------------------------

(defn- fetch-or-create-user!
  "Create User if they don't already exist and return User."
  [& {:keys [email first last password superuser active]
      :or {superuser false
           active    true}}]
  {:pre [(string? email) (string? first) (string? last) (string? password) (m/boolean? superuser) (m/boolean? active)]}
  (when-not (core/initialized?)
    (println "Metabase is not yet initialized, waiting 5 seconds...")
    (Thread/sleep 5000))
  (or (User :email email)
      (db/insert! User
        :email        email
        :first_name   first
        :last_name    last
        :password     password
        :is_superuser superuser
        :is_qbnewb    true
        :is_active    active)))


(defn fetch-user
  "Fetch the User object associated with USERNAME. Creates user if needed.

    (fetch-user :rasta) -> {:id 100 :first_name \"Rasta\" ...}"
  [username]
  {:pre [(contains? usernames username)]}
  (m/mapply fetch-or-create-user! (user->info username)))

(defn create-users-if-needed!
  "Force creation of the test users if they don't already exist."
  ([]
   (apply create-users-if-needed! usernames))
  ([& usernames]
   (doseq [username usernames]
     ;; fetch-user will force creation of users
     (fetch-user username))))

(def ^{:arglists '([username])} user->id
  "Memoized fn that returns the ID of User associated with USERNAME. Creates user if needed.

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

(def ^{:arglists '([id])} id->user
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

(defn- client-fn [username & args]
  (try
    (apply http/client (username->token username) args)
    (catch Throwable e
      (let [{:keys [status-code]} (ex-data e)]
        (when-not (= status-code 401)
          (throw e))
        ;; If we got a 401 unauthenticated clear the tokens cache + recur
        (reset! tokens {})
        (apply client-fn username args)))))

;; TODO - does it make sense just to make this a non-higher-order function? Or a group of functions, e.g.
;; (GET :rasta 200 "field/10/values")
;; vs.
;; ((user->client :rasta) :get 200 "field/10/values")
(defn user->client
  "Returns a `metabase.http-client/client` partially bound with the credentials for User with USERNAME.
   In addition, it forces lazy creation of the User if needed.

     ((user->client) :get 200 \"meta/table\")"
  [username]
  (create-users-if-needed! username)
  (partial client-fn username))


(defn ^:deprecated delete-temp-users!
  "Delete all users besides the 4 persistent test users.
   This is a HACK to work around tests that don't properly clean up after themselves; one day we should be able to remove this. (TODO)"
  []
  (db/delete! 'User :id [:not-in (map user->id [:crowberto :lucky :rasta :trashbird])]))
