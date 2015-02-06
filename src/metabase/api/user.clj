(ns metabase.api.user
  (:require [metabase.api.util :refer :all]))

(defn current
  "Fetch the current user."
  [{:keys [current-user]}]
  (with-or-404 current-user
    {:status 200
     :body (current-user)}))
