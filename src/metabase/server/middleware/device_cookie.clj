(ns metabase.server.middleware.device-cookie
  "Middleware that sets a permanent device identifier cookie so we can identify logins from new devices. This is mostly
  so we can send people emails when the log in from a new device. If this cookie is deleted, it's fine; the user will
  just get an email saying they logged in from a new device next time they log in."
  (:require [java-time :as t]
            [metabase.util.schema :as su]
            [ring.util.response :as resp]
            [schema.core :as s])
  (:import java.util.UUID))

(def ^:private device-id-cookie-name "metabase.DEVICE")

;; this cookie doesn't need to be secure, because it's only used for notification purposes
(def ^:private cookie-options
  {:http-only true
   :path      "/"
   :same-site :lax
   ;; Set the cookie to expire 20 years from now. That should be sufficient
   :expires   (t/format :rfc-1123-date-time (t/plus (t/zoned-date-time) (t/years 20)))})

(s/defn ^:private add-device-id-cookie [response device-id :- su/NonBlankString]
  (resp/set-cookie response device-id-cookie-name device-id cookie-options))

(defn ensure-device-id-cookie
  [handler]
  (fn [request respond raise]
    (if-let [device-id (get-in request [:cookies device-id-cookie-name :value])]
      (handler (assoc request :device-id device-id) respond raise)
      (let [device-id (str (UUID/randomUUID))]
        (handler
         (assoc request :device-id device-id)
         (fn [response]
           (respond (add-device-id-cookie response device-id)))
         raise)))))
