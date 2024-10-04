(ns metabase.api.user-key-value
  (:require [compojure.core :refer [GET POST]]
            [metabase.api.common :as api]
            [metabase.models.user-key-value :as user-key-value]
            [metabase.util.malli.schema :as ms]))

(api/defendpoint POST "/"
  "Upsert a KV-pair for the user"
  [:as {{k :key v :value} :body}]
  {k ms/NonBlankString
   v [:maybe ms/NonBlankString]}
  (user-key-value/insert! api/*current-user-id* k v))

(api/defendpoint GET "/"
  "Get a value for the user"
  [key]
  (user-key-value/retrieve api/*current-user-id* key))

(api/define-routes)
