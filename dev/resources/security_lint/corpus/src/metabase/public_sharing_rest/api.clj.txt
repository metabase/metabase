(ns metabase.public-sharing-rest.api
  "Security-lint test example: unauthenticated public endpoints, one of which forgets the enablement check."
  (:require
   [metabase.api.macros :as api.macros]
   [metabase.public-sharing.validation :as validation]
   [toucan2.core :as t2]))

(defn- card-with-uuid [uuid]
  (validation/check-public-sharing-enabled)
  (t2/select-one :model/Card :public_uuid uuid))

(api.macros/defendpoint :get "/card/:uuid"
  "Reaches the enablement check through a helper."
  [{:keys [uuid]} _query _body]
  (card-with-uuid uuid))

(api.macros/defendpoint :get "/oembed"
  "Never reaches the enablement check."
  [_route {:keys [url]} _body]
  {:html (str "<iframe src=\"" url "\">")})
