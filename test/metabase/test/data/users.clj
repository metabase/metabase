(ns metabase.test.data.users
  "Code related to creating / managing fake `Users` for testing purposes."
  (:require [medley.core :as m]
            [metabase
             [config :as config]
             [http-client :as http]
             [util :as u]]
            [metabase.api.common :as api]
            [metabase.core.initialization-status :as init-status]
            [metabase.models.user :as user :refer [User]]
            [toucan.db :as db])
  (:import clojure.lang.ExceptionInfo))

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

(def ^:private ^:const usernames
  (set (keys user->info)))

;;; ------------------------------------------------- Test User Fns --------------------------------------------------

(defn- wait-for-initiailization
  "Wait up to MAX-WAIT-SECONDS (default: 30) for Metabase to finish initializing.
   (Sometimes it can take Metabase a while to reload during live development with `lein ring server`.)"
  ([]
   (wait-for-initiailization 30))
  ([max-wait-seconds]
   ;; only need to wait when running unit tests. When doing REPL dev and using the test users we're probably
   ;; the server is probably a separate process (`lein ring server`)
   (when config/is-test?
     (when-not (init-status/complete?)
       (when (<= max-wait-seconds 0)
         (throw (Exception. "Metabase still hasn't finished initializing.")))
       (println (format "Metabase is not yet initialized, waiting 1 second (max wait remaining: %d seconds)...\n"
                        max-wait-seconds))
       (Thread/sleep 1000)
       (recur (dec max-wait-seconds))))))

(defn- fetch-or-create-user!
  "Create User if they don't already exist and return User."
  [& {:keys [email first last password superuser active]
      :or {superuser false
           active    true}}]
  {:pre [(string? email) (string? first) (string? last) (string? password) (m/boolean? superuser) (m/boolean? active)]}
  (wait-for-initiailization)
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
  "Return a map with `:username` and `:password` for User with USERNAME.

    (user->credentials :rasta) -> {:username \"rasta@metabase.com\", :password \"blueberries\"}"
  [username]
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

(defn- username->token [username]
  (or (@tokens username)
      (u/prog1 (http/authenticate (user->credentials username))
        (swap! tokens assoc username <>))
      (throw (Exception. (format "Authentication failed for %s with credentials %s"
                                 username (user->credentials username))))))

(defn- client-fn [username & args]
  (try
    (apply http/client (username->token username) args)
    (catch ExceptionInfo e
      (let [{:keys [status-code]} (ex-data e)]
        (when-not (= status-code 401)
          (throw e))
        ;; If we got a 401 unauthenticated clear the tokens cache + recur
        (reset! tokens {})
        (apply client-fn username args)))))

(defn user->client
  "Returns a `metabase.http-client/client` partially bound with the credentials for User with USERNAME.
   In addition, it forces lazy creation of the User if needed.

     ((user->client) :get 200 \"meta/table\")"
  [username]
  (create-users-if-needed! username)
  (partial client-fn username))


(defn ^:deprecated delete-temp-users!
  "Delete all users besides the 4 persistent test users.
  This is a HACK to work around tests that don't properly clean up after themselves; one day we should be able to
  remove this. (TODO)"
  []
  (db/delete! User :id [:not-in (map user->id [:crowberto :lucky :rasta :trashbird])]))

(defn do-with-test-user
  "Call `f` with various `metabase.api.common` dynamic vars bound to the test User named by `user-kwd`."
  [user-kwd f]
  (binding [api/*current-user*                 (delay (User (user->id user-kwd)))
            api/*current-user-id*              (user->id user-kwd)
            api/*is-superuser?*                (db/select-one-field :is_superuser User :id (user->id user-kwd))
            api/*current-user-permissions-set* (delay (user/permissions-set (user->id user-kwd)))]
    (f)))

(defmacro with-test-user
  "Call `body` with various `metabase.api.common` dynamic vars like `*current-user*` bound to the test User named by
  `user-kwd`."
  {:style/indent 1}
  [user-kwd & body]
  `(do-with-test-user ~user-kwd (fn [] ~@body)))
