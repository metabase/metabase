(ns metabase.api.notification
  "/api/notification endpoints"
  (:require
   [clojure.data :as data]
   [clojure.set :refer [difference]]
   [compojure.core :refer [DELETE GET POST PUT]]
   [medley.core :as m]
   [metabase.api.common :as api]
   [metabase.api.common.validation :as validation]
   [metabase.config :as config]
   [metabase.email :as email]
   [metabase.email.messages :as messages]
   [metabase.events :as events]
   [metabase.models.card :refer [Card]]
   [metabase.models.interface :as mi]
   [metabase.models.notification :as models.notification]
   [metabase.public-settings.premium-features :as premium-features]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))


(set! *warn-on-reflection* true)

(api/defendpoint GET "/:id"
  [id]
  {id  ms/PositiveInt}
  (-> (t2/select-one :model/Notification id)
      api/check-404
      models.notification/hydrate-notification))

(api/define-routes)
