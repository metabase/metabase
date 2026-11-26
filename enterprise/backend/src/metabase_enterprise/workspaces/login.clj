(ns metabase-enterprise.workspaces.login
  "The warehouse login of a workspace. A workspace connects to each of its Databases with its own `:user` and
   `:password`, from its WorkspaceDatabase, in place of the parent's: a child instance's config carries them, and so
   do the connections of a request in the workspace. This namespace says which connection properties carry
   the parent's own login, and when a Database can't be used with the workspace's login at all."
  (:require
   [clojure.string :as str]
   [metabase.driver.util :as driver.u]
   [ring.util.codec :as codec]))

(set! *warn-on-reflection* true)

(def parent-login-keys
  "Connection properties of the eligible engines that pick or carry the parent's own warehouse login. The workspace
  user logs in with the `:user`/`:password` in `:database_details`, so a workspace connection must use none of these:
  each one either makes it connect with something other than that login or leaks a parent credential. Logins written
  into `:additional-options` are refused instead ([[login-problem]]). Engines that can't be a workspace database,
  such as Snowflake and BigQuery, have credentials this list does not name.

  - Auth provider (`metabase.driver.common/auth-provider-options`): with `:use-auth-provider` still set, the
    connection replaces the password with a token from the provider: for OAuth, fetched with the parent's client
    settings (`:oauth-token-headers` can carry a client secret); for Azure managed identity, from the host with the
    parent's client ID; for AWS IAM, with the host's credentials.
  - `:auth-mode` selects the login on SQL Server and Snowflake. Without it, SQL Server falls back to SQL login
    (`:user`/`:password`).
  - SQL Server's Azure AD logins (`ad-*`): the service-principal client ID/secret, the certificate and key
    secrets (every secret sub-key), and the managed-identity client ID."
  [:use-auth-provider :auth-provider :azure-managed-identity-client-id :oauth-token-url :oauth-token-headers
   :auth-mode
   :ad-client-id :ad-client-secret :ad-managed-identity-client-id
   :ad-client-certificate :ad-client-certificate-value :ad-client-certificate-path :ad-client-certificate-options
   :ad-client-certificate-id :ad-client-certificate-source :ad-client-certificate-kind
   :ad-client-certificate-creator-id :ad-client-certificate-created-at
   :ad-client-certificate-password :ad-client-certificate-password-value :ad-client-certificate-password-path
   :ad-client-certificate-password-options :ad-client-certificate-password-id
   :ad-client-certificate-password-source :ad-client-certificate-password-kind
   :ad-client-certificate-password-creator-id :ad-client-certificate-password-created-at
   :ad-client-key :ad-client-key-value :ad-client-key-path :ad-client-key-options
   :ad-client-key-id :ad-client-key-source :ad-client-key-kind
   :ad-client-key-creator-id :ad-client-key-created-at
   :ad-client-key-password :ad-client-key-password-value :ad-client-key-password-path
   :ad-client-key-password-options :ad-client-key-password-id
   :ad-client-key-password-source :ad-client-key-password-kind
   :ad-client-key-password-creator-id :ad-client-key-password-created-at])

(def ^:private login-option-name
  "Names of JDBC options that set a login or carry a credential, matched against option names normalized by
   [[driver.u/normalize-connection-parameter]] (case-folded, `_ . - +` and whitespace removed): the exact login names,
   or any name containing a credential word (`SecretAccessKey`, `SessionToken`, `sslpassword`). MySQL's
   `passwordCharacterEncoding` and Redshift's `TokenType` name no credential and are let through."
  #"(?x) (?!passwordcharacterencoding$|tokentype$)
         (?:user|username|uid|sslkey|accesskeyid|aadsecureprincipalid|.*(?:password|pwd|secret|token).*)")

(def ^:private login-option-assignment
  "An exact login name set anywhere in a normalized `:additional-options` string, after any non-word character. A
   backstop for separators other than `&` and `;`."
  #"(?U)(?:^|\W)(user|username|uid|sslkey|accesskeyid|aadsecureprincipalid)=")

(def ^:private max-percent-decode-rounds
  "How many times an `:additional-options` string may be percent-encoded before it is refused outright."
  5)

(defn- percent-decode-fully
  "`s` percent-decoded until it stops changing, or nil when it still changes after [[max-percent-decode-rounds]]
   rounds. Drivers may decode option names more than once, and an encoded `&` or `;` can hide a name."
  [s]
  (loop [s (str s), rounds 0]
    (let [decoded (codec/percent-decode s)]
      (cond
        (= decoded s)                       s
        (< rounds max-percent-decode-rounds) (recur decoded (inc rounds))
        :else                               nil))))

(defn- additional-option-names
  "The option names in an `:additional-options` string: `name=value` pairs separated by `&` (Postgres, MySQL,
   Redshift, ClickHouse) or `;` (SQL Server), with an optional leading `?`."
  [additional-options]
  (for [part  (str/split (str additional-options) #"[&;]")
        :let  [option-name (-> part (str/split #"=" 2) first str/trim (str/replace #"^\?" ""))]
        :when (seq option-name)]
    option-name))

(defn- login-option
  "What in the `additional-options` string sets a login or carries a credential, as text for an error message, or
   nil. The string is percent-decoded fully before it is split, so encoded names and separators are seen."
  [additional-options]
  (if-let [decoded (percent-decode-fully additional-options)]
    (or (some #(when (re-matches login-option-name (driver.u/normalize-connection-parameter %)) %)
              (additional-option-names decoded))
        (second (re-find login-option-assignment (driver.u/normalize-connection-parameter decoded))))
    (format "an option percent-encoded more than %d times" max-percent-decode-rounds)))

(defn login-problem
  "Why a connection to the Database `db` could not log in with only a workspace's `:user` and `:password`, as an error
  message, or nil when it can.

   - Its `:additional-options` set a login or carry a credential. Drivers such as pgjdbc let URL options override
     `:user` and `:password`, so the connection would log in as the parent.
   - It uses SSL client-certificate authentication, which logs in with the parent's certificate."
  [db]
  (let [details (:details db)]
    (if-let [option (some-> (:additional-options details) login-option)]
      (format (str "Database %s sets %s in its additional JDBC connection options, which would give the workspace the "
                   "parent's login. Remove it from the database's connection settings, or remove the database from "
                   "the workspace.")
              (pr-str (:name db)) option)
      (when (and (:ssl details) (:ssl-use-client-auth details))
        (format (str "Database %s uses SSL client-certificate authentication, which workspaces don't support. Remove "
                     "the database from the workspace, or turn off client-certificate authentication for it.")
                (pr-str (:name db)))))))

(defn workspace-login-details
  "The details that, merged over a Database's own, make a connection log in as the workspace whose WorkspaceDatabase
  is `workspace-database`: each of [[parent-login-keys]] set to nil, then the workspace's `:user` and `:password`.
  A merge can't remove a key, so nil stands for none."
  [workspace-database]
  (merge (zipmap parent-login-keys (repeat nil))
         (:database_details workspace-database)))
