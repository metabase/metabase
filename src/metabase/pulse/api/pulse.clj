(ns ^:deprecated metabase.pulse.api.pulse
  "`/api/pulse` endpoints. These are all authenticated. For unauthenticated `/api/pulse/unsubscribe` endpoints,
  see [[metabase.pulse.api.unsubscribe]].

  Deprecated: will soon be migrated to notification APIs."
  (:require
   [clojure.set :refer [difference]]
   [hiccup.core :refer [html]]
   [hiccup.page :refer [html5]]
   [medley.core :as m]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common]
   [metabase.channel.render.core :as channel.render]
   [metabase.channel.settings :as channel.settings]
   [metabase.channel.slack :as channel.slack]
   [metabase.channel.urls :as urls]
   [metabase.classloader.core :as classloader]
   [metabase.collections.models.collection :as collection]
   [metabase.config.core :as config]
   [metabase.embedding.util :as embed.util]
   [metabase.events.core :as events]
   [metabase.models.interface :as mi]
   [metabase.notification.core :as notification]
   [metabase.permissions.core :as perms]
   [metabase.premium-features.core :as premium-features]
   [metabase.pulse.models.pulse :as models.pulse]
   [metabase.pulse.models.pulse-channel :as pulse-channel]
   [metabase.pulse.send :as pulse.send]
   [metabase.query-processor :as qp]
   [metabase.query-processor.middleware.permissions :as qp.perms]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2])
  (:import
   (java.io ByteArrayInputStream)))

(set! *warn-on-reflection* true)

(when config/ee-available?
  (classloader/require 'metabase-enterprise.sandbox.api.util
                       'metabase-enterprise.advanced-permissions.common))

(defn email-channel
  "Get email channel from an alert."
  [alert]
  (m/find-first #(= :email (keyword (:channel_type %))) (:channels alert)))

(defn- maybe-filter-pulses-recipients
  "If the current user is sandboxed, remove all Metabase users from the `pulses` recipient lists that are not the user
  themselves. Recipients that are plain email addresses are preserved.

  If the current user is not a superuser, also filters the list of recipients to remove users from a different tenant."
  [pulses]
  (cond->> pulses
    (perms/sandboxed-or-impersonated-user?)
    (map (fn [pulse]
           (assoc pulse :channels
                  (for [channel (:channels pulse)]
                    (assoc channel :recipients
                           (filter (fn [recipient]
                                     (or (not (:id recipient))
                                         (= (:id recipient) api/*current-user-id*)))
                                   (:recipients channel)))))))

    (not api/*is-superuser?*)
    (map (fn [pulse]
           (assoc pulse :channels
                  (for [channel (:channels pulse)]
                    (assoc channel :recipients
                           (filter (fn [recipient]
                                     (or (not (:id recipient))
                                         (= (:tenant_id recipient) (:tenant_id api/*current-user*))))
                                   (:recipients channel)))))))))

(defn- maybe-filter-pulse-recipients
  [pulse]
  (first (maybe-filter-pulses-recipients [pulse])))

(defn- maybe-strip-sensitive-metadata
  "If the current user does not have collection read permissions for the pulse, but can still read the pulse due to
  being the creator or a recipient, we return it with some metadata removed."
  [pulse]
  (if (mi/current-user-has-full-permissions? :read pulse)
    pulse
    (-> (dissoc pulse :cards)
        (update :channels
                (fn [channels]
                  (map #(dissoc % :recipients) channels))))))

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
                                  maybe-filter-pulses-recipients)
        pulses               (if creator-or-recipient
                               (map maybe-strip-sensitive-metadata pulses)
                               pulses)]
    (mapv
     (fn [pulse]
       (update pulse :cards
               (fn [cards]
                 (mapv (fn [card] (assoc card :download_perms (case (perms/download-perms-level
                                                                     (or (:dataset_query card) (t2/select-one-fn :dataset_query [:model/Card :dataset_query] (:id card)))
                                                                     api/*current-user-id*)
                                                                :no :none
                                                                :ten-thousand-rows :limited
                                                                :one-million-rows :full
                                                                :full :full))) cards))))
     (t2/hydrate pulses :can_write))))

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
       [:channels            [:+ :map]]
       [:skip_if_empty       {:default false} [:maybe :boolean]]
       [:collection_id       {:optional true} [:maybe ms/PositiveInt]]
       [:collection_position {:optional true} [:maybe ms/PositiveInt]]
       [:dashboard_id        {:optional true} [:maybe ms/PositiveInt]]
       [:parameters          {:optional true} [:maybe [:sequential :map]]]]
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
        maybe-filter-pulse-recipients
        maybe-strip-sensitive-metadata
        (t2/hydrate :can_write))))

(defn- maybe-add-recipients
  "Sandboxed users and users using connection impersonation can't read the full recipient list for a pulse, so we need
  to merge in existing recipients before writing the pulse updates to avoid them being deleted unintentionally. We only
  merge in recipients that are Metabase users, not raw email addresses, which these users can still view and modify."
  [pulse-updates pulse-before-update]
  (if (perms/sandboxed-or-impersonated-user?)
    (let [recipients-to-add (filter
                             (fn [{id :id}] (and id (not= id api/*current-user-id*)))
                             (:recipients (email-channel pulse-before-update)))]
      (assoc pulse-updates :channels
             (for [channel (:channels pulse-updates)]
               (if (= "email" (:channel_type channel))
                 (assoc channel :recipients
                        (concat (:recipients channel) recipients-to-add))
                 channel))))
    pulse-updates))

(defn check-card-read-permissions
  "Users can only create a pulse for `cards` they have access to."
  [cards]
  (doseq [card cards
          :let [card-id (u/the-id card)]]
    (assert (integer? card-id))
    (api/read-check :model/Card card-id)))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :put "/:id"
  "Update a Pulse with `id`."
  [{:keys [id]} :- [:map
                    [:id ms/PositiveInt]]
   _query-params
   {:keys [cards], :as pulse-updates} :- [:map
                                          [:name          {:optional true} [:maybe ms/NonBlankString]]
                                          [:cards         {:optional true} [:maybe [:+ models.pulse/CoercibleToCardRef]]]
                                          [:channels      {:optional true} [:maybe [:+ :map]]]
                                          [:skip_if_empty {:default false} [:maybe :boolean]]
                                          [:collection_id {:optional true} [:maybe ms/PositiveInt]]
                                          [:archived      {:default false} [:maybe :boolean]]
                                          [:parameters    {:optional true} [:maybe [:sequential ms/Map]]]]]
  ;; do various perms checks
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
      (let [to-add-recipients (difference (set (map :id (:recipients (email-channel pulse-updates))))
                                          (set (map :id (:recipients (email-channel pulse-before-update)))))
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
  ;; return updated Pulse
  (models.pulse/retrieve-pulse id))

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
                       (assoc-in [:http :configured] (t2/exists? :model/Channel :type :channel/http :active true)))]
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
                                  (map :display-name)))
                   (catch Throwable e
                     (assoc-in chan-types [:slack :error] (.getMessage e)))))}))

(defn- pulse-card-query-results
  {:arglists '([card])}
  [{query :dataset_query, card-id :id}]
  (binding [qp.perms/*card-id* card-id]
    (qp/process-query
     (qp/userland-query
      (assoc query
             :middleware {:process-viz-settings? true
                          :js-int-to-string?     false})
      {:executed-by api/*current-user-id*
       :context     :pulse
       :card-id     card-id}))))

;; TODO (Cam 10/28/25) -- fix this endpoint route to use kebab-case for consistency with the rest of our REST API
;;
;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-route-uses-kebab-case
                      :metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/preview_card/:id"
  "Get HTML rendering of a Card with `id`."
  [{:keys [id]} :- [:map
                    [:id ms/PositiveInt]]]
  (let [card   (api/read-check :model/Card id)
        result (pulse-card-query-results card)]
    {:status 200
     :body   (html5
              [:html
               [:body {:style "margin: 0;"}
                (channel.render/render-pulse-card-for-display (channel.render/defaulted-timezone card)
                                                              card
                                                              result
                                                              {:channel.render/include-title? true, :channel.render/include-buttons? true})]])}))

;; TODO (Cam 10/28/25) -- fix this endpoint route to use kebab-case for consistency with the rest of our REST API
;;
;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-route-uses-kebab-case
                      :metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/preview_dashboard/:id"
  "Get HTML rendering of a Dashboard with `id`.

  This endpoint relies on a custom middleware defined in `metabase.channel.render.core/style-tag-nonce-middleware` to
  allow the style tag to render properly, given our Content Security Policy setup. This middleware is attached to these
  routes at the bottom of this namespace using `metabase.api.common/define-routes`."
  [{:keys [id]} :- [:map
                    [:id ms/PositiveInt]]]
  (api/read-check :model/Dashboard id)
  {:status  200
   :headers {"Content-Type" "text/html"}
   :body    (channel.render/style-tag-from-inline-styles
             (html5
              [:head
               [:meta {:charset "utf-8"}]
               [:link {:nonce "%NONCE%" ;; this will be str/replaced by 'style-tag-nonce-middleware
                       :rel  "stylesheet"
                       :href "https://fonts.googleapis.com/css2?family=Lato:ital,wght@0,100;0,300;0,400;0,700;0,900;1,100;1,300;1,400;1,700;1,900&display=swap"}]]
              [:body [:h2 (format "Backend Artifacts Preview for Dashboard %s" id)]
               (channel.render/render-dashboard-to-html id)]))})

;; TODO (Cam 10/28/25) -- fix this endpoint route to use kebab-case for consistency with the rest of our REST API
;;
;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-route-uses-kebab-case
                      :metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/preview_card_info/:id"
  "Get JSON object containing HTML rendering of a Card with `id` and other information."
  [{:keys [id]} :- [:map
                    [:id ms/PositiveInt]]]
  (let [card      (api/read-check :model/Card id)
        result    (pulse-card-query-results card)
        data      (:data result)
        card-type (channel.render/detect-pulse-chart-type card nil data)
        card-html (html (channel.render/render-pulse-card-for-display (channel.render/defaulted-timezone card)
                                                                      card
                                                                      result
                                                                      {:channel.render/include-title? true}))]
    {:id              id
     :pulse_card_type card-type
     :pulse_card_html card-html
     :pulse_card_name (:name card)
     :pulse_card_url  (urls/card-url (:id card))
     :row_count       (:row_count result)
     :col_count       (count (:cols (:data result)))}))

(def ^:private preview-card-width 400)

;; TODO (Cam 10/28/25) -- fix this endpoint route to use kebab-case for consistency with the rest of our REST API
;;
;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-route-uses-kebab-case
                      :metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/preview_card_png/:id"
  "Get PNG rendering of a Card with `id`. Optionally specify `width` as a query parameter."
  [{:keys [id]} :- [:map
                    [:id ms/PositiveInt]]
   {:keys [width]} :- [:map
                       [:width {:optional true} [:maybe ms/PositiveInt]]]]
  (let [card   (api/read-check :model/Card id)
        result (pulse-card-query-results card)
        width  (or width preview-card-width)
        ba     (channel.render/render-pulse-card-to-png (channel.render/defaulted-timezone card)
                                                        card
                                                        result
                                                        width
                                                        {:channel.render/include-title? true})]
    {:status 200, :headers {"Content-Type" "image/png"}, :body (ByteArrayInputStream. ba)}))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/test"
  "Test send an unsaved pulse."
  [_route-params
   _query-params
   {:keys [cards channels] :as body} :- [:map
                                         [:name                ms/NonBlankString]
                                         [:cards               [:+ models.pulse/CoercibleToCardRef]]
                                         [:channels            [:+ :map]]
                                         [:skip_if_empty       {:default false} [:maybe :boolean]]
                                         [:disable_links       {:default false} [:maybe :boolean]]
                                         [:collection_id       {:optional true} [:maybe ms/PositiveInt]]
                                         [:collection_position {:optional true} [:maybe ms/PositiveInt]]
                                         [:dashboard_id        {:optional true} [:maybe ms/PositiveInt]]]
   request]
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
  (api/let-404 [pulse-id (t2/select-one-pk :model/Pulse :id id)
                pc-id    (t2/select-one-pk :model/PulseChannel :pulse_id pulse-id :channel_type "email")
                pcr-id   (t2/select-one-pk :model/PulseChannelRecipient :pulse_channel_id pc-id :user_id api/*current-user-id*)]
    (t2/delete! :model/PulseChannelRecipient :id pcr-id))
  api/generic-204-no-content)

(def ^:private ^{:arglists '([handler])} style-nonce-middleware
  (metabase.api.routes.common/wrap-middleware-for-open-api-spec-generation
   (partial channel.render/style-tag-nonce-middleware "/api/pulse/preview_dashboard")))

(def ^{:arglists '([request respond raise])} routes
  "`/api/pulse` endpoints."
  (api.macros/ns-handler *ns* style-nonce-middleware))
