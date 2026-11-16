(ns metabase-enterprise.permission-debug.preview
  "Preview the app as another user: an admin's browser tab sends `X-Metabase-Preview-As: <user-id>` on every API call,
  and the request is bound to that user instead of the admin, read-only.

  The header is honored only on a superuser's own browser session (the `metabase.SESSION` cookie, not a JSON Web Token
  login), never for API keys, OAuth or Model Context Protocol tokens, header sessions (the SDK), or a data app. Anything
  else carrying the header runs as its own user, as if the header weren't there.

  In preview, only reads go through: `GET`, `HEAD`, `OPTIONS`, and the `POST`s in [[read-only-posts]], which run
  queries. Every other request is refused with a 403 before it reaches its endpoint."
  (:require
   [clojure.string :as str]
   [metabase-enterprise.permission-debug.db :as permission-debug.db]
   [metabase.events.core :as events]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(def ^:private preview-header "x-metabase-preview-as")

(def ^:private preview-param
  "The query parameter that carries the preview on requests the browser makes without the API client (map tiles)."
  "preview_as")

(def ^:private preview-end-uri
  "Ending a preview is the admin's own request, even from a tab that still sends the header."
  "/api/ee/permission_debug/preview/end")

(def ^:private read-only-posts
  "`POST` endpoints that only read: running a query, a saved question, a dashboard card, loading parameter values, or
  downloading results, which run as the previewed user with their download permissions."
  [#"^/api/dataset$"
   #"^/api/dataset/pivot$"
   #"^/api/dataset/native$"
   #"^/api/dataset/query_metadata$"
   #"^/api/dataset/parameter/values$"
   #"^/api/dataset/parameter/search/[^/]+$"
   #"^/api/card/\d+/query$"
   #"^/api/card/pivot/\d+/query$"
   #"^/api/dashboard/\d+/dashcard/\d+/card/\d+/query$"
   #"^/api/dashboard/pivot/\d+/dashcard/\d+/card/\d+/query$"
   #"^/api/dataset/(csv|json|xlsx)$"
   #"^/api/card/\d+/query/(csv|json|xlsx)$"
   #"^/api/dashboard/\d+/dashcard/\d+/card/\d+/query/(csv|json|xlsx)$"
   #"^/api/document/\d+/card/\d+/query/(csv|json|xlsx)$"])

;; TODO (proof of concept): a user's preview values live in this JVM only, keyed by admin and user, so two tabs in
;; which one admin previews the same user share them. Assumes one preview of a person per admin at a time.
(defonce ^:private attribute-overrides (atom {}))

(defn set-attribute-overrides!
  "Run every preview `admin-id` makes as `user-id` with `overrides` (attribute to value, an empty string for no value)
  in place of the user's own values, until the preview `preview-id` ends or a new start replaces them. Never written
  to the user's row."
  [admin-id user-id preview-id overrides]
  (if (seq overrides)
    (swap! attribute-overrides assoc [admin-id user-id] {:preview-id preview-id :overrides overrides})
    (swap! attribute-overrides dissoc [admin-id user-id])))

(defn clear-attribute-overrides!
  "Drop the overrides of the preview `preview-id`, unless a newer start of the same person replaced them."
  [admin-id user-id preview-id]
  (swap! attribute-overrides (fn [entries]
                               (cond-> entries
                                 (= preview-id (get-in entries [[admin-id user-id] :preview-id]))
                                 (dissoc [admin-id user-id])))))

(defn attribute-overrides-of
  "The attribute values that replace `user-id`'s own in `admin-id`'s preview, or nil."
  [admin-id user-id]
  (get-in @attribute-overrides [[admin-id user-id] :overrides]))

(def ^:private user-info-keys
  "The keys of a request's current-user info, all replaced by the previewed user's own."
  [:metabase-user-id :is-superuser? :is-data-analyst? :is-group-manager? :permissions-set :user-locale :settings])

(defn- previewing-session?
  "Whether `request` is a superuser's own browser session, the only credential that may preview."
  [{:keys [is-superuser? metabase-session-type token-scopes uri] :as request}]
  (and is-superuser?
       (some? (:metabase/authed-session-key-hash request))
       (= metabase-session-type :normal)
       (nil? token-scopes)
       (not= "jwt" (:embedding/auth-method request))
       (str/starts-with? uri "/api/")
       (not (str/starts-with? uri "/api/embed/"))
       (not (str/starts-with? uri "/api/public/"))))

(defn read-only-request?
  "Whether `request` only reads: `GET`, `HEAD`, `OPTIONS`, or one of [[read-only-posts]]."
  [{:keys [request-method uri]}]
  (or (#{:get :head :options} request-method)
      (and (= :post request-method)
           (boolean (some #(re-matches % uri) read-only-posts)))))

(defn- refusal
  [message]
  {:response {:status  403
              :headers {"Content-Type" "application/json; charset=utf-8"}
              :body    (json/encode {:message message})}})

(defn- parse-user-id
  [header-value]
  (when (re-matches #"\d+" (str header-value))
    (parse-long header-value)))

(defn- preview-param-value
  "The `preview_as` value of a map tile request, or nil. Only tiles: the browser loads them as images, without the API
  client that sends the header."
  [{:keys [request-method uri query-string]}]
  (when (and (= :get request-method) query-string (str/starts-with? uri "/api/tiles/"))
    (some (fn [pair]
            (let [[k v] (str/split pair #"=" 2)]
              (when (= preview-param k) (or v ""))))
          (str/split query-string #"&"))))

(defn- without-preview-param
  "`request` without `preview_as` in its query string, since the tile endpoints accept no other parameters."
  [{:keys [query-string] :as request}]
  (if-not query-string
    request
    (assoc request :query-string (not-empty (str/join "&" (remove #(or (= preview-param %)
                                                                       (str/starts-with? % (str preview-param "=")))
                                                                  (str/split query-string #"&")))))))

(defenterprise preview-as-request
  "EE implementation: when a superuser's browser session sends `X-Metabase-Preview-As: <user-id>` (or, for a map tile,
  `?preview_as=<user-id>`), rebind the request to that user, refuse writes, and record each query run in the audit log
  under the admin. Returns `:admin-id` too, so the request runs with
  [[metabase.api.common/*previewing-admin-id*]] bound and every audit row names the admin, and `:attributes`, the
  admin's overrides of the user's values."
  :feature :advanced-permissions
  [request]
  (let [param-value  (preview-param-value request)
        header-value (or (get-in request [:headers preview-header]) param-value)
        request      (cond-> request param-value without-preview-param)]
    (if-not (and header-value
                 (previewing-session? request)
                 (not= preview-end-uri (:uri request)))
      {:request request}
      (let [admin-id    (:metabase-user-id request)
            target-id   (parse-user-id header-value)
            target-info (some-> target-id permission-debug.db/previewable-user-info)]
        (cond
          ;; fail closed: an admin who asked for a preview must never silently see their own view instead
          (nil? target-info)
          (refusal "This user can't be previewed: only active users who aren't admins can.")

          (not (read-only-request? request))
          (do (log/infof "Refused %s %s while admin %d previews user %d"
                         (u/upper-case-en (name (:request-method request))) (:uri request) admin-id target-id)
              (refusal "You're previewing another user, so changes aren't allowed."))

          :else
          (do
            (when (= :post (:request-method request))
              (events/publish-event! :event/permissions-preview
                                     {:user-id  admin-id
                                      :model    :model/User
                                      :model-id target-id
                                      :details  {:action "query"
                                                 :uri    (:uri request)}}))
            {:request    (merge (apply dissoc request user-info-keys) target-info)
             :admin-id   admin-id
             :attributes (attribute-overrides-of admin-id target-id)}))))))
