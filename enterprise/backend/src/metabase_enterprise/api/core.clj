(ns metabase-enterprise.api.core
  (:require
   [metabase-enterprise.api.routes.common]
   [potemkin :as p]))

(comment metabase-enterprise.api.routes.common/keep-me)

#_{:clj-kondo/ignore [:deprecated-var]}
(p/import-vars
 [metabase-enterprise.api.routes.common
  +require-premium-feature
  +when-premium-feature])
