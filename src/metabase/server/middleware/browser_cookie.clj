(ns metabase.server.middleware.browser-cookie
  "Middleware that sets a permanent browser identifier cookie so we can identify logins from new browsers. This is
  mostly so we can send people 'login from a new device' emails the first time they log in with a new browser. If this
  cookie is deleted, it's fine; the user will just get an email saying they logged in from a new device next time
  they log in."
  (:require [java-time :as t]
            [metabase.util.schema :as su]
            [ring.util.response :as resp]
            [schema.core :as s])
  (:import java.util.UUID))

(def ^:private browser-id-cookie-name "metabase.DEVICE")

;; This cookie doesn't need to be secure, because it's only used for notification purposes
(def ^:private cookie-options
  {:http-only true
   :path      "/"
   :same-site :lax
   ;; Set the cookie to expire 20 years from now. That should be sufficient
   :expires   (t/format :rfc-1123-date-time (t/plus (t/zoned-date-time) (t/years 20)))})

(s/defn ^:private add-browser-id-cookie [response browser-id :- su/NonBlankString]
  (resp/set-cookie response browser-id-cookie-name browser-id cookie-options))

(defn ensure-browser-id-cookie
  "Set a permanent browser identifier cookie if one is not already set."
  [handler]
  (fn [request respond raise]
    (if-let [browser-id (get-in request [:cookies browser-id-cookie-name :value])]
      (handler (assoc request :browser-id browser-id) respond raise)
      (let [browser-id (str (UUID/randomUUID))]
        (handler
         (assoc request :browser-id browser-id)
         (fn [response]
           (respond (add-browser-id-cookie response browser-id)))
         raise)))))
