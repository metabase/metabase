(ns metabase.server.middleware.worktree
  "Runs a request in a remote sync worktree: across every worktree while none but the default one exists, else in the
  worktree its `X-Metabase-Worktree-Id` header names, which only superusers can send, else in the one a superuser
  checked out, else in the main app."
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
  "The scope the `X-Metabase-Worktree-Id` header `value` names, `0` naming the main app, or an error response."
  [value]
  (let [worktree (some-> value parse-long remote-sync/worktree-by-id)
        worktree (when-not (:is_default worktree) worktree)]
    (cond
      (not api/*is-superuser?*) {:response (text-response 403 (tru "Only admins can choose a worktree."))}
      (= "0" value)             {:scope {:type :main}}
      worktree                  {:scope (mdb/worktree-id->scope (:id worktree))}
      :else                     {:response (text-response 400 (tru "There is no worktree {0}." value))})))

(defn- request-scope
  "The scope a request with the `X-Metabase-Worktree-Id` header `value`, or none, runs in, or an error response."
  [value]
  (cond
    (not (remote-sync/non-default-worktree-exists?)) (if value (header-scope value) {:scope {:type :all}})
    value                                            (header-scope value)
    api/*is-superuser?*                              {:scope (mdb/worktree-id->scope (remote-sync/user-worktree-id
                                                                                      api/*current-user-id*))}
    :else                                            {:scope {:type :main}}))

(defn wrap-worktree
  "Middleware that runs a request in the remote sync worktree it works in."
  [handler]
  (fn [request respond raise]
    (let [{:keys [scope response]} (request-scope (get-in request [:headers "x-metabase-worktree-id"]))]
      (if response
        (respond response)
        (mdb/with-worktree-scope scope
          (handler request respond raise))))))
