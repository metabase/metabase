(ns metabase-enterprise.permission-debug.preview-session
  "Preview sessions: a `core_session` row for the previewed person, so the troubleshooting page's frame is signed in
  as them rather than stamping a header on each request. Two ways to carry it:

  - Same origin: the HttpOnly cookie `metabase.PREVIEW_SESSION.<session id>`, which counts only on a request that
    also carries its token (`X-Metabase-Preview-Token`, or `?preview_token=` on a map tile), the way the embedded
    session's cookie needs its anti-CSRF token. The framed app keeps the token in memory. Without it, a request runs on
    the admin's own session.
  - The preview host ([[metabase.server.settings/permission-preview-origin]]): the host-only cookie
    `metabase.PREVIEW_HOST_SESSION`, the only credential that host reads.

  Either starts from a one-time code that `POST /preview/code` mints for the admin's browser session. A preview
  session is read-only like the header preview, its audit rows name the admin, it expires 30 minutes after it was
  last renewed (each request renews it once it has less than 20 left), and it works only while the admin session that
  minted its code is live.

  The row's key is hashed with a preview-only prefix, so no ordinary session lookup (`metabase.SESSION`,
  `X-Metabase-Session`, the embedded cookie) ever matches it."
  (:require
   [buddy.core.codecs :as codecs]
   [buddy.core.nonce :as nonce]
   [clojure.string :as str]
   [java-time.api :as t]
   [metabase-enterprise.permission-debug.db :as permission-debug.db]
   [metabase-enterprise.permission-debug.preview :as preview]
   [metabase-enterprise.permission-debug.preview-grant :as preview-grant]
   [metabase.api.common :as api]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.session.core :as session]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [metabase.util.log :as log])
  (:import
   (java.security MessageDigest)))

(set! *warn-on-reflection* true)

(def token-header
  "The response header the same-origin exchange returns the token in."
  "X-Metabase-Preview-Token")

(def ^:private cookie-prefix "metabase.PREVIEW_SESSION.")

(def ^:private code-lifetime-ms (* 60 1000))

(def ^:private lifetime-minutes 30)

(def ^:private renew-below-minutes 20)

;; TODO (proof of concept): codes and which admin session each preview session belongs to live in this JVM only, so a
;; restart ends every preview (its row is left to expire) and a second instance knows none of them. Assumes a single
;; instance; a real build would keep the binding in the app DB.
(defonce ^:private codes (atom {}))

(defonce ^:private session-admins (atom {}))

(defn- random-hex
  [byte-count]
  (codecs/bytes->hex (nonce/random-bytes byte-count)))

(defn- key-hash
  "The `key_hashed` of a preview session's key: prefixed per mode, so neither an ordinary session lookup nor the other
  mode's cookie matches it."
  [mode session-key]
  (session/hash-session-key (str "permission-preview." (name mode) "." session-key)))

(defn- cookie-name
  [session-id]
  (str cookie-prefix session-id))

(def ^:private cleared-cookie
  {:value "" :path "/" :max-age 0 :expires "Thu, 1 Jan 1970 00:00:00 GMT"})

;;; ------------------------------------------------ Codes ------------------------------------------------

(defn mint-code!
  "A one-time code, valid for 60 seconds, that starts a preview session as `user-id` for `admin-id`, bound to the
  admin session whose `key_hashed` is `admin-key-hash`. Returns `{:code :expires-at}`, the expiry in epoch seconds."
  [admin-id admin-key-hash user-id]
  (let [now        (System/currentTimeMillis)
        expires-ms (+ now code-lifetime-ms)
        code       (random-hex 24)]
    (swap! codes (fn [codes]
                   (assoc (into {} (remove (fn [[_ {:keys [expires-at-ms]}]] (< expires-at-ms now))) codes)
                          code {:admin-id       admin-id
                                :admin-key-hash admin-key-hash
                                :user-id        user-id
                                :expires-at-ms  expires-ms})))
    {:code code :expires-at (quot expires-ms 1000)}))

(defn- redeem-code!
  "The entry `code` was minted with, removing it, or nil when it is unknown, used or expired."
  [code]
  (when (string? code)
    (let [[before] (swap-vals! codes dissoc code)]
      (when-let [{:keys [expires-at-ms] :as entry} (get before code)]
        (when (< (System/currentTimeMillis) expires-at-ms)
          entry)))))

;;; ------------------------------------------------ Sessions ------------------------------------------------

(defn- expires-at
  []
  (t/plus (t/offset-date-time) (t/minutes lifetime-minutes)))

(defn- create-session!
  "Insert a preview session for a redeemed code's entry in `mode` (`:cookie` or `:host`), returning its id, its key
  and, for `:cookie`, its token: `<session id>.<random>`, so the request says which of several cookies it means."
  [mode {:keys [admin-id admin-key-hash user-id]}]
  (let [session-id  (session/generate-session-id)
        session-key (session/generate-session-key)
        token       (when (= :cookie mode) (str session-id "." (random-hex 16)))]
    (permission-debug.db/insert-preview-session! session-id user-id (key-hash mode session-key) token (expires-at))
    (swap! session-admins assoc session-id {:admin-id       admin-id
                                            :admin-key-hash admin-key-hash
                                            :mode           mode})
    (log/infof "Admin %d started preview session %s (%s) as user %d" admin-id session-id (name mode) user-id)
    {:session-id session-id :session-key session-key :token token}))

(defn- end-sessions!
  "Delete the preview sessions with `session-ids`, of any admin when `admin-id` is nil, else only that admin's."
  [admin-id session-ids]
  (let [owned (filterv (fn [session-id]
                         (let [owner (:admin-id (get @session-admins session-id))]
                           (and owner (or (nil? admin-id) (= admin-id owner)))))
                       session-ids)]
    (permission-debug.db/delete-preview-sessions! owned)
    (swap! session-admins #(apply dissoc % owned))
    owned))

(defn- preview-cookie-session-ids
  "The session ids of the same-origin preview cookies `cookies` carries."
  [cookies]
  (keep (fn [[cookie-name _]]
          (when (str/starts-with? cookie-name cookie-prefix)
            (subs cookie-name (count cookie-prefix))))
        cookies))

(defn exchange-for-cookie!
  "The same-origin exchange: redeem `code` on the admin's own browser session (the one it was minted on), and answer
  with the preview session's HttpOnly cookie and, in [[token-header]], its token. Clears the admin's older preview
  cookies and ends their sessions."
  [{:keys [cookies] :as request} code]
  (let [{:keys [admin-id admin-key-hash user-id] :as entry} (redeem-code! code)]
    (api/check (and entry
                    (= admin-id api/*current-user-id*)
                    (= admin-key-hash (:metabase/authed-session-key-hash request)))
               [403 "This preview code isn't valid for this session."])
    (let [older                                  (preview-cookie-session-ids cookies)
          _                                      (end-sessions! admin-id older)
          {:keys [session-id session-key token]} (create-session! :cookie entry)]
      {:status  200
       :headers {token-header token}
       :cookies (into {(cookie-name session-id) {:value     session-key
                                                 :path      "/"
                                                 :http-only true
                                                 :same-site :lax}}
                      (map (fn [old-id] [(cookie-name old-id) cleared-cookie]))
                      older)
       :body    {:session_id session-id
                 :user_id    user-id}})))

(defn end-session!
  "End the preview session `session-id` of `admin-id`: delete its row, and clear its same-origin cookie. A preview
  host cookie can't be cleared from the main host; with its row gone it no longer works."
  [admin-id session-id]
  (end-sessions! admin-id [session-id])
  {(cookie-name session-id) cleared-cookie})

;;; ------------------------------------------------ Requests ------------------------------------------------

(defn- refusal
  [error-code message]
  {:response {:status  403
              :headers {"Content-Type" "application/json; charset=utf-8"}
              :body    (json/encode {:error_code error-code :message message})}})

(defn- matching-token?
  [token stored]
  (boolean (and token stored
                (MessageDigest/isEqual (codecs/str->bytes token) (codecs/str->bytes stored)))))

(defn- past?
  [instant]
  (t/before? (t/instant instant) (t/instant)))

(defn- renew-if-due!
  [{:keys [id expires_at]}]
  (when (t/before? (t/instant expires_at) (t/plus (t/instant) (t/minutes renew-below-minutes)))
    (permission-debug.db/renew-preview-session! id (expires-at))))

(defenterprise preview-session-request
  "EE implementation: run a request that carries a preview session as its user, read-only, with the admin who started
  it bound for the audit log, or refuse it (403, with an `error_code`). Never falls back to the admin: the strategy
  picks the preview session only when the request carries a token."
  :feature :advanced-permissions
  [{:keys [uri request-method] :as request}]
  (let [{:keys [session-key token host?]} (:metabase/preview-session request)
        mode                              (if host? :host :cookie)
        row                               (some->> session-key (key-hash mode) permission-debug.db/preview-session)
        {:keys [admin-id admin-key-hash] :as owner} (some->> row :id (get @session-admins))]
    (cond
      (or (nil? row) (nil? owner) (not= mode (:mode owner))
          (and (= :cookie mode) (not (matching-token? token (:anti_csrf_token row)))))
      (refusal "preview-session-invalid" "This preview session doesn't exist, or this isn't its token.")

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
