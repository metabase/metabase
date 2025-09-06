(ns metabase-enterprise.comments.api
  "`/api/ee/comment/` routes"
  (:require
   [metabase-enterprise.comments.api.comment]
   [metabase.api.util.handlers :as handlers]))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/comment/` routes."
  (handlers/routes
   metabase-enterprise.comments.api.comment/routes))
