(ns metabase-enterprise.data-sensitivity.api
  "`/api/ee/data-sensitivity` routes: the metadata generation run routes and the AI proposal routes."
  (:require
   [metabase-enterprise.data-sensitivity.api.proposals :as api.proposals]
   [metabase-enterprise.data-sensitivity.api.runs :as api.runs]
   [metabase.api.util.handlers :as handlers]))

(def ^{:arglists '([request respond raise])} routes
  "Ring routes for the data-sensitivity API: the metadata generation run and AI proposal routes."
  (handlers/routes
   api.runs/routes
   api.proposals/routes))
