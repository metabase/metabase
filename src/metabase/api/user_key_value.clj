(ns metabase.api.user-key-value
  (:require [compojure.core :refer [GET PUT DELETE]]
            [malli.core :as mc]
            [malli.experimental.time.transform :as mett]
            [malli.transform :as mtx]
            [metabase.api.common :as api]
            [metabase.models.user-key-value :as user-key-value]
            [metabase.models.user-key-value.types :as types]
            [metabase.util.malli.registry :as mr]
            [metabase.util.malli.schema :as ms]))

(api/defendpoint PUT "/"
  "Upsert a KV-pair for the user"
  [:as {{k :key
         namespace :namespace
         v :value
         expires_at :expires_at} :body}]
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

(api/defendpoint GET "/"
  "Get a value for the user"
  [namespace key]
  {key (ms/QueryVectorOf ms/NonBlankString)
   namespace ms/NonBlankString}
  (into {}
        (for [k key]
          [k (user-key-value/retrieve api/*current-user-id* namespace k)])))

(api/defendpoint DELETE "/"
  "Deletes a KV-pair for the user"
  [:as {{k :key namespace :namespace} :body}]
  (user-key-value/delete! api/*current-user-id*
                          namespace
                          k))

(mr/resolve-schema ::types/user-key-value)

(api/define-routes)
