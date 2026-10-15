(ns metabase-enterprise.library-branching.api
  (:require
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]))

(set! *warn-on-reflection* true)

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/library-branching` routes."
  (api.macros/ns-handler *ns* +auth))
