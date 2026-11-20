(ns ^:deprecated metabase.pulse.api.pulse
  "`/api/pulse` endpoints. These are all authenticated. For unauthenticated `/api/pulse/unsubscribe` endpoints,
  see [[metabase.pulse.api.unsubscribe]].

  Deprecated: will soon be migrated to notification APIs."
  (:require
   [medley.core :as m]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.channel.settings :as channel.settings]
   [metabase.channel.slack :as channel.slack]
   [metabase.embedding.util :as embed.util]
   [metabase.models.interface :as mi]
   [metabase.notification.core :as notification]
   [metabase.parameters.schema :as parameters.schema]
   [metabase.permissions.core :as perms]
   [metabase.pulse.db :as pulse.db]
   [metabase.pulse.models.pulse :as models.pulse]
   [metabase.pulse.models.pulse-channel :as pulse-channel]
   [metabase.pulse.schema :as pulse.schema]
   [metabase.pulse.send :as pulse.send]
   [metabase.pulse.write :as pulse.write]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;; TODO (Cam 10/28/25) -- fix this endpoint so it uses kebab-case for query parameters for consistency with the rest
;; of the REST API
;;
;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-query-params-use-kebab-case
                      :metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/"
  "Fetch all dashboard subscriptions. By default, returns only subscriptions for which the current user has write
  permissions. For admins, this is all subscriptions; for non-admins, it is only subscriptions that they created.

  If `dashboard_id` is specified, restricts results to subscriptions for that dashboard.

  If `created_or_receive` is `true`, it specifically returns all subscriptions for which the current user
  created *or* is a known recipient of. Note that this is a superset of the default items returned for non-admins,
  and a subset of the default items returned for admins. This is used to power the /account/notifications page.
  This may include subscriptions which the current user does not have collection permissions for, in which case
  some sensitive metadata (the list of cards and recipients) is stripped out."
  [_route-params
   {:keys                [archived]
    dashboard-id         :dashboard_id
    creator-or-recipient :creator_or_recipient}
   :- [:map {:closed true}
       [:archived             {:default false} [:maybe ms/BooleanValue]]
       [:dashboard_id         {:optional true} [:maybe ms/PositiveInt]]
       [:creator_or_recipient {:default false} [:maybe ms/BooleanValue]]]]
  (let [creator-or-recipient creator-or-recipient
        archived?            archived
        pulses               (->> (models.pulse/retrieve-pulses {:archived?    archived?
                                                                 :dashboard-id dashboard-id
                                                                 :user-id      (when creator-or-recipient api/*current-user-id*)})
                                  (#(if creator-or-recipient
                                      (mi/readable %)
                                      (mi/writable %)))
                                  models.pulse/maybe-filter-pulses-recipients)
        pulses               (if creator-or-recipient
                               (map models.pulse/maybe-strip-sensitive-metadata pulses)
                               pulses)]
    (mapv
     (fn [pulse]
       (update pulse :cards
               (fn [cards]
                 (mapv (fn [card] (assoc card :download_perms (case (perms/download-perms-level
                                                                     (or (:dataset_query card) (pulse.db/card-query (:id card)))
                                                                     api/*current-user-id*)
                                                                :no :none
                                                                :ten-thousand-rows :limited
                                                                :one-million-rows :full
                                                                :full :full))) cards))))
     (t2/hydrate pulses :can_write))))

(def ^:private PulseChannelRecipient
  [:map {:closed true}
   [:id    {:optional true} [:maybe ms/PositiveInt]]
   [:email {:optional true} [:maybe ms/Email]]])

(def ^:private PulseChannelDetails
  [:map {:closed true}
   [:attachment_only {:optional true} [:maybe :boolean]]
   [:include_pdf     {:optional true} [:maybe :boolean]]
   [:subject         {:optional true} [:maybe ::pulse.schema/email-subject]]
   [:channel         {:optional true} [:maybe :string]]
   [:channels        {:optional true} [:maybe :string]]
   [:channel_id      {:optional true} [:maybe :string]]
   [:emails          {:optional true} [:maybe [:sequential ms/Email]]]])

(def ^:private TestPulseChannel
  "The fields a test send reads off a channel, whose schedule it never runs on."
  [:map {:closed true}
   [:id             {:optional true}   [:maybe ms/PositiveInt]]
   [:channel_type                      ::pulse.schema/pulse-channel.channel-type]
   [:enabled        {:optional true}   [:maybe :boolean]]
   [:pulse_id       {:optional true}   [:maybe ms/PositiveInt]]
   [:channel_id     {:optional true}   [:maybe ms/PositiveInt]]
   [:details        {:optional true}   [:maybe PulseChannelDetails]]
   [:recipients     {:optional true}   [:sequential PulseChannelRecipient]]
   [:schedule_type  {:optional true}   [:maybe ::pulse.schema/pulse-channel.schedule-type]]
   [:schedule_day   {:optional true}   [:maybe ::pulse.schema/pulse-channel.schedule-day]]
   [:schedule_hour  {:optional true}   [:maybe ::pulse.schema/pulse-channel.schedule-hour]]
   [:schedule_frame {:optional true}   [:maybe ::pulse.schema/pulse-channel.schedule-frame]]])

(def ^:private PulseChannel
  "The fields [[metabase.pulse.write/create-pulse-channel!]] reads off a channel."
  (into [:map {:closed true :decode/normalize {:leave pulse.schema/check-schedule}}]
        (drop 2 TestPulseChannel)))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/"
  "Create a new `Pulse`."
  [_route-params
   _query-params
   {:keys               [name cards channels parameters]
    skip-if-empty       :skip_if_empty
    collection-id       :collection_id
    collection-position :collection_position
    dashboard-id        :dashboard_id}
   :- [:map {:closed true}
       [:name                ms/NonBlankString]
       [:cards               [:+ models.pulse/CoercibleToCardRef]]
       [:channels            [:+ PulseChannel]]
       [:skip_if_empty       {:default false} [:maybe :boolean]]
       [:collection_id       {:optional true} [:maybe ms/PositiveInt]]
       [:collection_position {:optional true} [:maybe ms/PositiveInt]]
       [:dashboard_id        {:optional true} [:maybe ms/PositiveInt]]
       [:parameters          {:optional true} [:maybe [:sequential ::parameters.schema/parameter]]]]
   request]
  (pulse.write/create-pulse-with-perm-checks!
   cards
   channels
   {:name                name
    :creator_id          api/*current-user-id*
    :skip_if_empty       skip-if-empty
    :collection_id       collection-id
    :collection_position collection-position
    :dashboard_id        dashboard-id
    :parameters          parameters
    :disable_links       (embed.util/is-modular-embedding-or-modular-embedding-sdk-request? request)}))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/:id"
  "Fetch `Pulse` with ID. If the user is a recipient of the Pulse but does not have read permissions for its collection,
  we still return it but with some sensitive metadata removed."
  [{:keys [id]} :- [:map {:closed true}
                    [:id ms/PositiveInt]]]
  (api/let-404 [pulse (models.pulse/retrieve-pulse id)]
    (api/check-403 (mi/can-read? (t2/hydrate pulse :can_read)))
    (-> pulse
        models.pulse/maybe-filter-pulse-recipients
        models.pulse/maybe-strip-sensitive-metadata
        (t2/hydrate :can_write))))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :put "/:id"
  "Update a Pulse with `id`."
  [{:keys [id]} :- [:map {:closed true}
                    [:id ms/PositiveInt]]
   _query-params
   pulse-updates :- [:map {:closed true}
                     [:name          {:optional true} [:maybe ms/NonBlankString]]
                     [:cards         {:optional true} [:maybe [:+ models.pulse/CoercibleToCardRef]]]
                     [:channels      {:optional true} [:maybe [:+ PulseChannel]]]
                     [:skip_if_empty {:default false} [:maybe :boolean]]
                     [:collection_id {:optional true} [:maybe ms/PositiveInt]]
                     [:collection_position {:optional true} [:maybe ms/PositiveInt]]
                     [:archived      {:default false} [:maybe :boolean]]
                     [:parameters    {:optional true} [:maybe [:sequential ::parameters.schema/parameter]]]]]
  (pulse.write/update-pulse-with-perm-checks! id pulse-updates))

;; TODO (Cam 10/28/25) -- fix this endpoint route to use kebab-case for consistency with the rest of our REST API
;;
;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-route-uses-kebab-case
                      :metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/form_input"
  "Provides relevant configuration information and user choices for creating/updating Pulses."
  []
  (perms/check-has-application-permission :subscription false)
  (let [chan-types (-> pulse-channel/channel-types
                       (assoc-in [:slack :configured] (channel.settings/slack-configured?))
                       (assoc-in [:email :configured] (channel.settings/email-configured?))
                       (assoc-in [:http :configured] (pulse.db/active-http-channel-exists?)))]
    {:channels (cond
                 (or (perms/sandboxed-or-impersonated-user?)
                     (some? (:tenant_id @api/*current-user*)))
                 (dissoc chan-types :slack)

                 ;; no Slack integration, so we are g2g
                 (not (get-in chan-types [:slack :configured]))
                 chan-types

                 ;; if we have Slack enabled return cached channels and users
                 :else
                 (try
                   (future (channel.slack/refresh-channels-and-usernames-when-needed!))
                   (assoc-in chan-types
                             [:slack :fields 0 :options]
                             (->> (channel.settings/slack-cached-channels-and-usernames)
                                  :channels
                                  (m/distinct-by :id)
                                  (m/distinct-by :display-name)
                                  (mapv (fn [{:keys [display-name id]}]
                                          {:displayName display-name :id id}))))
                   (catch Throwable e
                     (assoc-in chan-types [:slack :error] (.getMessage e)))))}))

(api.macros/defendpoint :post "/test" :- [:map {:closed true} [:ok [:= true]]]
  "Test send an unsaved pulse."
  [_route-params
   _query-params
   {:keys [cards channels] :as body} :- [:map {:closed true}
                                         ;; the saved subscription this is a test send of, when there is one.
                                         ;; `send-pulse!` builds the non-user unsubscribe link out of it, and the
                                         ;; email template drops the whole "Unsubscribe" footer without a link
                                         [:id                  {:optional true} [:maybe ms/PositiveInt]]
                                         [:name                ms/NonBlankString]
                                         [:cards               [:+ models.pulse/CoercibleToCardRef]]
                                         [:channels            [:+ TestPulseChannel]]
                                         [:skip_if_empty       {:default false} [:maybe :boolean]]
                                         [:disable_links       {:default false} [:maybe :boolean]]
                                         [:collection_id       {:optional true} [:maybe ms/PositiveInt]]
                                         [:collection_position {:optional true} [:maybe ms/PositiveInt]]
                                         [:dashboard_id        {:optional true} [:maybe ms/PositiveInt]]
                                         [:parameters          {:optional true} [:maybe [:sequential ::parameters.schema/parameter-with-value]]]
                                         [:alert_condition     {:optional true} [:maybe models.pulse/AlertConditions]]
                                         [:alert_first_only    {:optional true} [:maybe :boolean]]
                                         [:alert_above_goal    {:optional true} [:maybe :boolean]]]
   request]
  (perms/check-has-application-permission :subscription false)
  ;; Check permissions on cards that exist. Placeholders and iframes don't matter.
  (pulse.write/check-card-read-permissions
   (remove (fn [{:keys [id display]}]
             (and (nil? id)
                  (or (= "placeholder" display)
                      (= "iframe" display)))) cards))
  ;; make sure any email addresses that are specified are allowed before sending the test Pulse.
  (doseq [channel channels]
    (pulse-channel/validate-email-domains channel))
  (let [pulse (-> body
                  (assoc :creator_id api/*current-user-id*)
                  (assoc :disable_links
                         (embed.util/is-modular-embedding-or-modular-embedding-sdk-request? request)))]
    (notification/with-default-options {:notification/sync? true}
      (pulse.send/send-pulse! pulse)))
  {:ok true})

(api.macros/defendpoint :delete "/:id/subscription" :- ::api/generic-204-no-content
  "For users to unsubscribe themselves from a pulse subscription."
  [{:keys [id]} :- [:map {:closed true}
                    [:id ms/PositiveInt]]]
  (api/let-404 [pulse-id (pulse.db/pulse-id id)
                pc-id    (pulse.db/email-pulse-channel-id pulse-id)
                pcr-id   (pulse.db/pulse-channel-recipient-id pc-id api/*current-user-id*)]
    (binding [api/*current-user-id* nil]
      (pulse.db/delete-pulse-channel-recipient! pcr-id)))
  api/generic-204-no-content)

(def ^{:arglists '([request respond raise])} routes
  "`/api/pulse` endpoints."
  (api.macros/ns-handler *ns*))
