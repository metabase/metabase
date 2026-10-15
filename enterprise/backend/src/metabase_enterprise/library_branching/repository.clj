(ns metabase-enterprise.library-branching.repository
  "The repository that library branching syncs with. Library branching reuses the connection settings of remote sync:
  `remote-sync-url`, `remote-sync-token`, `remote-sync-branch`, `remote-sync-type` (`:read-write` for a creation
  instance, `:read-only` for a consumption instance) and `remote-sync-auto-import`. This namespace opens a store on
  them, tests a connection, and saves them."
  (:require
   [clojure.string :as str]
   [metabase-enterprise.library-branching.store :as store]
   [metabase-enterprise.library-branching.store.jgit :as store.jgit]
   [metabase-enterprise.library-branching.tasks :as tasks]
   [metabase.settings.core :as setting]
   [metabase.util.i18n :refer [tru]]))

(set! *warn-on-reflection* true)

(def setting-keys
  "The settings that a save can write."
  [:remote-sync-url :remote-sync-token :remote-sync-type :remote-sync-branch :remote-sync-auto-import])

(def git-keys
  "The settings whose change needs a check of the repository."
  #{:remote-sync-url :remote-sync-token :remote-sync-type :remote-sync-branch})

(defn- refuse!
  "Throws ex-info with `:status-code` 400 and `message`, the message for the person."
  ([message] (refuse! message nil))
  ([message cause] (throw (ex-info message {:status-code 400} cause))))

(defn- present [s]
  (when-not (str/blank? s) s))

(defn url
  "The repository URL, or nil when none is set."
  []
  (present (setting/get :remote-sync-url)))

(defn configured?
  "True iff a repository URL is set."
  []
  (some? (url)))

(defn branch
  "The branch that the instance syncs with, or nil when none is set."
  []
  (present (setting/get :remote-sync-branch)))

(defn read-write?
  "True iff the instance is a creation instance: `remote-sync-type` is `:read-write`."
  []
  (= :read-write (setting/get :remote-sync-type)))

(defn open-store
  "A new store on the repository at `url` with the access token `token` (default: the saved URL and token), with the
  network timeout of the setting `remote-sync-git-timeout-seconds` for each remote call. The caller closes it. Throws
  as `store.jgit/open-store`."
  ([] (open-store (url) (setting/get :remote-sync-token)))
  ([url token]
   (store.jgit/open-store url :token token :timeout-seconds (setting/get :remote-sync-git-timeout-seconds))))

(defn do-with-store
  "Calls `(f store)` with a new store of [[open-store]] (on `url` and `token` when given), closes the store, and returns
  the result of `f`."
  ([f] (do-with-store (url) (setting/get :remote-sync-token) f))
  ([url token f]
   (let [s (open-store url token)]
     (try
       (f s)
       (finally
         (store/close s))))))

(defn failure-message
  "The message for the person of `e`, a failed call to the repository."
  [^Throwable e]
  (or (store.jgit/failure-message (:reason (ex-data e)))
      (not-empty (ex-message e))
      (.getName (class e))))

(defn- obfuscated? [token saved-token]
  (= token (setting/obfuscate-value saved-token)))

(defn connection
  "`{:url :token}` of a Test Connection with the form values `body` (`:remote-sync-url`, `:remote-sync-token`) over the
  saved values `saved` (`{:url :token}`): a URL of the form overrides the saved URL; a token of the form overrides the
  saved token, except the obfuscated saved token, which means the saved token."
  [body saved]
  {:url   (or (present (:remote-sync-url body)) (:url saved))
   :token (let [token (:remote-sync-token body)]
            (if (or (not (contains? body :remote-sync-token)) (obfuscated? token (:token saved)))
              (:token saved)
              token))})

(defn- check-url! [url]
  (when-not url
    (refuse! (tru "Library branching is not configured.")))
  (when-let [message (store.jgit/url-error url)]
    (refuse! message)))

(defn- remote-call!
  "`(f store)` on a new store on `url` with `token`; a failure throws 400 with the message for the person."
  [url token f]
  (try
    (do-with-store url token f)
    (catch Exception e
      (if (:status-code (ex-data e))
        (throw e)
        (refuse! (failure-message e) e)))))

(defn test-connection!
  "Test Connection with the form values `body`, as [[connection]] over the saved URL and token: one fresh remote call
  that lists the branches, so a rotated token shows. Returns nil. Throws ex-info with `:status-code` 400 and the message
  for the person when no URL is given or set, when the URL breaks the URL rule, or when the call fails."
  [body]
  (let [{:keys [url token]} (connection body {:url (url) :token (setting/get :remote-sync-token)})]
    (check-url! url)
    (remote-call! url token store/branches)
    nil))

(defn save-plan
  "The plan of a save of `body`, a map of some keys of [[setting-keys]], when `saved` (a map of [[setting-keys]]) holds
  the saved values and `env` is the set of the keys whose value comes from an environment variable. Pure. Returns
  `{:writes {key value} :check c :default-branch? d}`:

  - a blank `:remote-sync-url` turns library branching off: the writes clear the URL, the token and the branch;
  - else each key of `body` is written, except the obfuscated saved token, which keeps the saved token;
  - a key of `env` is never written;
  - `c` is nil, or, when `body` has a key of [[git-keys]] and the save does not turn library branching off, the
    connection after the save to check: `{:url :token :branch :type}`;
  - `d` is true iff `c` is not nil, its branch is blank, and the branch is not from an environment variable: then the
    save sets the branch to the default branch of the repository."
  [body saved env]
  (let [off?   (and (contains? body :remote-sync-url) (str/blank? (:remote-sync-url body)))
        writes (into {}
                     (remove (fn [[k v]]
                               (or (contains? env k)
                                   (and (= :remote-sync-token k) (obfuscated? v (:remote-sync-token saved))))))
                     (if off?
                       {:remote-sync-url nil :remote-sync-token nil :remote-sync-branch nil}
                       body))
        after  (merge saved writes)
        check  (when (and (not off?) (some git-keys (keys body)))
                 {:url    (:remote-sync-url after)
                  :token  (:remote-sync-token after)
                  :branch (:remote-sync-branch after)
                  :type   (:remote-sync-type after)})]
    {:writes          writes
     :check           check
     :default-branch? (boolean (and check
                                    (str/blank? (:branch check))
                                    (not (contains? env :remote-sync-branch))))}))

(defn branch-change-refused?
  "True iff a save of `body` over the saved values `saved`, with the keys `env` from environment variables (as in
  [[save-plan]]), changes or blanks the branch of a creation instance that has a branch, for the same repository. Such
  a change must be a branch switch, which keeps the local changes. Pure. A save that turns library branching off, sets
  the first branch, makes a consumption instance, or names another repository is not refused."
  [body saved env]
  (let [current (present (:remote-sync-branch saved))
        type    (or (:remote-sync-type body) (:remote-sync-type saved))
        url-now (present (:remote-sync-url saved))
        url-new (if (contains? body :remote-sync-url) (present (:remote-sync-url body)) url-now)]
    (boolean
     (and (= :read-write type)
          current
          url-new
          ;; another repository has no base on this instance, so its branch is a first setup
          (= url-new url-now)
          (contains? body :remote-sync-branch)
          (not (contains? env :remote-sync-branch))
          (not= current (:remote-sync-branch body))))))

(defn- check-connection!
  "Checks `connection` of [[save-plan]] with one fresh remote call, and returns the writes that it adds: the default
  branch of the repository when `default-branch?`. Throws 400 with the message for the person."
  [{:keys [url token branch type]} default-branch?]
  (check-url! (present url))
  (remote-call! url token
                (fn [s]
                  (let [branches (store/branches s)]
                    (when (and (= :read-only type) (present branch) (not (contains? branches branch)))
                      (refuse! (tru "The repository has no branch {0}." branch)))
                    (if-let [default (and default-branch? (store/default-branch s))]
                      {:remote-sync-branch default}
                      {})))))

(defn- saved-values []
  (into {} (map (juxt identity setting/get)) setting-keys))

(defn- env-keys []
  (into #{} (filter #(= :env (setting/get-raw-value-source %))) setting-keys))

(defn- write-as-task!
  "Writes the settings `writes` as a task of kind settings for the user `user-id`, in the commit of the task."
  [writes user-id]
  (let [{:keys [id]} (try
                       (tasks/start! "settings" user-id)
                       (catch clojure.lang.ExceptionInfo e
                         (if (= ::tasks/in-progress (:type (ex-data e)))
                           (refuse! (ex-message e))
                           (throw e))))]
    (try
      (let [result (tasks/commit! id (fn []
                                       (doseq [[k v] writes]
                                         (setting/set! k v))
                                       {:ok true :outcome {:kind "settings"}}))]
        (when-let [status (:fenced result)]
          (refuse! (tru "The save of the settings ended as {0} before it wrote them." status))))
      (catch Throwable e
        (tasks/fail! id (or (not-empty (ex-message e)) (.getName (class e))))
        (throw e)))))

(defn save-settings!
  "Saves the settings `body` as [[save-plan]] says, for the user `user-id`, as a task of kind settings. When the plan
  has a connection to check, one fresh remote call checks it first: the URL rule, the access, a read-only branch that
  must exist, and the default branch when the branch is blank. Returns the writes.

  Throws ex-info with `:status-code` 400, and changes nothing, while a task runs and for a change of the branch that
  [[branch-change-refused?]] refuses (then it calls no remote), and when the check fails (with the message for the
  person)."
  [body user-id]
  (when (tasks/live-task)
    (refuse! (tru "Library branching task in progress")))
  (when (branch-change-refused? body (saved-values) (env-keys))
    (refuse! (tru "The branch of a read-write instance changes only with a branch switch, which keeps the local changes.")))
  (let [{:keys [writes check default-branch?]} (save-plan body (saved-values) (env-keys))
        writes (cond-> writes
                 check (merge (check-connection! check default-branch?)))]
    (when (seq writes)
      (write-as-task! writes user-id))
    writes))
