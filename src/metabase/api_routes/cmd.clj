(ns metabase.api-routes.cmd
  (:require
   [metabase.api-routes.routes :as routes]
   [metabase.api.docs :as api.docs]))

;; used for `yarn generate-openapi` command
#_{:clj-kondo/ignore [:clojure-lsp/unused-public-var]}
(defn generate-openapi-spec!
  "Command to generate openapi spec for api routes."
  []
  (api.docs/write-openapi-spec-to-file! routes/routes))
