(ns ^{:added "0.51.0"} metabase.api.channel
  "/api/channel endpoints.

  Currently only used for http channels."
  (:require
   [compojure.core :refer [DELETE GET POST PUT]]
   [metabase.api.common :as api]
   [metabase.api.common.validation :as validation]
   [metabase.channel.core :as channel]
   [metabase.events :as events]
   [metabase.models.interface :as mi]
   [metabase.util :as u]
   [metabase.util.i18n :refer [deferred-tru]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(defn- remove-details-if-needed
  "Remove the details field if the current user does not have write permissions for the channel."
  [channel]
  (if (mi/can-write? channel)
    channel
    (dissoc channel :details)))

#_{:clj-kondo/ignore [:deprecated-var]}
(api/defendpoint GET "/"
  "Get all channels"
  [:as {{:keys [include_inactive]} :body}]
  {include_inactive [:maybe {:default false} :boolean]}
  (map remove-details-if-needed (if include_inactive
                                  (t2/select :model/Channel)
                                  (t2/select :model/Channel :active true))))

(def ^:private ChannelType
  (mu/with-api-error-message
   [:fn {:decode/string keyword}
    #(= "channel" (namespace (keyword %)))]
   (deferred-tru "Must be a namespaced channel. E.g: channel/http")))

#_{:clj-kondo/ignore [:deprecated-var]}
(api/defendpoint POST "/"
  "Create a channel"
  [:as {{:keys [name description type active details] :as body} :body}]
  {name        ms/NonBlankString
   description [:maybe ms/NonBlankString]
   type        ChannelType
   details     :map
   active      [:maybe {:default true} :boolean]}
  (validation/check-has-application-permission :setting)
  (when (t2/exists? :model/Channel :name name)
    (throw (ex-info "Channel with that name already exists" {:status-code 409
                                                             :errors      {:name "Channel with that name already exists"}})))
  (u/prog1 (t2/insert-returning-instance! :model/Channel body)
    (events/publish-event! :event/channel-create {:object <> :user-id api/*current-user-id*})))

#_{:clj-kondo/ignore [:deprecated-var]}
(api/defendpoint GET "/:id"
  "Get a channel"
  [id]
  {id ms/PositiveInt}
  (-> (t2/select-one :model/Channel id) api/check-404 remove-details-if-needed))

#_{:clj-kondo/ignore [:deprecated-var]}
(api/defendpoint PUT "/:id"
  "Update a channel"
  [id :as {{:keys [name type description details active] :as body} :body}]
  {id          ms/PositiveInt
   name        [:maybe ms/NonBlankString]
   description [:maybe ms/NonBlankString]
   type        [:maybe ChannelType]
   details     [:maybe :map]
   active      [:maybe :boolean]}
  (validation/check-has-application-permission :setting)
  (let [channel-before-update (api/check-404 (t2/select-one :model/Channel id))]
    (t2/update! :model/Channel id body)
    (u/prog1 (t2/select-one :model/Channel id)
      (events/publish-event! :event/channel-update {:object          <>
                                                    :user-id         api/*current-user-id*
                                                    :previous-object channel-before-update}))))

(defn- test-channel-connection!
  "Test if a channel can be connected, throw an exception if it fails."
  [type details]
  (try
    (let [result (channel/can-connect? type details)]
      (if-not (true? result)
        {:status 400
         :body   {:message "Unable to connect channel"
                  :data    {:connection-result result}}}
        {:ok true}))
    (catch Exception e
      {:status 400
       :body   {:message     (ex-message e)
                :data        (ex-data e)}})))

#_{:clj-kondo/ignore [:deprecated-var]}
(api/defendpoint POST "/test"
  "Test a channel connection"
  [:as {{:keys [type details]} :body}]
  {type    ChannelType
   details :map}
  (test-channel-connection! type details))

(api/define-routes)
