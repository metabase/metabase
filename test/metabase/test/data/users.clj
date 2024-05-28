(ns metabase.test.data.users
  "Code related to creating / managing fake `Users` for testing purposes."
  (:require
   [clojure.test :as t]
   [medley.core :as m]
   [metabase.db :as mdb]
   [metabase.http-client :as client]
   [metabase.models.permissions-group :refer [PermissionsGroup]]
   [metabase.models.permissions-group-membership :refer [PermissionsGroupMembership]]
   [metabase.models.user :refer [User]]
   [metabase.server.middleware.session :as mw.session]
   [metabase.test.initialize :as initialize]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]
   [toucan2.tools.with-temp :as t2.with-temp])
  (:import
   (clojure.lang ExceptionInfo)))

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
  (into [:enum] usernames))

;;; ------------------------------------------------- Test User Fns --------------------------------------------------

(def ^:private create-user-lock (Object.))

(defn- fetch-or-create-user!
  "Create User if they don't already exist and return User."
  [& {first-name :first
      last-name  :last
      :keys [email password superuser active]
      :or   {superuser false
             active    true}}]
  {:pre [(string? email) (string? first-name) (string? last-name) (string? password) (m/boolean? superuser) (m/boolean? active)]}
  (initialize/initialize-if-needed! :db)
  (or (t2/select-one User :email email)
      (locking create-user-lock
        (or (t2/select-one User :email email)
            (first (t2/insert-returning-instances! User
                                                   {:email        email
                                                    :first_name   first-name
                                                    :last_name    last-name
                                                    :password     password
                                                    :is_superuser superuser
                                                    :is_qbnewb    true
                                                    :is_active    active}))))))

(mu/defn fetch-user :- (ms/InstanceOf User)
  "Fetch the User object associated with `username`. Creates user if needed.

    (fetch-user :rasta) -> {:id 100 :first_name \"Rasta\" ...}"
  [username :- TestUserName]
  (m/mapply fetch-or-create-user! (user->info username)))

(def ^{:arglists '([] [user-name])} user->id
  "Creates user if needed. With zero args, returns map of user name to ID. With 1 arg, returns ID of that User. Creates
  User(s) if needed. Memoized.

    (user->id)        ; -> {:rasta 4, ...}
    (user->id :rasta) ; -> 4"
  (mdb/memoize-for-application-db
   (fn
     ([]
      (zipmap usernames (map user->id usernames)))

     ([user-name]
      {:pre [(contains? usernames user-name)]}
      (u/the-id (fetch-user user-name))))))

(defn user-descriptor
  "Returns \"admin\" or \"non-admin\" for a given user.
  User could be a keyword like `:rasta` or a user object."
  [user]
  (cond
   (keyword user)       (user-descriptor (fetch-user user))
   (:is_superuser user) "admin"
   :else                "non-admin"))

(mu/defn user->credentials :- [:map
                               [:username [:fn
                                           {:error/message "valid email"}
                                           u/email?]]
                               [:password :string]]
  "Return a map with `:username` and `:password` for User with `username`.

    (user->credentials :rasta) -> {:username \"rasta@metabase.com\", :password \"blueberries\"}"
  [username :- TestUserName]
  {:pre [(contains? usernames username)]}
  (let [{:keys [email password]} (user->info username)]
    {:username email
     :password password}))

(defonce ^:private tokens (atom {}))

(mu/defn username->token :- [:re u/uuid-regex]
  "Return cached session token for a test User, logging in first if needed."
  [username :- TestUserName]
  (or (@tokens username)
      (locking tokens
        (or (@tokens username)
            (u/prog1 (client/authenticate (user->credentials username))
                     (swap! tokens assoc username <>))))
      (throw (Exception. (format "Authentication failed for %s with credentials %s"
                                 username (user->credentials username))))))

(defn clear-cached-session-tokens!
  "Clear any cached session tokens, which may have expired or been removed. You should do this in the even you get a
  `401` unauthenticated response, and then retry the request."
  []
  (locking tokens
    (reset! tokens {})))

(def ^:private ^:dynamic *retrying-authentication*  false)

(defn- client-fn [the-client username & args]
  (try
    (apply the-client (username->token username) args)
    (catch ExceptionInfo e
      (let [{:keys [status-code]} (ex-data e)]
        (when-not (= status-code 401)
          (throw e))
        ;; If we got a 401 unauthenticated clear the tokens cache + recur
        ;;
        ;; If we're already recursively retrying throw an Exception so we don't recurse forever.
        (when *retrying-authentication*
          (throw (ex-info (format "Failed to authenticate %s after two tries: %s" username (ex-message e))
                          {:user username}
                          e)))
        (clear-cached-session-tokens!)
        (binding [*retrying-authentication* true]
          (apply client-fn the-client username args))))))

(defn- user-request
  [the-client user & args]
  (if (keyword? user)
    (do
     (fetch-user user)
     (apply client-fn the-client user args))
    (let [user-id (u/the-id user)]
      (when-not (t2/exists? :model/User :id user-id)
        (throw (ex-info "User does not exist" {:user user})))
      (t2.with-temp/with-temp [:model/Session {session-id :id} {:id      (str (random-uuid))
                                                                :user_id user-id}]
        (apply the-client session-id args)))))

(def ^{:arglists '([test-user-name-or-user-or-id method expected-status-code? endpoint
                    request-options? http-body-map? & {:as query-params}])} user-http-request
  "A version of our test client that issues the request with credentials for a given User. User may be either a
  redefined test User name, e.g. `:rasta`, or any User or User ID.
  The request will be executed with a temporary session id.

  Note: this makes a mock API call, not an actual HTTP call, use [[user-real-request]] for that."
  (partial user-request client/client))

(def ^{:arglists '([test-user-name-or-user-or-id method expected-status-code? endpoint
                    request-options? http-body-map? & {:as query-params}])} user-real-request
  "Like `user-http-request` but instead of calling the app handler, this makes an actual http request."
  (partial user-request client/real-client))

(defn do-with-test-user [user-kwd thunk]
  (t/testing (format "with test user %s\n" user-kwd)
    (mw.session/with-current-user (some-> user-kwd user->id)
      (thunk))))

(defmacro with-test-user
  "Call `body` with various `metabase.api.common` dynamic vars like `*current-user*` bound to the predefined test User
  named by `user-kwd`. If you want to bind a non-predefined-test User, use `mt/with-current-user` instead."
  {:style/indent 1}
  [user-kwd & body]
  `(do-with-test-user ~user-kwd (fn [] ~@body)))

(defn test-user?
  "Does this User or User ID belong to one of the predefined test birds?"
  [user-or-id]
  (contains? (set (vals (user->id))) (u/the-id user-or-id)))

(defn test-user-name-or-user-id->user-id [test-user-name-or-user-id]
  (if (keyword? test-user-name-or-user-id)
    (user->id test-user-name-or-user-id)
    (u/the-id test-user-name-or-user-id)))

(defn do-with-group-for-user [group test-user-name-or-user-id f]
  (t2.with-temp/with-temp [PermissionsGroup           group group
                           PermissionsGroupMembership _     {:group_id (u/the-id group)
                                                             :user_id  (test-user-name-or-user-id->user-id test-user-name-or-user-id)}]
    (f group)))

(defmacro with-group
  "Create a new PermissionsGroup, bound to `group-binding`; add test user Rasta Toucan [RIP] to the
  group, then execute `body`."
  [[group-binding group] & body]
  `(do-with-group-for-user ~group :rasta (fn [~group-binding] ~@body)))

(defmacro with-group-for-user
  "Like [[with-group]], but for any test user (by passing in a test username keyword e.g. `:rasta`) or User ID."
  [[group-binding test-user-name-or-user-id group] & body]
  `(do-with-group-for-user ~group ~test-user-name-or-user-id (fn [~group-binding] ~@body)))
