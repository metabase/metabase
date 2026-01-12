(ns ^{:added "0.51.0"} metabase.channel.api.channel
  "/api/channel endpoints.

  Currently only used for http channels."
  (:require
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.channel.core :as channel]
   [metabase.events.core :as events]
   [metabase.models.interface :as mi]
   [metabase.permissions.core :as perms]
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

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/"
  "Get all channels"
  [_route-params
   _query-params
   {:keys [include_inactive]} :- [:map
                                  [:include_inactive {:optional true} [:maybe {:default false} :boolean]]]]
  (->> (if include_inactive
         (t2/select :model/Channel)
         (t2/select :model/Channel :active true))
       (filter mi/can-read?)
       (map remove-details-if-needed)))

(def ^:private ChannelType
  (mu/with-api-error-message
   [:fn {:decode/string keyword}
    #(= "channel" (namespace (keyword %)))]
   (deferred-tru "Must be a namespaced channel. E.g: channel/http")))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/"
  "Create a channel"
  [_route-params
   _query-params
   {channel-name :name, :as body} :- [:map
                                      [:name        ms/NonBlankString]
                                      [:description {:optional true} [:maybe ms/NonBlankString]]
                                      [:type        ChannelType]
                                      [:details     :map]
                                      [:active      {:optional true} [:maybe {:default true} :boolean]]]]
  (perms/check-has-application-permission :setting)
  (when (t2/exists? :model/Channel :name channel-name)
    (throw (ex-info "Channel with that name already exists" {:status-code 409
                                                             :errors      {:name "Channel with that name already exists"}})))
  (u/prog1 (t2/insert-returning-instance! :model/Channel body)
    (events/publish-event! :event/channel-create {:object <> :user-id api/*current-user-id*})))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/:id"
  "Get a channel"
  [{:keys [id]} :- [:map
                    [:id ms/PositiveInt]]]
  (-> (t2/select-one :model/Channel id) api/read-check remove-details-if-needed))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :put "/:id"
  "Update a channel"
  [{:keys [id]} :- [:map
                    [:id ms/PositiveInt]]
   _query-params
   body :- [:map
            [:name        {:optional true} [:maybe ms/NonBlankString]]
            [:description {:optional true} [:maybe ms/NonBlankString]]
            [:type        {:optional true} [:maybe ChannelType]]
            [:details     {:optional true} [:maybe :map]]
            [:active      {:optional true} [:maybe :boolean]]]]
  (let [channel-before-update (api/write-check (t2/select-one :model/Channel id))]
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

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/test"
  "Test a channel connection"
  [_route-params
   _query-params
   {:keys [type details]} :- [:map
                              [:type    ChannelType]
                              [:details :map]]]
  (perms/check-has-application-permission :setting)
  (test-channel-connection! type details))
