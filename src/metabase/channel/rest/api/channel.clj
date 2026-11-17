(ns ^{:added "0.51.0"} metabase.channel.rest.api.channel
  "/api/channel endpoints.

  Currently only used for http channels."
  (:require
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.channel.core :as channel]
   [metabase.channel.db :as channel.db]
   [metabase.channel.schema :as channel.schema]
   [metabase.models.interface :as mi]
   [metabase.util.api-error :as api-error]
   [metabase.util.i18n :refer [deferred-tru]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(defn- remove-details-if-needed
  "Remove the details field if the current user does not have write permissions for the channel."
  [channel]
  (if (mi/can-write? channel)
    (dissoc channel :can_write)
    (dissoc channel :can_write :details)))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/"
  "Get all channels"
  [_route-params
   _query-params
   {:keys [include_inactive]} :- [:map {:closed true}
                                  [:include_inactive {:optional true} [:maybe {:default false} :boolean]]]]
  (->> (if include_inactive
         (channel.db/channels)
         (channel.db/active-channels))
       (#(t2/hydrate % :can_write))
       mi/readable
       (map remove-details-if-needed)))

(def ^:private ChannelType
  (mu/with-api-error-message
   ::channel.schema/channel.type
   (deferred-tru "Must be a namespaced channel. E.g: channel/http")))

(defn- channel-body-schema
  [common-entries & {:keys [details-optional?]}]
  [:merge
   (into [:map {:closed true}] common-entries)
   (conj (channel.schema/details-by-type :details-optional? details-optional?)
         [nil [:map {:closed true}
               [:details {:optional true} [:maybe ::channel.schema/channel.details]]]])])

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/"
  "Create a channel"
  [_route-params
   _query-params
   {channel-name :name, :as body} :- (channel-body-schema
                                      [[:name        ms/NonBlankString]
                                       [:description {:optional true} [:maybe ms/NonBlankString]]
                                       [:type        ChannelType]
                                       [:active      {:optional true} [:maybe {:default true} :boolean]]])]
  (api/create-check :model/Channel body)
  (when (channel.db/channel-name-exists? channel-name)
    (throw (ex-info "Channel with that name already exists" {:status-code 409
                                                             :errors      {:name "Channel with that name already exists"}})))
  (channel.db/insert-channel! body))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/:id"
  "Get a channel"
  [{:keys [id]} :- [:map {:closed true}
                    [:id ms/PositiveInt]]]
  (-> (channel.db/channel id) (t2/hydrate :can_write) api/read-check remove-details-if-needed))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :put "/:id"
  "Update a channel"
  [{:keys [id]} :- [:map {:closed true}
                    [:id ms/PositiveInt]]
   _query-params
   body :- (channel-body-schema
            [[:name        {:optional true} [:maybe ms/NonBlankString]]
             [:description {:optional true} [:maybe ms/NonBlankString]]
             [:type        {:optional true} [:maybe ChannelType]]
             [:active      {:optional true} [:maybe :boolean]]]
            :details-optional? true)]
  (api/write-check (channel.db/channel id))
  (channel.db/update-channel! id body)
  (channel.db/channel id))

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
                :data        (api-error/response-data (ex-data e))}})))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/test"
  "Test a channel connection"
  [_route-params
   _query-params
   {:keys [type details]} :- (channel-body-schema
                              [[:type ChannelType]])]
  (api/create-check :model/Channel {:type type, :details details})
  (test-channel-connection! type details))
