(ns metabase.sidecar.middleware
  "Middleware for local sidecar mode that injects a synthetic superuser into every
  request. This replaces `wrap-session-key` + `wrap-current-user-info` so that the
  existing `+auth` checks (which look for `:metabase-user-id`) pass through, and
  all downstream `*current-user*` bindings work via `bind-current-user`.")

(def sidecar-user-id
  "The user ID of the sidecar superuser. Set during sidecar initialization by
  [[metabase.sidecar/ensure-sidecar-user!]]."
  (atom nil))

(defn wrap-sidecar-user
  "Ring middleware that injects the sidecar superuser into every request.
  This satisfies the `:metabase-user-id` check in `+auth` and provides
  superuser privileges for all sidecar requests."
  [handler]
  (fn [request respond raise]
    (handler (assoc request
                    :metabase-user-id @sidecar-user-id
                    :is-superuser? true
                    :is-group-manager? false)
             respond raise)))
