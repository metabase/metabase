(ns metabase.api.user-key-value
  (:require [compojure.core :refer [GET PUT DELETE]]
            [malli.core :as mc]
            [malli.experimental.time.transform :as mett]
            [malli.transform :as mtx]
            [metabase.api.common :as api]
            [metabase.models.user-key-value :as user-key-value]
            [metabase.models.user-key-value.types :as types]
            [metabase.util.malli.schema :as ms]))

#_{:clj-kondo/ignore [:deprecated-var]}
(api/defendpoint PUT "/namespace/:namespace/key/:key"
  "Upsert a KV-pair for the user"
  [:as {{v :value
         expires_at :expires_at} :body
        {namespace :namespace
         k :key} :params}]
  {k ms/NonBlankString
   v :any
   namespace ms/NonBlankString
   expires_at [:maybe :metabase.lib.schema.literal/string.datetime]}
  (try (user-key-value/put! api/*current-user-id* (mc/coerce ::types/user-key-value
                                                             {:key k
                                                              :namespace namespace
                                                              :value v
                                                              :expires-at expires_at}
                                                             (mtx/transformer
                                                              (mtx/default-value-transformer)
                                                              (mett/time-transformer)
                                                              {:name :api-request})))
       (catch Exception e
         (when (= (:type (ex-data e))
                  ::mc/coercion)
           (api/check-400 false))
         (throw e))))

#_{:clj-kondo/ignore [:deprecated-var]}
(api/defendpoint GET "/namespace/:namespace/key/:key"
  "Get a value for the user"
  [namespace key]
  {key ms/NonBlankString
   namespace ms/NonBlankString}
  (user-key-value/retrieve api/*current-user-id* namespace key))

#_{:clj-kondo/ignore [:deprecated-var]}
(api/defendpoint GET "/namespace/:namespace"
  "Returns all KV pairs in a given namespace for the current user"
  [namespace]
  {namespace ms/NonBlankString}
  (user-key-value/retrieve-all api/*current-user-id* namespace))

#_{:clj-kondo/ignore [:deprecated-var]}
(api/defendpoint DELETE "/namespace/:namespace/key/:key"
  "Deletes a KV-pair for the user"
  [namespace key]
  (user-key-value/delete! api/*current-user-id* namespace key))

(api/define-routes)
