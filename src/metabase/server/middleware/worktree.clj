(ns metabase.server.middleware.worktree
  "Runs a request in a remote sync worktree, on a PostgreSQL app DB only, since it alone keeps worktrees apart: the
  worktree its `X-Metabase-Worktree-Id` header names, which only superusers can send, or else the one a superuser
  checked out, since only admins work on worktree content."
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

(defn- header-worktree
  "The worktree id the `X-Metabase-Worktree-Id` header `value` names, `0` naming the main app, or an error response."
  [value]
  (let [worktree-id (parse-long value)]
    (cond
      (not api/*is-superuser?*)
      {:response (text-response 403 (tru "Only admins can choose a worktree."))}

      (= 0 worktree-id)
      {:worktree-id nil}

      (and worktree-id
           (pos? worktree-id)
           (not= mdb/default-worktree-id worktree-id)
           (mdb/worktrees-supported?)
           (remote-sync/worktree-exists? worktree-id))
      {:worktree-id worktree-id}

      :else
      {:response (text-response 400 (tru "There is no worktree {0}." value))})))

(defn- run-in-worktree
  "Runs `handler` on `request` with the app DB connections in the worktree with `worktree-id`, or in the main app when
  it is nil."
  [worktree-id handler request respond raise]
  (mdb/with-worktree-scope (mdb/worktree-scope worktree-id)
    (handler request respond raise)))

(defn wrap-worktree
  "Middleware that runs a request in the worktree its `X-Metabase-Worktree-Id` header names, `0` for the main app,
  which only superusers can send, or else in the worktree its user works in when they are a superuser."
  [handler]
  (fn [request respond raise]
    (if-let [value (get-in request [:headers "x-metabase-worktree-id"])]
      (let [{:keys [worktree-id response]} (header-worktree value)]
        (if response
          (respond response)
          (run-in-worktree worktree-id handler request respond raise)))
      (run-in-worktree (when (and api/*is-superuser?* (mdb/worktrees-supported?)) (:worktree-id request))
                       handler request respond raise))))
