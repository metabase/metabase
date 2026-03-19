(ns metabase-enterprise.transforms.api
  "EE API routes for transforms, served under `/api/ee/transforms`."
  (:require
   [metabase-enterprise.transforms-inspector.api :as inspector.api]))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/transforms` routes."
  inspector.api/routes)
