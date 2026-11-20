(ns metabase.server.middleware.worktree
  "Runs a request in a remote sync worktree: the one its `X-Metabase-Worktree-Id` header names, which only superusers
  can send, or else the one its user works in."
  (:require
   [metabase.api.common :as api]
   [metabase.app-db.core :as mdb]
   [metabase.server.db :as server.db]
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
           (= :postgres (mdb/db-type))
           (server.db/worktree-exists? worktree-id))
      {:worktree-id worktree-id}

      :else
      {:response (text-response 400 (tru "There is no worktree {0}." value))})))

(defn- run-in-worktree
  "Runs `handler` on `request` with [[api/*worktree-id*]] and the worktree of the app DB connections bound to
  `worktree-id`."
  [worktree-id handler request respond raise]
  (binding [api/*worktree-id* worktree-id]
    (mdb/with-worktree-scope (mdb/worktree-scope worktree-id)
      (handler request respond raise))))

(defn wrap-worktree
  "Middleware that runs a request in the worktree its `X-Metabase-Worktree-Id` header names, `0` for the main app,
  which only superusers can send, or else in the worktree its user works in."
  [handler]
  (fn [request respond raise]
    (if-let [value (get-in request [:headers "x-metabase-worktree-id"])]
      (let [{:keys [worktree-id response]} (header-worktree value)]
        (if response
          (respond response)
          (run-in-worktree worktree-id handler request respond raise)))
      (run-in-worktree (:worktree-id request) handler request respond raise))))
