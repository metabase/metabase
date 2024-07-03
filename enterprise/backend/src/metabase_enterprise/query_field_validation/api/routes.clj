(ns metabase-enterprise.query-field-validation.api.routes
  (:require
   [compojure.core :refer [context defroutes]]
   [metabase-enterprise.api.routes.common :as ee.api.common]
   [metabase-enterprise.query-field-validation.api.query-validator :as query-validator]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.util.i18n :refer [deferred-tru]]))

(defn- +require-content-verification [handler]
  (ee.api.common/+require-premium-feature :query-field-validation (deferred-tru "Query Field Validation") handler))

(defroutes ^{:doc "API routes only available if we have a premium token with the `:query-field-validation` feature."}
  routes
  (context "/query-field-validation" []  (+require-content-verification (+auth query-validator/routes))))
