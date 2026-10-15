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
   [metabase.settings.core :as setting]))

(set! *warn-on-reflection* true)

(def setting-keys
  "The settings that a save can write."
  [:remote-sync-url :remote-sync-token :remote-sync-type :remote-sync-branch :remote-sync-auto-import])

(def git-keys
  "The settings whose change needs a check of the repository."
  #{:remote-sync-url :remote-sync-token :remote-sync-type :remote-sync-branch})

(defn- not-yet [f]
  (throw (ex-info (str "Not implemented yet: " f) {})))

(defn url
  "The repository URL, or nil when none is set."
  []
  (not-yet "url"))

(defn configured?
  "True iff a repository URL is set."
  []
  (not-yet "configured?"))

(defn branch
  "The branch that the instance syncs with, or nil when none is set."
  []
  (not-yet "branch"))

(defn read-write?
  "True iff the instance is a creation instance: `remote-sync-type` is `:read-write`."
  []
  (not-yet "read-write?"))

(defn open-store
  "A new store on the repository at `url` with the access token `token` (default: the saved URL and token), with the
  network timeout of the setting `remote-sync-git-timeout-seconds` for each remote call. The caller closes it. Throws
  as `store.jgit/open-store`."
  ([] (open-store (url) (setting/get :remote-sync-token)))
  ([_url _token] (not-yet "open-store")))

(defn do-with-store
  "Calls `(f store)` with a new store of [[open-store]] (on `url` and `token` when given), closes the store, and returns
  the result of `f`."
  ([f] (do-with-store (url) (setting/get :remote-sync-token) f))
  ([_url _token _f] (not-yet "do-with-store")))

(defn failure-message
  "The message for the person of `e`, a failed call to the repository."
  [_e]
  (not-yet "failure-message"))

(defn connection
  "`{:url :token}` of a Test Connection with the form values `body` (`:remote-sync-url`, `:remote-sync-token`) over the
  saved values `saved` (`{:url :token}`): a URL of the form overrides the saved URL; a token of the form overrides the
  saved token, except the obfuscated saved token, which means the saved token."
  [_body _saved]
  (not-yet "connection"))

(defn test-connection!
  "Test Connection with the form values `body`, as [[connection]] over the saved URL and token: one fresh remote call
  that lists the branches, so a rotated token shows. Returns nil. Throws ex-info with `:status-code` 400 and the message
  for the person when no URL is given or set, when the URL breaks the URL rule, or when the call fails."
  [_body]
  (not-yet "test-connection!"))

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
  [_body _saved _env]
  (not-yet "save-plan"))

(defn save-settings!
  "Saves the settings `body` as [[save-plan]] says, for the user `user-id`, as a task of kind settings. When the plan
  has a connection to check, one fresh remote call checks it first: the URL rule, the access, a read-only branch that
  must exist, and the default branch when the branch is blank. Returns the writes.

  Throws ex-info with `:status-code` 400, and changes nothing, while a task runs (then it calls no remote), and when the
  check fails (with the message for the person)."
  [_body _user-id]
  (not-yet "save-settings!"))

(comment store/branches str/blank? store.jgit/open-store tasks/start!)
