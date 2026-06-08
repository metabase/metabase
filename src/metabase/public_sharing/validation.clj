(ns metabase.public-sharing.validation
  (:require
   [metabase.api.common :as api]
   [metabase.api.routes.common :as routes.common]
   [metabase.public-sharing.settings :as public-sharing.settings]
   [metabase.public-sharing.unlock :as unlock]
   [metabase.util.i18n :refer [tru]]
   [toucan2.core :as t2]))

(defn check-public-sharing-enabled
  "Check that the `public-sharing-enabled` Setting is `true`, or throw a `400`."
  []
  (api/check (public-sharing.settings/enable-public-sharing)
             [400 (tru "Public sharing is not enabled.")]))

(defn enforce-public-sharing-enabled
  "Ring middleware that checks public sharing is enabled site-wide before handling the request to a public endpoint."
  [handler]
  (fn [request respond raise]
    (if (public-sharing.settings/enable-public-sharing)
      (handler request respond raise)
      (raise (ex-info (tru "Public sharing is not enabled.") {:status-code 400})))))

(def ^{:arglists '([handler])} +public-sharing-enabled
  "Wrap `routes` so they may only be accessed when public sharing is enabled."
  (routes.common/wrap-middleware-for-open-api-spec-generation enforce-public-sharing-enabled))

;;; -------------------------------------------- Unlock check middleware -----------------------------------------------

(def ^:private uuid-regex "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}")

(defn- unlock-path?
  "Returns true if `path` is an unlock endpoint that should be exempt from the unlock check."
  [path]
  (boolean (re-matches (re-pattern (str "/(?:card|dashboard)/" uuid-regex "/unlock")) path)))

(defn- parse-public-entity
  "Parse the request path (relative to `/api/public/`) to extract `[entity-type uuid]`.
  Returns nil for paths that don't resolve a card/dashboard UUID (oembed, action, document, unlock)."
  [path]
  (when-not (unlock-path? path)
    (some (fn [[pattern entity-type]]
            (when-let [[_ uuid] (re-matches pattern path)]
              [entity-type uuid]))
          [[#_card      (re-pattern (str "/card/(" uuid-regex ")(?:/.*)?"))      :card]
           [#_dashboard (re-pattern (str "/dashboard/(" uuid-regex ")(?:/.*)?")) :dashboard]
           [#_pivot     (re-pattern (str "/pivot/card/(" uuid-regex ")(?:/.*)?"))      :card]
           [#_pivot     (re-pattern (str "/pivot/dashboard/(" uuid-regex ")(?:/.*)?")) :dashboard]
           [#_tiles     (re-pattern (str "/tiles/card/(" uuid-regex ")(?:/.*)?"))      :card]
           [#_tiles     (re-pattern (str "/tiles/dashboard/(" uuid-regex ")(?:/.*)?")) :dashboard]])))

(defn- entity-password
  "Look up the `public_link_password` for a card or dashboard by public UUID. Returns the decrypted password or nil."
  [entity-type uuid]
  (case entity-type
    :card      (t2/select-one-fn :public_link_password :model/Card      :public_uuid uuid :archived false)
    :dashboard (t2/select-one-fn :public_link_password :model/Dashboard :public_uuid uuid :archived false)))

(def ^:private locked-response
  {:status  403
   :headers {"Content-Type" "application/json; charset=utf-8"}
   :body    "{\"error_code\":\"public-link-password-required\"}"})

(defn enforce-unlock-check
  "Ring middleware that gates password-protected public links. If the entity has a password and the request
  lacks a valid unlock cookie, responds with 403 `{error_code: \"public-link-password-required\"}`."
  [handler]
  (fn [request respond raise]
    (let [path (or (:compojure/path request) (:path-info request) (:uri request))]
      (if-let [[entity-type uuid] (parse-public-entity path)]
        (if-let [password (entity-password entity-type uuid)]
          ;; Entity is locked — check for a valid unlock cookie
          (if (unlock/unlocked? request entity-type uuid password)
            (handler request respond raise)
            (respond locked-response))
          ;; No password set — pass through
          (handler request respond raise))
        ;; Not a card/dashboard UUID path (oembed, action, document, unlock) — pass through
        (handler request respond raise)))))

(def ^{:arglists '([handler])} +unlock-check
  "Wrap `routes` so password-protected public links require a valid unlock cookie."
  (routes.common/wrap-middleware-for-open-api-spec-generation enforce-unlock-check))
