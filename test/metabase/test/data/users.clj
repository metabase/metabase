(ns metabase.test.data.users
  "Code related to creating / managing fake `Users` for testing purposes."
  (:require [clojure.test :as t]
            [medley.core :as m]
            [metabase
             [http-client :as http]
             [util :as u]]
            [metabase.middleware.session :as mw.session]
            [metabase.models.user :as user :refer [User]]
            [metabase.test.initialize :as initialize]
            [schema.core :as s]
            [toucan.db :as db])
  (:import clojure.lang.ExceptionInfo
           metabase.models.user.UserInstance))

;;; ------------------------------------------------ User Definitions ------------------------------------------------

;; ## Test Users
;;
;; These users have permissions for the Test. They are lazily created as needed.
;; Three test users are defined:
;; *  rasta
;; *  crowberto - superuser
;; *  lucky
;; *  trashbird - inactive

(def ^:private user->info
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

(def usernames
  (set (keys user->info)))

(def ^:private TestUserName
  (apply s/enum usernames))

;;; ------------------------------------------------- Test User Fns --------------------------------------------------

(def ^:private create-user-lock (Object.))

(defn- fetch-or-create-user!
  "Create User if they don't already exist and return User."
  [& {:keys [email first last password superuser active]
      :or   {superuser false
             active    true}}]
  {:pre [(string? email) (string? first) (string? last) (string? password) (m/boolean? superuser) (m/boolean? active)]}
  (initialize/initialize-if-needed! :db)
  (or (User :email email)
      (locking create-user-lock
        (or (User :email email)
            (db/insert! User
              :email        email
              :first_name   first
              :last_name    last
              :password     password
              :is_superuser superuser
              :is_qbnewb    true
              :is_active    active)))))

(s/defn fetch-user :- UserInstance
  "Fetch the User object associated with `username`. Creates user if needed.

    (fetch-user :rasta) -> {:id 100 :first_name \"Rasta\" ...}"
  [username :- TestUserName]
  (m/mapply fetch-or-create-user! (user->info username)))

(def ^{:arglists '([] [user-name])} user->id
  "Creates user if needed. With zero args, returns map of user name to ID. With 1 arg, returns ID of that User. Creates
  User(s) if needed. Memoized.

    (user->id)        ; -> {:rasta 4, ...}
    (user->id :rasta) ; -> 4"
  (memoize
   (fn
     ([]
      (zipmap usernames (map user->id usernames)))

     ([user-name]
      {:pre [(contains? usernames user-name)]}
      (u/get-id (fetch-user user-name))))))

(s/defn user->credentials :- {:username (s/pred u/email?), :password s/Str}
  "Return a map with `:username` and `:password` for User with `username`.

    (user->credentials :rasta) -> {:username \"rasta@metabase.com\", :password \"blueberries\"}"
  [username :- TestUserName]
  {:pre [(contains? usernames username)]}
  (let [{:keys [email password]} (user->info username)]
    {:username email
     :password password}))

(def ^{:arglists '([id])} id->user
  "Reverse of `user->id`.

    (id->user 4) -> :rasta"
  (let [m (delay (zipmap (map user->id usernames) usernames))]
    (fn [id]
      (@m id))))

(defonce ^:private tokens (atom {}))

(s/defn username->token :- u/uuid-regex
  "Return cached session token for a test User, logging in first if needed."
  [username :- TestUserName]
  (or (@tokens username)
      (locking tokens
        (or (@tokens username)
            (u/prog1 (http/authenticate (user->credentials username))
              (swap! tokens assoc username <>))))
      (throw (Exception. (format "Authentication failed for %s with credentials %s"
                                 username (user->credentials username))))))

(defn clear-cached-session-tokens!
  "Clear any cached session tokens, which may have expired or been removed. You should do this in the even you get a
  `401` unauthenticated response, and then retry the request."
  []
  (locking tokens
    (reset! tokens {})))

(defn- client-fn [username & args]
  (try
    (apply http/client (username->token username) args)
    (catch ExceptionInfo e
      (let [{:keys [status-code]} (ex-data e)]
        (when-not (= status-code 401)
          (throw e))
        ;; If we got a 401 unauthenticated clear the tokens cache + recur
        (clear-cached-session-tokens!)
        (apply client-fn username args)))))

(s/defn user->client :- (s/pred fn?)
  "Returns a `metabase.http-client/client` partially bound with the credentials for User with `username`.
   In addition, it forces lazy creation of the User if needed.

     ((user->client) :get 200 \"meta/table\")"
  [username :- TestUserName]
  (fetch-user username) ; force creation of the user if not already created
  (partial client-fn username))

(defmacro with-test-user
  "Call `body` with various `metabase.api.common` dynamic vars like `*current-user*` bound to the test User named by
  `user-kwd`."
  {:style/indent 1}
  [user-kwd & body]
  `(t/testing ~(format "with test user %s\n" user-kwd)
     (mw.session/with-current-user (some-> ~user-kwd user->id)
       ~@body)))

(defn test-user?
  "Does this User or User ID belong to one of the predefined test birds?"
  [user-or-id]
  (contains? (set (vals (user->id))) (u/get-id user-or-id)))
