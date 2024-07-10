(ns ^{:added "0.51.0"} metabase.api.channel
  "/api/channel endpoints.

  Currently only used for http channels."
  (:require
   [compojure.core :refer [DELETE GET POST PUT]]
   [metabase.api.common :as api]
   [metabase.api.common.validation :as validation]
   [metabase.channel.core :as channel]
   [metabase.models.channel :as models.channel]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(api/defendpoint GET "/"
  "Get all channels"
  [:as {{:keys [include_inactive]} :body}]
  {include_inactive [:maybe {:default false} :boolean]}
  (if include_inactive
    (t2/select :model/Channel)
    (t2/select :model/Channel :active true)))

(defn- test-channel-connection!
  "Test if a channel can be connected, throw an exception if it fails."
  [type details]
  (try
    (let [result (channel/can-connect? (models.channel/keywordize-type type) details)]
      (when-not (true? result)
        (throw (ex-info "Unable to connect channel" (merge {:status-code 400} result)))))
    (catch Exception e
      (throw (ex-info "Unable to connect channel" (merge {:status-code 400} (ex-data e)))))))

(api/defendpoint POST "/"
  "Create a channel"
  [:as {{:keys [name type active details]} :body}]
  {name    ms/NonBlankString
   type    :keyword
   details :map
   active  [:maybe {:default true} :boolean]}
  (validation/check-has-application-permission :setting)
  (test-channel-connection! (models.channel/keywordize-type type) details)
  (t2/insert-returning-instance! :model/Channel {:name    name
                                                 :type    type
                                                 :details details
                                                 :active  active}))

(api/defendpoint GET "/:id"
  "Get a channel"
  [id]
  {id ms/PositiveInt}
  (api/check-404 (t2/select-one :model/Channel id)))

(api/defendpoint PUT "/:id"
  "Update a channel"
  [id :as {{:keys [name type details active] :as body} :body}]
  {id      ms/PositiveInt
   name    [:maybe ms/NonBlankString]
   type    [:maybe :keyword]
   details [:maybe :map]
   active  [:maybe :boolean]}
  (validation/check-has-application-permission :setting)
  (let [channel-before-update (api/check-404 (t2/select-one :model/Channel id))
        details-changed? (some-> details (not= (:details channel-before-update)))
        type-changed?    (some-> type keyword (not= (:type channel-before-update)))]

    (when (or details-changed? type-changed?)
      (test-channel-connection! (or type (:type channel-before-update))
                                (or details (:details channel-before-update))))
   (t2/update! :model/Channel id body)))

(api/defendpoint POST "/test"
  "Test a channel connection"
  [:as {{:keys [type details]} :body}]
  (test-channel-connection! (models.channel/keywordize-type type) details)
  {:ok true})

(api/define-routes)
