(ns metabase.test.data.users
  "Code related to creating / managing fake `Users` for testing purposes."
  (:require [medley.core :as m]
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

(def ^:private TestUserName
  (apply s/enum usernames))

;;; ------------------------------------------------- Test User Fns --------------------------------------------------

(defn- fetch-or-create-user!
  "Create User if they don't already exist and return User."
  [& {:keys [email first last password superuser active]
      :or   {superuser false
             active    true}}]
  {:pre [(string? email) (string? first) (string? last) (string? password) (m/boolean? superuser) (m/boolean? active)]}
  (initialize/initialize-if-needed! :db)
  (or (User :email email)
      (db/insert! User
        :email        email
        :first_name   first
        :last_name    last
        :password     password
        :is_superuser superuser
        :is_qbnewb    true
        :is_active    active)))


(s/defn fetch-user :- UserInstance
  "Fetch the User object associated with USERNAME. Creates user if needed.

    (fetch-user :rasta) -> {:id 100 :first_name \"Rasta\" ...}"
  [username :- TestUserName]
  (m/mapply fetch-or-create-user! (user->info username)))

(s/defn create-users-if-needed!
  "Force creation of the test users if they don't already exist."
  ([]
   (apply create-users-if-needed! usernames))
  ([& usernames :- [TestUserName]]
   (doseq [username usernames]
     ;; fetch-user will force creation of users
     (fetch-user username))))

(def ^{:arglists '([username])} user->id
  "Memoized fn that returns the ID of User associated with USERNAME. Creates user if needed.

    (user->id :rasta) -> 4"
  (memoize
   (s/fn :- s/Int [username :- TestUserName]
     {:pre [(contains? usernames username)]}
     (u/get-id (fetch-user username)))))

(s/defn user->credentials :- {:username (s/pred u/email?), :password s/Str}
  "Return a map with `:username` and `:password` for User with USERNAME.

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
      (u/prog1 (http/authenticate (user->credentials username))
        (swap! tokens assoc username <>))
      (throw (Exception. (format "Authentication failed for %s with credentials %s"
                                 username (user->credentials username))))))

(defn clear-cached-session-tokens!
  "Clear any cached session tokens, which may have expired or been removed. You should do this in the even you get a
  `401` unauthenticated response, and then retry the request."
  []
  (reset! tokens {}))

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
  "Returns a `metabase.http-client/client` partially bound with the credentials for User with USERNAME.
   In addition, it forces lazy creation of the User if needed.

     ((user->client) :get 200 \"meta/table\")"
  [username :- TestUserName]
  (create-users-if-needed! username)
  (partial client-fn username))

(s/defn do-with-test-user
  "Call `f` with various `metabase.api.common` dynamic vars bound to the test User named by `user-kwd`."
  [user-kwd :- TestUserName, f :- (s/pred fn?)]
  ((mw.session/bind-current-user (fn [_ respond _] (respond (f))))
   (let [user-id (user->id user-kwd)]
     {:metabase-user-id user-id
      :is-superuser?    (db/select-one-field :is_superuser User :id user-id)})
   identity
   (fn [e] (throw e))))

(defmacro with-test-user
  "Call `body` with various `metabase.api.common` dynamic vars like `*current-user*` bound to the test User named by
  `user-kwd`."
  {:style/indent 1}
  [user-kwd & body]
  `(do-with-test-user ~user-kwd (fn [] ~@body)))
