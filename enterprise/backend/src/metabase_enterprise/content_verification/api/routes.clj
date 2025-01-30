(ns metabase-enterprise.content-verification.api.routes
  (:require
   [metabase-enterprise.api.routes.common :as ee.api.common]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.api.util.handlers :as handlers]
   [metabase.util.i18n :refer [deferred-tru]]))

(defn- +require-content-verification [handler]
  (ee.api.common/+require-premium-feature :content-verification (deferred-tru "Content verification") handler))

(def ^{:arglists '([request respond raise])} routes
  "/api/moderation-review routes. Only available if we have a premium token with the `:content-verification` feature."
  (+require-content-verification (+auth (handlers/lazy-ns-handler 'metabase-enterprise.content-verification.api.moderation-review))))
