(ns metabase.user-key-value.api
  (:require
   [malli.core :as mc]
   [malli.experimental.time.transform :as mett]
   [malli.transform :as mtx]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.lib.schema.literal]
   [metabase.user-key-value.models.user-key-value :as user-key-value]
   [metabase.user-key-value.models.user-key-value.types :as types]
   [metabase.util.malli.schema :as ms]))

(api.macros/defendpoint :put "/namespace/:namespace/key/:key"
  "Upsert a KV-pair for the user"
  [{nmspace :namespace, k :key} :- [:map
                                    [:key       ms/NonBlankString]
                                    [:namespace ms/NonBlankString]]
   _query-params
   {v :value, expires-at :expires_at} :- [:map
                                          [:value      {:optional true} :any]
                                          [:expires_at {:optional true} [:maybe :metabase.lib.schema.literal/string.datetime]]]]
  (try
    (user-key-value/put! api/*current-user-id* (mc/coerce ::types/user-key-value
                                                          {:key k
                                                           :namespace nmspace
                                                           :value v
                                                           :expires-at expires-at}
                                                          (mtx/transformer
                                                           (mtx/default-value-transformer)
                                                           (mett/time-transformer)
                                                           {:name :api-request})))
    (catch Exception e
      (when (= (:type (ex-data e))
               ::mc/coercion)
        (api/check-400 false))
      (throw e))))

(api.macros/defendpoint :get "/namespace/:namespace/key/:key"
  "Get a value for the user"
  [{nmspace :namespace, k :key} :- [:map
                                    [:key       ms/NonBlankString]
                                    [:namespace ms/NonBlankString]]]
  (user-key-value/retrieve api/*current-user-id* nmspace k))

(api.macros/defendpoint :get "/namespace/:namespace"
  "Returns all KV pairs in a given namespace for the current user"
  [{nmspace :namespace} :- [:map
                            [:namespace ms/NonBlankString]]]
  (user-key-value/retrieve-all api/*current-user-id* nmspace))

(api.macros/defendpoint :delete "/namespace/:namespace/key/:key"
  "Deletes a KV-pair for the user"
  [{nmspace :namespace, k :key}]
  (user-key-value/delete! api/*current-user-id* nmspace k))
