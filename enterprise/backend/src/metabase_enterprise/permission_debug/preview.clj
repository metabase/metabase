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

(def ^:private read-only-posts
  "`POST` endpoints that only read: running a query, a saved question, a dashboard card, or loading parameter values.
  Downloads (`/api/card/:id/query/:format`) aren't here: a preview shows the rows, it doesn't export them."
  [#"^/api/dataset$"
   #"^/api/dataset/pivot$"
   #"^/api/dataset/native$"
   #"^/api/dataset/query_metadata$"
   #"^/api/dataset/parameter/values$"
   #"^/api/dataset/parameter/search/[^/]+$"
   #"^/api/card/\d+/query$"
   #"^/api/card/pivot/\d+/query$"
   #"^/api/dashboard/\d+/dashcard/\d+/card/\d+/query$"
   #"^/api/dashboard/pivot/\d+/dashcard/\d+/card/\d+/query$"])

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

(defn- read-only-request?
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

(defenterprise preview-as-request
  "EE implementation: when a superuser's browser session sends `X-Metabase-Preview-As: <user-id>`, rebind the request
  to that user, refuse writes, and record each query run in the audit log under the admin."
  :feature :advanced-permissions
  [request]
  (let [header-value (get-in request [:headers preview-header])]
    (if-not (and header-value (previewing-session? request))
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
            {:request (merge (apply dissoc request user-info-keys) target-info)}))))))
