(ns metabase.api.user-key-value
  (:require [compojure.core :refer [GET PUT]]
            [malli.core :as mc]
            [malli.transform :as mtx]
            [metabase.api.common :as api]
            [metabase.models.user-key-value :as user-key-value]
            [metabase.models.user-key-value.types :as types]
            [metabase.util.malli.registry :as mr]
            [metabase.util.malli.schema :as ms]))

(api/defendpoint PUT "/"
  "Upsert a KV-pair for the user"
  [:as {{k :key context :context v :value} :body}]
  {k ms/NonBlankString
   v :any
   context ms/NonBlankString}
  (try (user-key-value/put! api/*current-user-id* (mc/coerce ::types/user-key-value
                                                             {:key k :context context :value v}
                                                             (mtx/transformer
                                                              (mtx/default-value-transformer)
                                                              {:name :api-request})))
       (catch Exception e
         (when (= (:type (ex-data e))
                  ::mc/coercion)
           (api/check-400 false))
         (throw e))))

(api/defendpoint GET "/"
  "Get a value for the user"
  [context key]
  (user-key-value/retrieve api/*current-user-id* context key))

(mr/resolve-schema ::types/user-key-value)

(api/define-routes)
