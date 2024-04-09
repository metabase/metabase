(ns metabase.server.middleware.browser-cookie
  "Middleware that sets a permanent browser identifier cookie so we can identify logins from new browsers. This is
  mostly so we can send people 'login from a new device' emails the first time they log in with a new browser. If this
  cookie is deleted, it's fine; the user will just get an email saying they logged in from a new device next time
  they log in."
  (:require
   [java-time.api :as t]
   [metabase.server.request.util :as req.util]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [ring.util.response :as response]))

(set! *warn-on-reflection* true)

(def ^:private browser-id-cookie-name "metabase.DEVICE")

;; This cookie doesn't need to be secure, because it's only used for notification purposes and cannot be used for
;; CSRF as it is not a session cookie.
;; However, we do need to make sure it's persisted/sent as much as possible to prevent superfluous login notification
;; emails when used with full-app embedding, which means setting SameSite=None when possible (over HTTPS) and
;; SameSite=Lax otherwise. (See #18553)
(defn- cookie-options
  [request]
  (merge {:http-only true
          :path      "/"
          ;; Set the cookie to expire 20 years from now. That should be sufficient
          :expires   (t/format :rfc-1123-date-time (t/plus (t/zoned-date-time) (t/years 20)))}
         (if (req.util/https? request)
           {:same-site :none, :secure true}
           {:same-site :lax})))

(mu/defn ^:private add-browser-id-cookie [request response browser-id :- ms/NonBlankString]
  (response/set-cookie response browser-id-cookie-name browser-id (cookie-options request)))

(defn ensure-browser-id-cookie
  "Set a permanent browser identifier cookie if one is not already set."
  [handler]
  (fn [request respond raise]
    (if-let [browser-id (get-in request [:cookies browser-id-cookie-name :value])]
      (handler (assoc request :browser-id browser-id) respond raise)
      (let [browser-id (str (random-uuid))]
        (handler
         (assoc request :browser-id browser-id)
         (fn [response]
           (respond (add-browser-id-cookie request response browser-id)))
         raise)))))
