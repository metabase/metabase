(ns ^:deprecated metabase.pulse.api.pulse
  "`/api/pulse` endpoints. These are all authenticated. For unauthenticated `/api/pulse/unsubscribe` endpoints,
  see [[metabase.pulse.api.unsubscribe]].

  Deprecated: will soon be migrated to notification APIs."
  (:require
   [clojure.set :refer [difference]]
   [medley.core :as m]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.channel.settings :as channel.settings]
   [metabase.channel.slack :as channel.slack]
   [metabase.classloader.core :as classloader]
   [metabase.collections.models.collection :as collection]
   [metabase.config.core :as config]
   [metabase.embedding.util :as embed.util]
   [metabase.events.core :as events]
   [metabase.models.interface :as mi]
   [metabase.notification.core :as notification]
   [metabase.parameters.schema :as parameters.schema]
   [metabase.permissions.core :as perms]
   [metabase.premium-features.core :as premium-features]
   [metabase.pulse.db :as pulse.db]
   [metabase.pulse.models.pulse :as models.pulse]
   [metabase.pulse.models.pulse-channel :as pulse-channel]
   [metabase.pulse.send :as pulse.send]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(when config/ee-available?
  (classloader/require 'metabase-enterprise.sandbox.api.util
                       'metabase-enterprise.advanced-permissions.common))

(defn email-channel
  "Get email channel from an alert."
  [alert]
  (m/find-first #(= :email (keyword (:channel_type %))) (:channels alert)))

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
   :- [:map
       [:archived             {:default false} [:maybe ms/BooleanValue]]
       [:dashboard_id         {:optional true} [:maybe ms/PositiveInt]]
       [:creator_or_recipient {:default false} [:maybe ms/BooleanValue]]]]
  (let [creator-or-recipient creator-or-recipient
        archived?            archived
        pulses               (->> (models.pulse/retrieve-pulses {:archived?    archived?
                                                                 :dashboard-id dashboard-id
                                                                 :user-id      (when creator-or-recipient api/*current-user-id*)})
                                  (filter (if creator-or-recipient mi/can-read? mi/can-write?))
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
     (pulse.db/hydrate-can-write pulses))))

(defn create-pulse-with-perm-checks!
  "Create a new Pulse with permissions checks."
  [cards channels pulse-data]
  (perms/check-has-application-permission :subscription false)
  (api/create-check :model/Pulse (assoc pulse-data :cards cards))
  (t2/with-transaction [_conn]
    ;; Adding a new pulse at `collection_position` could cause other pulses in this collection to change position,
    ;; check that and fix it if needed
    (api/maybe-reconcile-collection-position! pulse-data)
    ;; ok, now create the Pulse
    (let [pulse (api/check-500
                 (models.pulse/create-pulse! (map models.pulse/card->ref cards) channels pulse-data))]
      (events/publish-event! :event/pulse-create {:object pulse :user-id api/*current-user-id*})
      pulse)))

(def ^:private PulseChannelType
  [:enum "email" "slack" "http"])

(def ^:private PulseScheduleType
  [:enum "hourly" "daily" "weekly" "monthly"])

(def ^:private PulseScheduleDay
  [:enum "sun" "mon" "tue" "wed" "thu" "fri" "sat"])

(def ^:private PulseScheduleFrame
  [:enum "first" "mid" "last"])

(def ^:private PulseScheduleHour
  [:int {:min 0 :max 23}])

(def ^:private PulseChannelRecipient
  [:map
   [:id    {:optional true} [:maybe ms/PositiveInt]]
   [:email {:optional true} [:maybe ms/Email]]])

(def ^:private PulseChannelDetails
  [:map
   [:attachment_only {:optional true} [:maybe :boolean]]
   [:include_pdf     {:optional true} [:maybe :boolean]]
   [:channel         {:optional true} [:maybe :string]]
   [:channels        {:optional true} [:maybe :string]]
   [:channel_id      {:optional true} [:maybe :string]]
   [:emails          {:optional true} [:maybe [:sequential ms/Email]]]])

(def ^:private PulseChannel
  "The fields [[metabase.pulse.models.pulse-channel/create-pulse-channel!]] reads off a channel."
  [:map
   [:id             {:optional true}   [:maybe ms/PositiveInt]]
   [:channel_type                      PulseChannelType]
   [:enabled        {:optional true}   [:maybe :boolean]]
   [:pulse_id       {:optional true}   [:maybe ms/PositiveInt]]
   [:channel_id     {:optional true}   [:maybe ms/PositiveInt]]
   [:details        {:optional true}   [:maybe PulseChannelDetails]]
   [:recipients     {:optional true}   [:sequential PulseChannelRecipient]]
   [:schedule_type  {:optional true}   [:maybe PulseScheduleType]]
   [:schedule_day   {:optional true}   [:maybe PulseScheduleDay]]
   [:schedule_hour  {:optional true}   [:maybe PulseScheduleHour]]
   [:schedule_frame {:optional true}   [:maybe PulseScheduleFrame]]])

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
   :- [:map
       [:name                ms/NonBlankString]
       [:cards               [:+ models.pulse/CoercibleToCardRef]]
       [:channels            [:+ PulseChannel]]
       [:skip_if_empty       {:default false} [:maybe :boolean]]
       [:collection_id       {:optional true} [:maybe ms/PositiveInt]]
       [:collection_position {:optional true} [:maybe ms/PositiveInt]]
       [:dashboard_id        {:optional true} [:maybe ms/PositiveInt]]
       [:parameters          {:optional true} [:maybe [:sequential ::parameters.schema/parameter]]]]
   request]
  (create-pulse-with-perm-checks!
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
  [{:keys [id]} :- [:map
                    [:id ms/PositiveInt]]]
  (api/let-404 [pulse (models.pulse/retrieve-pulse id)]
    (api/check-403 (mi/can-read? pulse))
    (-> pulse
        models.pulse/maybe-filter-pulse-recipients
        models.pulse/maybe-strip-sensitive-metadata
        pulse.db/hydrate-can-write)))

(defn- maybe-add-recipients
  "Merge back the recipients the current user was not allowed to see before writing `pulse-updates`.

  The `:channels` submitted to an update are authoritative — [[metabase.pulse.models.pulse/update-notification-channels!]]
  deletes any recipient not present — so every recipient hidden on the read path must be restored on
  the write path, or a caller who reads a pulse and submits it back silently deletes recipients it
  never saw. Two read filters hide recipients, and each is compensated here:

  * sandboxed and connection-impersonated users see only themselves
    (see [[metabase.pulse.models.pulse/maybe-filter-pulses-recipients]]);
  * tenant-scoped users see only same-tenant users
    (see [[metabase.pulse.models.pulse/hidden-cross-tenant-recipients]]).

  Only Metabase-user recipients are merged back. Raw email addresses stay visible to these users
  under both filters, so they remain the caller's to add or remove."
  [pulse-updates pulse-before-update]
  (let [existing-recipients (:recipients (email-channel pulse-before-update))
        recipients-to-add   (concat
                             (when (perms/sandboxed-or-impersonated-user?)
                               (filter (fn [{id :id}] (and id (not= id api/*current-user-id*)))
                                       existing-recipients))
                             (models.pulse/hidden-cross-tenant-recipients existing-recipients))]
    (if (seq recipients-to-add)
      (assoc pulse-updates :channels
             (for [channel (:channels pulse-updates)]
               ;; normalize like [[email-channel]]: :channel_type is a string over REST but a
               ;; keyword when this is called directly with a hydrated pulse
               (if (= :email (keyword (:channel_type channel)))
                 (assoc channel :recipients
                        (m/distinct-by (some-fn :id :email)
                                       (concat (:recipients channel) recipients-to-add)))
                 channel)))
      pulse-updates)))

(defn check-card-read-permissions
  "Users can only create a pulse for `cards` they have access to."
  [cards]
  (doseq [card cards
          :let [card-id (u/the-id card)]]
    (assert (integer? card-id))
    (api/read-check :model/Card card-id)))

(defn update-pulse-with-perm-checks!
  "Apply `pulse-updates` to the Pulse with `id`, running the same permission checks `PUT /api/pulse/:id`
  runs: the subscription/monitoring application permission, a write check on the Pulse, read checks on
  any `:cards`, the collection-change check, and the advanced-permissions gate on adding recipients.
  Returns the updated Pulse."
  [id {:keys [cards] :as pulse-updates}]
  ;; Validate `:cards` up front so a bad card ref is a clean 400, not a 500. This fn is called
  ;; directly (e.g. from the agent API), not only through the PUT endpoint whose schema already
  ;; coerces `:cards` — without this, `check-card-read-permissions`'s `(assert (integer? card-id))`
  ;; throws a bare AssertionError (no :status-code) on a string id and surfaces as a 500.
  (when (some? cards)
    (when-not (mr/validate [:sequential models.pulse/CoercibleToCardRef] cards)
      (throw (ex-info (tru "Invalid :cards: each entry must be a card reference.")
                      {:status-code 400}))))
  (try
    (perms/check-has-application-permission :monitoring)
    (catch clojure.lang.ExceptionInfo _e
      (perms/check-has-application-permission :subscription false)))
  (let [pulse-before-update (api/write-check (models.pulse/retrieve-pulse id))]
    (check-card-read-permissions cards)
    (collection/check-allowed-to-change-collection pulse-before-update pulse-updates)
    ;; if advanced-permissions is enabled, only superuser or non-admin with subscription permission can
    ;; update pulse's recipients
    (when (premium-features/enable-advanced-permissions?)
      ;; key recipients the same way pulse-channel does: user recipients by :id, external recipients by
      ;; :email, so changes to external addresses are part of the diff too
      (let [recipient-key     (some-fn :id :email)
            to-add-recipients (difference (set (keep recipient-key (:recipients (email-channel pulse-updates))))
                                          (set (keep recipient-key (:recipients (email-channel pulse-before-update)))))
            current-user-has-application-permissions?
            (and (premium-features/enable-advanced-permissions?)
                 (resolve 'metabase-enterprise.advanced-permissions.common/current-user-has-application-permissions?))
            has-subscription-perms?
            (and current-user-has-application-permissions?
                 (current-user-has-application-permissions? :subscription))]
        (api/check (or api/*is-superuser?*
                       has-subscription-perms?
                       (empty? to-add-recipients))
                   [403 (tru "Non-admin users without subscription permissions are not allowed to add recipients")])))
    (let [pulse-updates (maybe-add-recipients pulse-updates pulse-before-update)]
      (t2/with-transaction [_conn]
        ;; If the collection or position changed with this update, we might need to fixup the old and/or new collection,
        ;; depending on what changed.
        (api/maybe-reconcile-collection-position! pulse-before-update pulse-updates)
        ;; ok, now update the Pulse
        (models.pulse/update-pulse!
         (assoc (select-keys pulse-updates [:name :cards :channels :skip_if_empty :collection_id :collection_position
                                            :archived :parameters])
                :id id)))))
  (models.pulse/retrieve-pulse id))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :put "/:id"
  "Update a Pulse with `id`."
  [{:keys [id]} :- [:map
                    [:id ms/PositiveInt]]
   _query-params
   pulse-updates :- [:map
                     [:name          {:optional true} [:maybe ms/NonBlankString]]
                     [:cards         {:optional true} [:maybe [:+ models.pulse/CoercibleToCardRef]]]
                     [:channels      {:optional true} [:maybe [:+ PulseChannel]]]
                     [:skip_if_empty {:default false} [:maybe :boolean]]
                     [:collection_id {:optional true} [:maybe ms/PositiveInt]]
                     [:collection_position {:optional true} [:maybe ms/PositiveInt]]
                     [:archived      {:default false} [:maybe :boolean]]
                     [:parameters    {:optional true} [:maybe [:sequential ::parameters.schema/parameter]]]]]
  (update-pulse-with-perm-checks! id pulse-updates))

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
                 (perms/sandboxed-or-impersonated-user?)
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

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/test"
  "Test send an unsaved pulse."
  [_route-params
   _query-params
   {:keys [cards channels] :as body} :- [:map
                                         ;; the saved subscription this is a test send of, when there is one.
                                         ;; `send-pulse!` builds the non-user unsubscribe link out of it, and the
                                         ;; email template drops the whole "Unsubscribe" footer without a link
                                         [:id                  {:optional true} [:maybe ms/PositiveInt]]
                                         [:name                ms/NonBlankString]
                                         [:cards               [:+ models.pulse/CoercibleToCardRef]]
                                         [:channels            [:+ PulseChannel]]
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
  (check-card-read-permissions
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

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :delete "/:id/subscription"
  "For users to unsubscribe themselves from a pulse subscription."
  [{:keys [id]} :- [:map
                    [:id ms/PositiveInt]]]
  (api/let-404 [pulse-id (pulse.db/pulse-id id)
                pc-id    (pulse.db/email-pulse-channel-id pulse-id)
                pcr-id   (pulse.db/pulse-channel-recipient-id pc-id api/*current-user-id*)]
    (pulse.db/delete-pulse-channel-recipient! pcr-id))
  api/generic-204-no-content)

(def ^{:arglists '([request respond raise])} routes
  "`/api/pulse` endpoints."
  (api.macros/ns-handler *ns*))
