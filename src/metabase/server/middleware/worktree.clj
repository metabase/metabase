(ns metabase.server.middleware.worktree
  "Runs a request in a remote sync worktree: in the default worktree without a user, so that a health check or a public
  link reads no worktree row, across every worktree while none but the default one exists, else in the worktree its
  `X-Metabase-Worktree-Id` header names, which only superusers can send, else in the one a superuser checked out, else
  in the default worktree."
  (:require
   [metabase.api.common :as api]
   [metabase.app-db.core :as mdb]
   [metabase.remote-sync.core :as remote-sync]
   [metabase.util.i18n :refer [tru]]))

(set! *warn-on-reflection* true)

(defn- text-response
  "A plain text response with `status` and `body`."
  [status body]
  {:status  status
   :headers {"Content-Type" "text/plain"}
   :body    body})

(defn- header-scope
  "The scope the `X-Metabase-Worktree-Id` header `value` names, `0` naming the default worktree, or an error response:
  401 without a user, 403 for a user who is not an admin, 400 for a worktree that is not there."
  [value]
  (cond
    (nil? api/*current-user-id*) {:response (text-response 401 (tru "Unauthenticated"))}
    (not api/*is-superuser?*)    {:response (text-response 403 (tru "Only admins can choose a worktree."))}
    (= "0" value)                {:scope mdb/default-worktree-scope}
    :else                        (if-let [worktree (some-> value parse-long remote-sync/non-default-worktree)]
                                   {:scope (mdb/worktree-id->scope (:id worktree))}
                                   {:response (text-response 400 (tru "There is no worktree {0}." value))})))

(defn- request-scope
  "The scope a request with the `X-Metabase-Worktree-Id` header `value`, or none, runs in, or an error response."
  [value]
  (cond
    value                                       (header-scope value)
    (nil? api/*current-user-id*)                {:scope mdb/default-worktree-scope}
    (empty? (remote-sync/non-default-worktrees)) {:scope {:type :all}}
    api/*is-superuser?*                         {:scope (mdb/worktree-id->scope
                                                         (or (remote-sync/user-non-default-worktree-id api/*current-user-id*)
                                                             mdb/default-worktree-id))}
    :else                                       {:scope mdb/default-worktree-scope}))

(defn wrap-worktree
  "Middleware that runs a request in the remote sync worktree it works in."
  [handler]
  (fn [request respond raise]
    (let [{:keys [scope response]} (request-scope (get-in request [:headers "x-metabase-worktree-id"]))]
      (if response
        (respond response)
        (mdb/with-worktree-scope scope
          (handler request respond raise))))))
