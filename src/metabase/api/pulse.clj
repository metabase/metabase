(ns metabase.api.pulse
  "/api/pulse endpoints."
  (:require
   [clojure.set :refer [difference]]
   [compojure.core :refer [GET POST PUT]]
   [hiccup.core :refer [html]]
   [metabase.api.alert :as api.alert]
   [metabase.api.common :as api]
   [metabase.api.common.validation :as validation]
   [metabase.email :as email]
   [metabase.integrations.slack :as slack]
   [metabase.models.card :refer [Card]]
   [metabase.models.collection :as collection]
   [metabase.models.dashboard :refer [Dashboard]]
   [metabase.models.interface :as mi]
   [metabase.models.pulse :as pulse :refer [Pulse]]
   [metabase.models.pulse-channel
    :as pulse-channel
    :refer [channel-types PulseChannel]]
   [metabase.models.pulse-channel-recipient :refer [PulseChannelRecipient]]
   [metabase.plugins.classloader :as classloader]
   [metabase.public-settings.premium-features :as premium-features]
   [metabase.pulse]
   [metabase.pulse.render :as render]
   [metabase.query-processor :as qp]
   [metabase.query-processor.middleware.permissions :as qp.perms]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.schema :as su]
   [metabase.util.urls :as urls]
   [schema.core :as s]
   [toucan.db :as db]
   [toucan.hydrate :refer [hydrate]]
   [toucan2.core :as t2])
  (:import
   (java.io ByteArrayInputStream)))

(set! *warn-on-reflection* true)

(u/ignore-exceptions (classloader/require 'metabase-enterprise.sandbox.api.util
                                          'metabase-enterprise.advanced-permissions.common))

(defn- filter-pulses-recipients
  "If the current user is sandboxed, remove all Metabase users from the `pulses` recipient lists that are not the user
  themselves. Recipients that are plain email addresses are preserved."
  [pulses]
  (if-let [segmented-user? (resolve 'metabase-enterprise.sandbox.api.util/segmented-user?)]
    (if (segmented-user?)
      (for [pulse pulses]
        (assoc pulse :channels
               (for [channel (:channels pulse)]
                 (assoc channel :recipients
                        (filter (fn [recipient] (or (not (:id recipient))
                                                    (= (:id recipient) api/*current-user-id*)))
                                (:recipients channel))))))
      pulses)
    pulses))

(defn- filter-pulse-recipients
  [pulse]
  (first (filter-pulses-recipients [pulse])))

#_{:clj-kondo/ignore [:deprecated-var]}
(api/defendpoint-schema GET "/"
  "Fetch all dashboard subscriptions. By default, returns only subscriptions for which the current user has write
  permissions. For admins, this is all subscriptions; for non-admins, it is only subscriptions that they created.

  If `dashboard_id` is specified, restricts results to subscriptions for that dashboard.

  If `can_read` is `true`, it specifically returns all subscriptions for which the current user
  created *or* is a known recipient of. Note that this is a superset of the default items returned for non-admins,
  and a subset of the default items returned for admins. This is used to power the /account/notifications page."
  [archived dashboard_id can_read]
  {archived            (s/maybe su/BooleanString)
   dashboard_id        (s/maybe su/IntGreaterThanZero)
   can_read            (s/maybe su/BooleanString)}
  (let [can-read? (Boolean/parseBoolean can_read)
        archived? (Boolean/parseBoolean archived)
        pulses    (->> (pulse/retrieve-pulses {:archived?     archived?
                                               :dashboard-id  dashboard_id
                                               :user-id       api/*current-user-id*
                                               :can-read?     can-read?})
                       (filter (if can-read? mi/can-read? mi/can-write?))
                       filter-pulses-recipients)]
    (hydrate pulses :can_write)))

(defn check-card-read-permissions
  "Users can only create a pulse for `cards` they have access to."
  [cards]
  (doseq [card cards
          :let [card-id (u/the-id card)]]
    (assert (integer? card-id))
    (api/read-check Card card-id)))

#_{:clj-kondo/ignore [:deprecated-var]}
(api/defendpoint-schema POST "/"
  "Create a new `Pulse`."
  [:as {{:keys [name cards channels skip_if_empty collection_id collection_position dashboard_id parameters]} :body}]
  {name                su/NonBlankString
   cards               (su/non-empty [pulse/CoercibleToCardRef])
   channels            (su/non-empty [su/Map])
   skip_if_empty       (s/maybe s/Bool)
   collection_id       (s/maybe su/IntGreaterThanZero)
   collection_position (s/maybe su/IntGreaterThanZero)
   dashboard_id        (s/maybe su/IntGreaterThanZero)
   parameters          [su/Map]}
  (validation/check-has-application-permission :subscription false)
  ;; make sure we are allowed to *read* all the Cards we want to put in this Pulse
  (check-card-read-permissions cards)
  ;; if we're trying to create this Pulse inside a Collection, and it is not a dashboard subscription,
  ;; make sure we have write permissions for that collection
  (when-not dashboard_id
    (collection/check-write-perms-for-collection collection_id))
  ;; prohibit creating dashboard subs if the the user doesn't have at least read access for the dashboard
  (when dashboard_id
    (api/read-check Dashboard dashboard_id))
  (let [pulse-data {:name                name
                    :creator_id          api/*current-user-id*
                    :skip_if_empty       skip_if_empty
                    :collection_id       collection_id
                    :collection_position collection_position
                    :dashboard_id        dashboard_id
                    :parameters          parameters}]
    (db/transaction
      ;; Adding a new pulse at `collection_position` could cause other pulses in this collection to change position,
      ;; check that and fix it if needed
      (api/maybe-reconcile-collection-position! pulse-data)
      ;; ok, now create the Pulse
      (api/check-500
       (pulse/create-pulse! (map pulse/card->ref cards) channels pulse-data)))))

#_{:clj-kondo/ignore [:deprecated-var]}
(api/defendpoint-schema GET "/:id"
  "Fetch `Pulse` with ID."
  [id]
  (-> (api/read-check (pulse/retrieve-pulse id))
      filter-pulse-recipients
      (hydrate :can_write)))

(defn- maybe-add-recipients-for-sandboxed-users
  "Sandboxed users can't read the full recipient list for a pulse, so we need to merge in existing recipients
  before writing the pulse updates to avoid them being deleted unintentionally. We only merge in recipients that are
  Metabase users, not raw email addresses, which sandboxed users can still view and modify."
  [pulse-updates pulse-before-update]
  (if-let [segmented-user? (resolve 'metabase-enterprise.sandbox.api.util/segmented-user?)]
    (if (segmented-user?)
      (let [recipients-to-add (filter
                               (fn [{id :id}] (and id (not= id api/*current-user-id*)))
                               (:recipients (api.alert/email-channel pulse-before-update)))]
        (assoc pulse-updates :channels
               (for [channel (:channels pulse-updates)]
                 (if (= "email" (:channel_type channel))
                   (assoc channel :recipients
                          (concat (:recipients channel) recipients-to-add))
                   channel))))
      pulse-updates)
    pulse-updates))

#_{:clj-kondo/ignore [:deprecated-var]}
(api/defendpoint-schema PUT "/:id"
  "Update a Pulse with `id`."
  [id :as {{:keys [name cards channels skip_if_empty collection_id archived parameters], :as pulse-updates} :body}]
  {name          (s/maybe su/NonBlankString)
   cards         (s/maybe (su/non-empty [pulse/CoercibleToCardRef]))
   channels      (s/maybe (su/non-empty [su/Map]))
   skip_if_empty (s/maybe s/Bool)
   collection_id (s/maybe su/IntGreaterThanZero)
   archived      (s/maybe s/Bool)
   parameters    [su/Map]}
  ;; do various perms checks
  (try
   (validation/check-has-application-permission :monitoring)
   (catch clojure.lang.ExceptionInfo _e
     (validation/check-has-application-permission :subscription false)))

  (let [pulse-before-update (api/write-check (pulse/retrieve-pulse id))]
    (check-card-read-permissions cards)
    (collection/check-allowed-to-change-collection pulse-before-update pulse-updates)

    ;; if advanced-permissions is enabled, only superuser or non-admin with subscription permission can
    ;; update pulse's recipients
    (when (premium-features/enable-advanced-permissions?)
      (let [to-add-recipients (difference (set (map :id (:recipients (api.alert/email-channel pulse-updates))))
                                          (set (map :id (:recipients (api.alert/email-channel pulse-before-update)))))
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

    (let [pulse-updates (maybe-add-recipients-for-sandboxed-users pulse-updates pulse-before-update)]
      (db/transaction
       ;; If the collection or position changed with this update, we might need to fixup the old and/or new collection,
       ;; depending on what changed.
       (api/maybe-reconcile-collection-position! pulse-before-update pulse-updates)
       ;; ok, now update the Pulse
       (pulse/update-pulse!
        (assoc (select-keys pulse-updates [:name :cards :channels :skip_if_empty :collection_id :collection_position
                                           :archived :parameters])
               :id id)))))
  ;; return updated Pulse
  (pulse/retrieve-pulse id))

#_{:clj-kondo/ignore [:deprecated-var]}
(api/defendpoint-schema GET "/form_input"
  "Provides relevant configuration information and user choices for creating/updating Pulses."
  []
  (validation/check-has-application-permission :subscription false)
  (let [chan-types (-> channel-types
                       (assoc-in [:slack :configured] (slack/slack-configured?))
                       (assoc-in [:email :configured] (email/email-configured?)))]
    {:channels (cond
                 (when-let [segmented-user? (resolve 'metabase-enterprise.sandbox.api.util/segmented-user?)]
                   (segmented-user?))
                 (dissoc chan-types :slack)

                 ;; no Slack integration, so we are g2g
                 (not (get-in chan-types [:slack :configured]))
                 chan-types

                 ;; if we have Slack enabled return cached channels and users
                 :else
                 (try
                   (future (slack/refresh-channels-and-usernames-when-needed!))
                   (assoc-in chan-types
                             [:slack :fields 0 :options]
                             (->> (slack/slack-cached-channels-and-usernames)
                                  :channels
                                  (map :display-name)))
                   (catch Throwable e
                     (assoc-in chan-types [:slack :error] (.getMessage e)))))}))

(defn- pulse-card-query-results
  {:arglists '([card])}
  [{query :dataset_query, card-id :id}]
  (binding [qp.perms/*card-id* card-id]
    (qp/process-query-and-save-execution!
     (assoc query
            :async? false
            :middleware {:process-viz-settings? true
                         :js-int-to-string?     false})
     {:executed-by api/*current-user-id*
      :context     :pulse
      :card-id     card-id})))

#_{:clj-kondo/ignore [:deprecated-var]}
(api/defendpoint-schema GET "/preview_card/:id"
  "Get HTML rendering of a Card with `id`."
  [id]
  (let [card   (api/read-check Card id)
        result (pulse-card-query-results card)]
    {:status 200
     :body   (html
              [:html
               [:body {:style "margin: 0;"}
                (binding [render/*include-title*   true
                          render/*include-buttons* true]
                  (render/render-pulse-card-for-display (metabase.pulse/defaulted-timezone card) card result))]])}))

#_{:clj-kondo/ignore [:deprecated-var]}
(api/defendpoint-schema GET "/preview_card_info/:id"
  "Get JSON object containing HTML rendering of a Card with `id` and other information."
  [id]
  (let [card      (api/read-check Card id)
        result    (pulse-card-query-results card)
        data      (:data result)
        card-type (render/detect-pulse-chart-type card nil data)
        card-html (html (binding [render/*include-title* true]
                          (render/render-pulse-card-for-display (metabase.pulse/defaulted-timezone card) card result)))]
    {:id              id
     :pulse_card_type card-type
     :pulse_card_html card-html
     :pulse_card_name (:name card)
     :pulse_card_url  (urls/card-url (:id card))
     :row_count       (:row_count result)
     :col_count       (count (:cols (:data result)))}))

(def ^:private preview-card-width 400)

#_{:clj-kondo/ignore [:deprecated-var]}
(api/defendpoint-schema GET "/preview_card_png/:id"
  "Get PNG rendering of a Card with `id`."
  [id]
  (let [card   (api/read-check Card id)
        result (pulse-card-query-results card)
        ba     (binding [render/*include-title* true]
                 (render/render-pulse-card-to-png (metabase.pulse/defaulted-timezone card) card result preview-card-width))]
    {:status 200, :headers {"Content-Type" "image/png"}, :body (ByteArrayInputStream. ba)}))

#_{:clj-kondo/ignore [:deprecated-var]}
(api/defendpoint-schema POST "/test"
  "Test send an unsaved pulse."
  [:as {{:keys [name cards channels skip_if_empty collection_id collection_position dashboard_id] :as body} :body}]
  {name                su/NonBlankString
   cards               (su/non-empty [pulse/CoercibleToCardRef])
   channels            (su/non-empty [su/Map])
   skip_if_empty       (s/maybe s/Bool)
   collection_id       (s/maybe su/IntGreaterThanZero)
   collection_position (s/maybe su/IntGreaterThanZero)
   dashboard_id        (s/maybe su/IntGreaterThanZero)}
  (check-card-read-permissions cards)
  ;; make sure any email addresses that are specified are allowed before sending the test Pulse.
  (doseq [channel channels]
    (pulse-channel/validate-email-domains channel))
  (metabase.pulse/send-pulse! (assoc body :creator_id api/*current-user-id*))
  {:ok true})

#_{:clj-kondo/ignore [:deprecated-var]}
(api/defendpoint-schema DELETE "/:id/subscription"
  "For users to unsubscribe themselves from a pulse subscription."
  [id]
  (api/let-404 [pulse-id (t2/select-one-pk Pulse :id id)
                pc-id    (t2/select-one-pk PulseChannel :pulse_id pulse-id :channel_type "email")
                pcr-id   (t2/select-one-pk PulseChannelRecipient :pulse_channel_id pc-id :user_id api/*current-user-id*)]
    (t2/delete! PulseChannelRecipient :id pcr-id))
  api/generic-204-no-content)

(api/define-routes)
