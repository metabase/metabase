(ns metabase.transform-testing.api
  (:require
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.transform-testing.api.transform-test-suite]))

(comment metabase.transform-testing.api.transform-test-suite/keep-me)

(def ^{:arglists '([request respond raise])} transform-test-suite-routes
  "`/api/transform-test-suite` routes."
  (api.macros/ns-handler 'metabase.transform-testing.api.transform-test-suite +auth))
