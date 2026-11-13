(ns metabase-enterprise.permission-debug.preview-session
  "Preview sessions: a `core_session` row for the previewed person, whose token the troubleshooting page hands to the
  frame that renders the item with the SDK. The frame sends it as `X-Metabase-Session: mb_preview_<key>`, which wins
  over the admin's own cookie on the same origin.

  `POST /preview/session` starts one for the admin's browser session. It is read-only like the header preview, its
  audit rows name the admin, it expires 30 minutes after it was last renewed (each request renews it once it has less
  than 20 left), and it works only while the admin session that started it is live.

  The row's key is hashed with a preview-only prefix, so the ordinary session lookup never matches it: the token is
  good for nothing but a preview."
  (:require
   [clojure.string :as str]
   [java-time.api :as t]
   [metabase-enterprise.permission-debug.db :as permission-debug.db]
   [metabase-enterprise.permission-debug.preview :as preview]
   [metabase-enterprise.permission-debug.preview-grant :as preview-grant]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.session.core :as session]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(def ^:private token-prefix
  "What a preview session's token starts with, so the session middleware (`metabase.server.middleware.session`, which
  has its own copy) tells it from an ordinary session key."
  "mb_preview_")

(def ^:private lifetime-minutes 30)

(def ^:private renew-below-minutes 20)

;; TODO (proof of concept): which admin session each preview session belongs to lives in this JVM only, so a restart
;; ends every preview (its row is left to expire) and a second instance knows none of them. Assumes a single
;; instance; a real build would keep the binding in the app DB.
(defonce ^:private session-admins (atom {}))

(defn- key-hash
  [session-key]
  (session/hash-session-key (str "permission-preview." session-key)))

(defn- expires-at
  []
  (t/plus (t/offset-date-time) (t/minutes lifetime-minutes)))

(defn start-session!
  "Start a preview session as `user-id` for `admin-id`, bound to the admin session whose `key_hashed` is
  `admin-key-hash`. Returns `{:session-id :session-token :expires-at}`, the expiry in epoch seconds."
  [admin-id admin-key-hash user-id]
  (let [session-id  (session/generate-session-id)
        session-key (session/generate-session-key)
        expiry      (expires-at)]
    (permission-debug.db/insert-preview-session! session-id user-id (key-hash session-key) expiry)
    (swap! session-admins assoc session-id {:admin-id admin-id :admin-key-hash admin-key-hash})
    (log/infof "Admin %d started preview session %s as user %d" admin-id session-id user-id)
    {:session-id    session-id
     :session-token (str token-prefix session-key)
     :expires-at    (.toEpochSecond ^java.time.OffsetDateTime expiry)}))

(defn end-session!
  "Delete the preview session of `session-token` if `admin-id` started it."
  [admin-id session-token]
  (when-let [session-id (when (str/starts-with? session-token token-prefix)
                          (some-> (subs session-token (count token-prefix)) key-hash
                                  permission-debug.db/preview-session :id))]
    (when (= admin-id (:admin-id (get @session-admins session-id)))
      (permission-debug.db/delete-preview-sessions! [session-id])
      (swap! session-admins dissoc session-id)
      (log/infof "Admin %d ended preview session %s" admin-id session-id)))
  nil)

;;; ------------------------------------------------ Requests ------------------------------------------------

(defn- refusal
  [error-code message]
  {:response {:status  403
              :headers {"Content-Type" "application/json; charset=utf-8"}
              :body    (json/encode {:error_code error-code :message message})}})

(defn- past?
  [instant]
  (t/before? (t/instant instant) (t/instant)))

(defn- renew-if-due!
  [{:keys [id expires_at]}]
  (when (t/before? (t/instant expires_at) (t/plus (t/instant) (t/minutes renew-below-minutes)))
    (permission-debug.db/renew-preview-session! id (expires-at))))

(defenterprise preview-session-request
  "EE implementation: run a request that carries a preview session token as its user, read-only, with the admin who
  started it bound for the audit log, or refuse it (403, with an `error_code`). Never falls back to the admin."
  :feature :advanced-permissions
  [{:keys [uri request-method] :as request}]
  (let [row                                        (some-> request :metabase/preview-session :session-key key-hash
                                                           permission-debug.db/preview-session)
        {:keys [admin-id admin-key-hash] :as owner} (some->> row :id (get @session-admins))]
    (cond
      (or (nil? row) (nil? owner))
      (refusal "preview-session-invalid" "This preview session doesn't exist.")

      (:ended_at row)
      (refusal "preview-session-ended" "This preview session has ended.")

      (past? (:expires_at row))
      (refusal "preview-session-expired" "This preview session has expired.")

      (not (permission-debug.db/live-superuser-session? admin-key-hash admin-id))
      (refusal "preview-admin-session-ended" "The admin session that started this preview has ended.")

      :else
      (let [target (permission-debug.db/preview-target (:user_id row))]
        (or (preview-grant/target-refusal target)
            (if-not (preview/read-only-request? request)
              (do (log/infof "Refused %s %s in admin %d's preview session as user %d"
                             (u/upper-case-en (name request-method)) uri admin-id (:user_id row))
                  (refusal "preview-read-only" "You're previewing another user, so changes aren't allowed."))
              (do
                (renew-if-due! row)
                (when (= :post request-method)
                  (preview-grant/record-query! admin-id (:user_id row) request))
                {:request  (preview-grant/as-target request target)
                 :admin-id admin-id})))))))
