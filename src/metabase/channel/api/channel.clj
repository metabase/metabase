(ns ^{:added "0.51.0"} metabase.channel.api.channel
  "/api/channel endpoints.

  Currently only used for http channels."
  (:require
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.channel.core :as channel]
   [metabase.channel.impl.email :as channel.email]
   [metabase.channel.impl.http :as channel.http]
   [metabase.channel.impl.slack :as channel.slack]
   [metabase.config.core :as config]
   [metabase.events.core :as events]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.models.interface :as mi]
   [metabase.permissions.core :as perms]
   [metabase.util :as u]
   [metabase.util.i18n :refer [deferred-tru tru]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
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

(def ^:private TestChannelDetails
  [:map
   [:return-type  [:enum "return-value" "throw"]]
   [:return-value {:optional true} :any]])

(defn- channel-body-schema
  [common-entries & {:keys [details-optional?]}]
  (let [details-entry (fn [schema]
                        (if details-optional?
                          [:details {:optional true} [:maybe schema]]
                          [:details schema]))]
    [:merge
     (into [:map] common-entries)
     (into [:multi {:decode/normalize lib.schema.common/normalize-map-no-kebab-case
                    :dispatch         (fn [m]
                                        (let [channel-type (some-> (:type m) keyword)]
                                          (when (and channel-type (= "channel" (namespace channel-type)))
                                            channel-type)))}]
           (concat
            [[:channel/http  [:map (details-entry channel.http/HTTPDetails)]]
             [:channel/email [:map [:details {:optional true} [:maybe channel.email/EmailDetails]]]]
             [:channel/slack [:map (details-entry channel.slack/SlackDetails)]]]
            (when config/is-test?
              [[:channel/metabase-test [:map (details-entry TestChannelDetails)]]])
            [[nil [:map [:details {:optional true}
                         [:maybe (into [:or]
                                       (concat
                                        (when config/is-test?
                                          [TestChannelDetails])
                                        [channel.slack/SlackDetails
                                         channel.http/HTTPDetails
                                         channel.email/EmailDetails]))]]]]]))]))

(defn- details-schema-for-type
  [channel-type]
  (condp = channel-type
    :channel/http          channel.http/HTTPDetails
    :channel/email         channel.email/EmailDetails
    :channel/slack         channel.slack/SlackDetails
    :channel/metabase-test (when config/is-test? TestChannelDetails)
    nil))

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
   body :- (channel-body-schema
            [[:name        {:optional true} [:maybe ms/NonBlankString]]
             [:description {:optional true} [:maybe ms/NonBlankString]]
             [:type        {:optional true} [:maybe ChannelType]]
             [:active      {:optional true} [:maybe :boolean]]]
            :details-optional? true)]
  (let [channel-before-update (api/write-check (t2/select-one :model/Channel id))]
    (when (and (:details body) (nil? (:type body)))
      (when-let [schema (details-schema-for-type (:type channel-before-update))]
        (when-not (mr/validate schema (:details body))
          (throw (ex-info (tru "Invalid channel details") {:status-code 400})))))
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
   {:keys [type details]} :- (channel-body-schema
                              [[:type ChannelType]])]
  (perms/check-has-application-permission :setting)
  (test-channel-connection! type details))
