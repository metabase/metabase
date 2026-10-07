(ns metabase-enterprise.api.core
  (:require
   [metabase-enterprise.api.routes.common]
   [potemkin :as p]))

(comment metabase-enterprise.api.routes.common/keep-me)

;; module facade must keep re-exporting +when-premium-feature while route-swapping callers remain
#_{:clj-kondo/ignore [:deprecated-var]}
(p/import-vars
 [metabase-enterprise.api.routes.common
  +require-premium-feature
  +when-premium-feature])
