(ns metabase-enterprise.content-verification.api.routes
  (:require
   [metabase-enterprise.api.routes.common :as ee.api.common]
   [metabase-enterprise.content-verification.api.moderation-review]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.util.i18n :refer [deferred-tru]]))

(comment metabase-enterprise.content-verification.api.moderation-review/keep-me)

(defn- +require-content-verification [handler]
  (ee.api.common/+require-premium-feature :content-verification (deferred-tru "Content verification") handler))

(def ^{:arglists '([request respond raise])} routes
  "/api/moderation-review routes. Only available if we have a premium token with the `:content-verification` feature."
  (-> (api.macros/ns-handler 'metabase-enterprise.content-verification.api.moderation-review)
      +auth
      +require-content-verification))
