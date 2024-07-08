(ns metabase.api.channel
  "/api/channel endponts"
  (:require
   [compojure.core :refer [DELETE GET POST PUT]]
   [metabase.api.common :as api]
   [metabase.api.common.validation :as validation]
   [metabase.channel.core :as channel]
   [metabase.models.channel :as models.channel]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(api/defendpoint GET "/"
  "Get all channels"
  [_]
  (t2/select :model/Channel :active true))

(api/defendpoint POST "/"
  "Create a channel"
  [:as {{:keys [name type active details]} :body}]
  {name    ms/NonBlankString
   type    :keyword
   details :map
   active [:maybe {:default false} :boolean]}
  (validation/check-has-application-permission :setting)
  (models.channel/create-channel! {:name    name
                                   :type    type
                                   :details details
                                   :active  active}))

(api/defendpoint GET "/:id"
  "Get a channel"
  [id]
  (t2/select-one :model/Channel id))

(api/defendpoint PUT "/:id"
  "Update a channel"
  [id :as {{:keys [name type details active]} :body}]
  {id      ms/PositiveInt
   name    [:maybe ms/NonBlankString]
   type    [:maybe :keyword]
   details [:maybe :map]
   active  [:maybe {:default false} :boolean]}
  (let [channel-before-update (api/check-404 (t2/select-one :model/Channel id))]
    (when (and (some? details)
               (not= details (:details channel-before-update))
               (not (channel/can-connect? (models.channel/keywordize-type (:type details)) details)))
      (throw (ex-info (tru "Unable jo connect channel") {:status 400})))
    (t2/update! :model/Channel id {:name    name
                                   :type    type
                                   :details details
                                   :active  active})))

(api/defendpoint POST "/test"
  "Test a channel connection"
  [:as {{:keys [type details]} :body}]
  (channel/can-connect? (models.channel/keywordize-type type) details))

(api/define-routes)
