(ns metabase-enterprise.permission-debug.preview-session
  "Preview sessions: a `core_session` row for the previewed person, for the frame that renders the item with the SDK.
  Two modes, never interchangeable:

  - `:header`: the troubleshooting page hands the frame the token, which it sends as
    `X-Metabase-Session: mb_preview_<key>`, winning over the admin's own cookie on the same origin;
  - `:host`: on the preview host (`MB_PERMISSION_PREVIEW_HOST`) the frame carries the key in the host-only cookie
    `metabase.PREVIEW_SESSION`, the only credential that host reads.

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
   [metabase.util.log :as log]
   [ring.util.codec :as codec]))

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
  "The `key_hashed` of a preview session's key, derived per mode, so a cookie's key replayed as a header token (or the
  other way round) matches no row."
  [mode session-key]
  (session/hash-session-key (str (case mode
                                   :header "permission-preview."
                                   :host   "permission-preview-host.")
                                 session-key)))

(defn- expires-at
  []
  (t/plus (t/offset-date-time) (t/minutes lifetime-minutes)))

(defn- create-session!
  [mode admin-id admin-key-hash user-id]
  (let [session-id  (session/generate-session-id)
        session-key (session/generate-session-key)
        expiry      (expires-at)]
    (permission-debug.db/insert-preview-session! session-id user-id (key-hash mode session-key) expiry)
    (swap! session-admins assoc session-id {:admin-id admin-id :admin-key-hash admin-key-hash :mode mode})
    (log/infof "Admin %d started %s preview session %s as user %d" admin-id (name mode) session-id user-id)
    {:session-id  session-id
     :session-key session-key
     :expires-at  (.toEpochSecond ^java.time.OffsetDateTime expiry)}))

(defn start-session!
  "Start a header preview session as `user-id` for `admin-id`, bound to the admin session whose `key_hashed` is
  `admin-key-hash`. Returns `{:session-id :session-token :expires-at}`, the expiry in epoch seconds."
  [admin-id admin-key-hash user-id]
  (let [{:keys [session-key] :as started} (create-session! :header admin-id admin-key-hash user-id)]
    (-> started
        (dissoc :session-key)
        (assoc :session-token (str token-prefix session-key)))))

(defn- end-sessions!
  [admin-id session-ids]
  (let [owned (filter #(= admin-id (:admin-id (get @session-admins %))) session-ids)]
    (when (seq owned)
      (permission-debug.db/delete-preview-sessions! (vec owned))
      (apply swap! session-admins dissoc owned)
      (log/infof "Admin %d ended preview sessions %s" admin-id (str/join ", " owned)))))

(defn end-session!
  "Delete the header preview session of `session-token` if `admin-id` started it."
  [admin-id session-token]
  (when-let [session-id (when (str/starts-with? session-token token-prefix)
                          (some->> (subs session-token (count token-prefix)) (key-hash :header)
                                   permission-debug.db/preview-session :id))]
    (end-sessions! admin-id [session-id]))
  nil)

(def ^:private code-lifetime-ms (* 60 1000))

;; TODO (proof of concept): like [[session-admins]], the codes live in this JVM only.
(defonce ^:private codes (atom {}))

(defn start-host-session!
  "Start a preview host session as `user-id` for `admin-id`, bound to the admin session whose `key_hashed` is
  `admin-key-hash`, and a one-time code (60 seconds) that the frame on the preview host trades for its cookie.
  Returns `{:session-id :code :code-expires-at :expires-at}`, times in epoch seconds. The admin's page gets the
  session's id, to end it, never its key."
  [admin-id admin-key-hash user-id]
  (let [{:keys [session-id session-key expires-at]} (create-session! :host admin-id admin-key-hash user-id)
        code                                        (session/generate-session-key)
        now-ms                                      (System/currentTimeMillis)
        code-expires-ms                             (+ now-ms code-lifetime-ms)]
    (swap! codes (fn [entries]
                   (-> (into {} (remove #(< (:expires-at-ms (val %)) now-ms)) entries)
                       (assoc code {:session-key    session-key
                                    :admin-id       admin-id
                                    :admin-key-hash admin-key-hash
                                    :expires-at-ms  code-expires-ms}))))
    {:session-id      session-id
     :code            code
     :code-expires-at (quot code-expires-ms 1000)
     :expires-at      expires-at}))

(defn- redeem-code!
  "The entry of `code` if it is known and unexpired, removing it either way: a code works once."
  [code]
  (when (string? code)
    (let [[before] (swap-vals! codes dissoc code)
          entry    (get before code)]
      (when (and entry (< (System/currentTimeMillis) (:expires-at-ms entry)))
        entry))))

(defn end-session-by-id!
  "Delete the preview session with `session-id` (a preview host's, whose key the admin's page never sees) if `admin-id`
  started it."
  [admin-id session-id]
  (end-sessions! admin-id [session-id])
  nil)

;;; ------------------------------------------------ The preview host's cookie ------------------------------------------------

(def ^:private host-cookie "metabase.PREVIEW_SESSION")

(def ^:private host-cookie-attributes
  "The preview cookie is host-only (no `Domain`) and out of scripts' reach. It is set and sent inside a frame whose top
  page is on the main host, another site to the browser, so only `SameSite=None` works, which needs `Secure` (Chrome
  allows it over http on `*.localhost`). `Partitioned` keeps it to frames under the main host's site: the preview
  host opened in its own tab doesn't get it."
  "Path=/; HttpOnly; SameSite=None; Secure; Partitioned")

(defn- safe-path?
  "Whether `to` is the content document on this host, so the exchange can't redirect anywhere else."
  [to]
  (boolean (and (string? to)
                (re-matches #"/embed/permission-preview-content(?:[/?][^\\\p{Cntrl}]*)?" to))))

(defn- plain-refusal
  [status message]
  {:status  status
   :headers {"Content-Type" "text/plain; charset=utf-8" "Cache-Control" "no-store"}
   :body    message})

(defenterprise preview-host-exchange
  "EE implementation: the preview host's `GET /preview-session?code=…&to=<path>`. Redeems `code`, checks that the admin
  session it was issued on is still live, sets the host-only preview cookie and redirects to `to`, the content
  document."
  :feature :advanced-permissions
  [{:keys [query-string]}]
  (let [params                                         (some-> query-string codec/form-decode)
        {:strs [code to]}                              (when (map? params) params)
        {:keys [session-key admin-id admin-key-hash]} (redeem-code! code)]
    (cond
      (not (safe-path? to))
      (plain-refusal 400 "`to` must be the content preview on this host.")

      (not (and session-key (permission-debug.db/live-superuser-session? admin-key-hash admin-id)))
      (plain-refusal 403 "This preview code is used, expired or unknown, or its admin signed out.")

      :else
      {:status  302
       :headers {"Location"      to
                 "Cache-Control" "no-store"
                 "Set-Cookie"    [(str host-cookie "=" session-key "; " host-cookie-attributes)]}
       :body    ""})))

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
  "EE implementation: run a request that carries a preview session (a header token, or on the preview host its
  cookie) as its user, read-only, with the admin who started it bound for the audit log, or refuse it (403, with an
  `error_code`). Never falls back to the admin."
  :feature :advanced-permissions
  [{:keys [uri request-method] :as request}]
  (let [{:keys [session-key host?]}                 (:metabase/preview-session request)
        mode                                        (if host? :host :header)
        row                                         (some->> session-key (key-hash mode)
                                                             permission-debug.db/preview-session)
        {:keys [admin-id admin-key-hash] :as owner} (some->> row :id (get @session-admins))]
    (cond
      ;; the preview host's document and assets load signed out until the cookie is set; its API never does
      (and host? (nil? session-key) (not (str/starts-with? uri "/api/")))
      {:request request}

      (or (nil? row) (nil? owner) (not= mode (:mode owner)))
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
