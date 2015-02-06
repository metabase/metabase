(ns metabase.api.user
  (:require [metabase.api.common :refer :all]))

(defn current [_]
  (with-or-404 (*current-user*)
    {:status 200
     :body (*current-user*)}))
