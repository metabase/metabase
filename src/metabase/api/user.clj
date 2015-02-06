(ns metabase.api.user)

(defn current
  "Fetch the current user."
  [{:keys [current-user]}]
  {:status 200
   :body (current-user)})
