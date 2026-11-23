(ns metabase.session.models.session
  (:require
   [buddy.core.codecs :as codecs]
   [buddy.core.hash :as buddy-hash]
   [buddy.core.mac :as mac]
   [buddy.core.nonce :as nonce]
   [clojure.core.memoize :as memo]
   [environ.core :as env]
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.app-db.core :as app-db]
   [metabase.events.core :as events]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.request.core :as request]
   [metabase.session.db :as session.db]
   [metabase.session.schema :as session.schema]
   [metabase.session.settings :as session.settings]
   [metabase.util :as u]
   [metabase.util.encryption :as encryption]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [metabase.util.string :as string]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(mu/defn- random-anti-csrf-token :- [:re {:error/message "valid anti-CSRF token"} #"^[0-9a-f]{32}$"]
  []
  (codecs/bytes->hex (nonce/random-bytes 16)))

;; validated eagerly at load so a misconfigured secret fails at startup instead of 500ing the first auth request
(defonce ^:private ^{:tag 'bytes} default-session-hash-secret
  (encryption/validate-and-hash-secret-key (env/env :mb-session-secret-key) "MB_SESSION_SECRET_KEY"))

(when-not *compile-files*
  (when-not default-session-hash-secret
    (log/warn (str "MB_SESSION_SECRET_KEY is not set; session keys are stored without a signature. Anyone with access"
                   " to the application database can forge a session and impersonate any user. Set it to a random"
                   " string of at least 16 characters to prevent this. Setting or changing it logs out all active"
                   " sessions."))))

(defn- session-hash-secret
  "Secret used to sign session keys before they are stored in or looked up from the app DB. Read from
  `MB_SESSION_SECRET_KEY`. Nil when it is not set."
  ^bytes []
  default-session-hash-secret)

(def ^:private ^{:arglists '([secret session-key])} hash-session-key*
  (memo/lru (fn [^bytes secret ^String session-key]
              (let [key-bytes (.getBytes session-key java.nio.charset.StandardCharsets/US_ASCII)]
                (codecs/bytes->hex
                 (if secret
                   (mac/hash key-bytes {:key secret :alg :hmac+sha512})
                   (buddy-hash/sha512 key-bytes)))))
            {} :lru/threshold 100))

(defn hash-session-key
  "Hash the session-key for storage in (and lookup from) the database.

  When `MB_SESSION_SECRET_KEY` is set the stored value is signed with that secret (HMAC-SHA512), so a valid
  `key_hashed` value cannot be computed with app-db (SQL) access alone. Without it this is a plain SHA-512."
  [session-key]
  (hash-session-key* (session-hash-secret) session-key))

(defn generate-session-key
  "Generate a new session key."
  []
  (str (random-uuid)))

(defn generate-session-id
  "Generate a new id for the session table."
  []
  (string/random-string 12))

(methodical/defmethod t2/table-name :model/Session [_model] :core_session)

(doto :model/Session
  (derive :metabase/model)
  (derive :hook/created-at-timestamped?))

(def ^:private ending-columns
  "The only columns an update of a Session may touch: the ones [[end-sessions!]] writes to record
  that the session ended. Everything else on the row is immutable."
  #{:ended_at :end_reason :ended_by_user_id :key_hashed})

(t2/define-before-update :model/Session [session]
  (when-not (every? ending-columns (keys (t2/changes session)))
    (throw (RuntimeException. "You cannot update a Session.")))
  ;; a recorded ending is final
  (when (some? (:ended_at (t2/original session)))
    (throw (RuntimeException. "You cannot change a Session that has ended.")))
  session)

(t2/define-before-insert :model/Session
  [{session-key :session_key :as session}]
  (when (or (uuid? (:id session)) (u/uuid-string? (:id session)))
    (throw (ex-info "Session id should not be stored plaintext in the session table." {})))
  (when (or (uuid? (:key_hashed session)) (u/uuid-string? (:key_hashed session)))
    (throw (ex-info "Session key should not be stored plaintext in the session table." {})))
  (let [key-hashed (or (:key_hashed session) (hash-session-key session-key))]
    (cond-> (-> session
                (dissoc :session_key)
                (assoc :key_hashed key-hashed))
      ;; on mysql if the id is not supplied insert-returning-instance(s)! returns nil
      ;; this is here to handle transitioning some tests
      (not (:id session)) (assoc :id (generate-session-id))
      (some-> (request/current-request) request/embedded?) (assoc :anti_csrf_token (random-anti-csrf-token)))))

(def default-end-batch-size
  "How many ids one `UPDATE ... WHERE id IN (...)` may name. Ending sessions by id has no upper bound on how many
  there are, and every id is a bind parameter — pgjdbc refuses a statement with more than 65,535 of them."
  1000)

;;; ---------------------------------------------------- Writes ------------------------------------------------------

(defn- check-password-login-allowed
  "Throws a 400 when the AuthIdentity with `auth-identity-id` is a password one and password login is disabled."
  [auth-identity-id]
  (when-let [auth-identity (some-> auth-identity-id session.db/auth-identity-provider)]
    (when (and (= "password" (:provider auth-identity))
               (not (session.settings/enable-password-login)))
      (throw (ex-info (str (tru "Password login is disabled for this instance."))
                      {:status-code 400})))))

(defn- publish-login-events!
  "Publish `:event/user-login` for the User with `user-id`, and `:event/user-joined` when they never logged in before."
  [user-id]
  (when-let [user (session.db/user user-id)]
    (let [event {:user-id (u/the-id user)}]
      (events/publish-event! :event/user-login event)
      (when (nil? (:last_login user))
        (events/publish-event! :event/user-joined event)))))

(mu/defn create-session! :- ::session.schema/session
  "Insert the Session `row` for a login and return it, publishing the login events of its User. A session of a password
  AuthIdentity while password login is disabled is a 400."
  [row :- ::session.schema/session.create]
  (check-password-login-allowed (:auth_identity_id row))
  (u/prog1 (session.db/insert-session! row)
    (publish-login-events! (:user_id row))))

(mu/defn get-or-create-mcp-session!
  "The `core_session` row with `key-hashed` of the User with `user-id`, inserting one attributed to the AuthIdentity
  with `auth-identity-id` when there is none, and reading the row of a concurrent insert when the insert fails. The row
  backs an MCP client rather than a login, so no login event is published."
  [key-hashed       :- :string
   user-id          :- ::lib.schema.id/user
   auth-identity-id :- ms/PositiveInt]
  (or (session.db/mcp-session key-hashed user-id)
      (do
        (check-password-login-allowed auth-identity-id)
        (try
          (t2/with-transaction [_conn]
            (session.db/insert-mcp-session! {:id               (generate-session-id)
                                             :key_hashed       key-hashed
                                             :user_id          user-id
                                             :anti_csrf_token  nil
                                             :auth_identity_id auth-identity-id
                                             :created_at       :%now}))
          (catch Exception e
            (or (session.db/mcp-session key-hashed user-id)
                (throw e)))))))

(mu/defn delete-mcp-session!
  "Delete the MCP-backed `core_session` with `key-hashed` if it belongs to the User with `user-id`."
  [key-hashed :- :string
   user-id    :- ::lib.schema.id/user]
  (session.db/delete-session-of-user! key-hashed user-id))

(defn- db-ended-by
  "The `ended-by` of a session ending as the db layer takes it, `:user_id` for the session's own user."
  [ended-by]
  (if (= ended-by :self) :user_id ended-by))

(defn- end-sessions-in-batches!
  "End the Sessions with `ids` with `reason` by `ended-by`, `batch-size` ids per statement, returning the number ended."
  [ids reason ended-by batch-size]
  (transduce (map #(session.db/end-sessions! (vec %) reason (db-ended-by ended-by)))
             +
             0
             (partition-all batch-size ids)))

(mu/defn end-sessions! :- ms/IntGreaterThanOrEqualToZero
  "Record that every Session with `ids` has ended: `ended_at` becomes now, `end_reason` becomes `reason`,
  `ended_by_user_id` becomes `ended-by`, and `key_hashed` is cleared so the row can never authenticate a request
  again. A session that has already ended is left as it was. Writes in batches of `batch-size` ids
  ([[default-end-batch-size]] by default) and returns the number ended; an empty `ids` ends nothing. See
  `::session.schema/ended-by` for `ended-by`."
  ([ids      :- [:sequential :string]
    reason   :- ::session.schema/end-reason
    ended-by :- ::session.schema/ended-by]
   (end-sessions-in-batches! ids reason ended-by default-end-batch-size))

  ([ids        :- [:sequential :string]
    reason     :- ::session.schema/end-reason
    ended-by   :- ::session.schema/ended-by
    batch-size :- ms/PositiveInt]
   (end-sessions-in-batches! ids reason ended-by batch-size)))

(mu/defn end-sessions-for-users! :- ms/IntGreaterThanOrEqualToZero
  "[[end-sessions!]] for every Session of the Users with `user-ids`, one statement per partition of the ids, returning
  the number ended; an empty `user-ids` ends nothing."
  [user-ids :- [:sequential ::lib.schema.id/user]
   reason   :- ::session.schema/end-reason
   ended-by :- ::session.schema/ended-by]
  (transduce (map #(session.db/end-sessions-for-users! (vec %) reason (db-ended-by ended-by)))
             +
             0
             (partition-all app-db/update-partition-size user-ids)))

(mu/defn end-session-for-key! :- ms/IntGreaterThanOrEqualToZero
  "[[end-sessions!]] for the Session with `key-hashed`, returning the number ended."
  [key-hashed :- :string
   reason     :- ::session.schema/end-reason
   ended-by   :- ::session.schema/ended-by]
  (session.db/end-session-for-key! key-hashed reason (db-ended-by ended-by)))

(mu/defn touch-session!
  "Record that the Session with `key-hashed` was just used."
  [key-hashed :- :string]
  (session.db/touch-session! key-hashed))

(mu/defn delete-sessions-for-cleanup! :- ms/IntGreaterThanOrEqualToZero
  "Delete the Sessions whose recorded ending is before `cutoff`, returning the number deleted. A live session is never
  deleted, whatever its age."
  [cutoff :- ms/TemporalInstant]
  (session.db/delete-sessions-for-cleanup! cutoff))

(mu/defn delete-sessions-for-mcp-cleanup! :- ms/IntGreaterThanOrEqualToZero
  "Delete the MCP-backed `core_session` rows older than `max-age-minutes`, past their own `expires_at`, or idle longer
  than `idle-timeout-seconds` when it is given, returning the number deleted."
  [max-age-minutes      :- ms/PositiveInt
   idle-timeout-seconds :- [:maybe ms/PositiveInt]]
  (session.db/delete-sessions-for-mcp-cleanup! max-age-minutes idle-timeout-seconds))

;;; ----------------------------------------------------- Specs ------------------------------------------------------

(defmethod app-db-copy/spec :model/Session [_model]
  {:skip? true})
