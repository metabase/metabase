(ns metabase.server.middleware.worktree
  "Ring middleware that works a request inside the remote-sync worktree its `X-Metabase-Worktree-Id` header names.

  The client picks the worktree per request; without the header a request works in the main app. Entering a
  worktree is superuser-only, so a header from anyone else is refused rather than ignored, and a header naming no
  worktree 404s. It must run after `wrap-current-user-info`, which is what puts `:is-superuser?` on the request."
  (:require
   [metabase.app-db.worktree :as mdb.worktree]
   [metabase.remote-sync.core :as remote-sync]
   [metabase.server.middleware.exceptions :as mw.exceptions]
   [metabase.util.i18n :refer [tru]]))

(set! *warn-on-reflection* true)

(def ^:private worktree-id-header "x-metabase-worktree-id")

(defn- parse-worktree-id
  "The worktree id `header-value` names, or nil when it is not a positive integer."
  [header-value]
  (when (and header-value (re-matches #"[1-9]\d{0,17}" header-value))
    (parse-long header-value)))

(defn- request-worktree-id
  "The worktree `request` asks to work in: nil for the main app. Throws a 400 for a malformed header, a 403 when the
  requester is not a superuser, and a 404 when no worktree has the id."
  [request]
  (when-some [header-value (get-in request [:headers worktree-id-header])]
    (let [worktree-id (parse-worktree-id header-value)]
      (when-not worktree-id
        (throw (ex-info (tru "Invalid X-Metabase-Worktree-Id header: expected a positive integer.")
                        {:status-code 400})))
      (when-not (:is-superuser? request)
        (throw (ex-info (tru "You don''t have permissions to do that.")
                        {:status-code 403})))
      (remote-sync/check-worktree-exists! worktree-id)
      worktree-id)))

(defn wrap-worktree
  "Bind [[mdb.worktree/*worktree-id*]] to the worktree the request's `X-Metabase-Worktree-Id` header names."
  [handler]
  (fn [request respond raise]
    (let [[worktree-id refusal] (try
                                  [(request-worktree-id request) nil]
                                  (catch Throwable e
                                    [nil e]))]
      ;; this sits outside the API exception middleware, so a refusal becomes the API's error response here
      (if refusal
        (respond (mw.exceptions/api-exception-response refusal request))
        (mdb.worktree/with-worktree worktree-id
          (handler request respond raise))))))
